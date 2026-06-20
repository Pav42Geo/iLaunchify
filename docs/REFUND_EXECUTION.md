# Refund execution

The remaining gap across the Order Settings cluster: actually moving money on a
refund. Several flows already compute *how much* to refund — they just can't execute
it yet because no `prisma.refund` writer or Stripe refund call exists. This doc
specifies the executor and marks the one irreversible line that needs review before
it's enabled.

## What's built (safe, in this commit)

`planRefund(input)` — `packages/payments/src/refund-plan.ts`, pure + golden-tested.
Given the charge, the withheld application fee, the partner transfers, and the gross
refund (e.g. from `computeCancellationOutcome`), it returns the deterministic plan:

```
{ refundCents, platformShareCents, reversals: [{transferId, amountCents, action}], partnerRecoupCents, isFullRefund }
```

- The refund is clamped to the charge amount.
- Each partner transfer is recouped in proportion to the refund.
- The platform absorbs the rounding remainder (never a partner).
- A `COMPLETED` transfer → `REVERSE`; a not-yet-sent one → `CANCEL`.

No Prisma, no Stripe — fully reviewable in isolation.

## Executor — BUILT, gated off (2026-06-20)

`executeOrderRefund(input)` — `packages/payments/src/refund-execute.ts`, exported from
the package. **Inert until `STRIPE_REFUNDS_ENABLED=true`.**

- Flag OFF (default) → computes the plan, no Stripe call, no DB write; returns
  `{ executed: false, plan }` so the caller can audit the intended refund.
- Flag ON → `stripe.refunds.create` (idempotency-keyed) → `Refund` row → per-partner
  `stripe.transfers.createReversal` (for sent transfers) / DB-cancel (for unsent) +
  `PartnerClawback` rows. Returns `{ executed: true, plan, refundId }`.
- Does NOT change `Order.status` (CANCELLED stays terminal; the refund is a separate
  record). The caller owns status + audit.

**Still to do (next, with review):** (1) wire the two call sites below to call it
(dry-run by default); (2) a `charge.refunded` / `refund.updated` webhook handler to
reconcile `Refund.status`; (3) Stripe **test-mode** end-to-end verification before
anyone sets the flag.

## Original spec — executor design

`executeOrderRefund(orderId, { reason, initiatedByUserId })`:

1. Load the `Charge` (+ `applicationFeeCents`) and its `Transfer[]`.
2. Resolve the gross refund from the triggering flow (cancellation/dispute outcome).
3. `const plan = planRefund({ chargeAmountCents, applicationFeeCents, transfers, refundCents })`.
4. In a transaction, write records FIRST (so a crash leaves a reconcilable trail):
   - `Refund` row, `status = PENDING`, `amountCents = plan.refundCents`.
   - one `PartnerClawback` (`PENDING_APPROVAL`) per partner reversal, linked to the refund.
   - mark each reversed `Transfer.reversedByRefundId`.
5. **⚠️ Irreversible — REVIEW BEFORE ENABLING.** Call Stripe with an idempotency key
   (`refund:${refundId}`):
   - `stripe.refunds.create({ charge: stripeChargeId, amount: plan.refundCents })`
   - for each `REVERSE`: `stripe.transferReversals.create(stripeTransferId, { amount })`
   - for each `CANCEL`: cancel/reduce the not-yet-executed transfer instead.
   Do this only after testing against Stripe **test mode**. The platform already has
   webhook event-id dedupe (Tier 1.4) — rely on it, don't double-refund.
6. The `charge.refunded` / `refund.updated` webhook reconciles `Refund.status` →
   `SUCCEEDED` / `FAILED` and flips the order to `REFUNDED` where appropriate.

## Call sites that will consume it

- **Admin cancellation approve** (`apps/admin/.../cancellations/actions.ts`): on
  `APPROVED`, the refund breakdown is already computed via `computeCancellationOutcome`
  + recorded in the audit. Add `executeOrderRefund` with that `refundCents`.
- **Admin dispute resolve** (`apps/admin/.../orders/[orderId]/dispute-actions.ts`):
  on `RESOLVED` in the creator's favor, execute the refund (today it just closes the
  dispute).

## Why it's gated here

Writing the `stripe.refunds.create` / `transferReversals.create` calls moves real
money and reverses real partner payouts. That belongs in a reviewed, test-mode-verified
change with a human in the loop — not shipped alongside unrelated work. The hard,
deterministic part (the amounts) is done and tested; the executor is a thin, auditable
wrapper around it.
