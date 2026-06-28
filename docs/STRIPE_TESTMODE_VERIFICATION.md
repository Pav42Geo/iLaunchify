# Stripe Test-Mode Verification Runbook

The pure money math is reviewed + green (see `PAYMENTS_READINESS.md`). This is the
remaining go-live gate: exercise the **execution glue** (charges, Connect transfers,
refunds, subscription webhooks) against **Stripe test mode** before any live money.

> **THE GATE:** keep `STRIPE_REFUNDS_ENABLED` unset/false until §4 passes, and
> keep `STRIPE_TRANSFERS_ENABLED` unset/false until §2b passes. Only flip each to
> `true` (still in test mode) when you reach its step, and only flip them in
> production after the whole runbook is green. Every Stripe call here carries an
> idempotency key, so re-runs are safe.

## 0. Preflight (no money, no Stripe calls)

```bash
node scripts/stripe-preflight.mjs .env.local
```

Must print **✓ Env preflight passed**. It hard-refuses a `sk_live_…` key. Also confirm:
- `stripe login` done, and `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  is running (creator app). Repeat for partner app on its port if you exercise partner webhooks.
- Local DB reachable (handlers write `Charge`/`Order`/`Refund`/`SampleCredit` rows).

**Test cards:** `4242 4242 4242 4242` (success) · `4000 0000 0000 0002` (decline) ·
`4000 0000 0000 9995` (insufficient funds). Connect: use Stripe test Express onboarding.

> Prefer **real app flows** (place an order in the running app in test mode) over
> `stripe trigger`. Triggered synthetic events lack our `metadata.ilaunchify_order_id`,
> so the handlers correctly no-op — use `stripe trigger` only for the signature/dedupe
> checks in §7.

---

## 1. Connect onboarding → `account.updated`

1. Onboard a test partner through Connect Express.
2. Webhook `account.updated` fires.

**Pass:** `User.stripeAccountStatus` becomes `PENDING` (charges/payouts not yet enabled)
→ `ACTIVE` once `payouts_enabled=true`; a disabled account → `RESTRICTED`.
(`onAccountUpdated`.)

## 2. Production order → `payment_intent.succeeded`

Place a production order in the app and pay with `4242…`.

**Expect:**
- One `Charge` row: `stripePaymentIntentId` set, `amountCents == pi.amount`,
  `applicationFeeCents == pi.application_fee_amount` (= 15% of subtotal, or the
  per-order override; floor $1).
- `Order.status = PAID`, `paidAt` set.
- **Two `OrderDispatch` rows** created (manufacturer + print) — OR the order goes
  `ON_HOLD` if no partner matches (cold-start). (`onPaymentSucceeded` → `createDispatches`.)

**Verify the fee:** `Charge.applicationFeeCents` should equal
`computeApplicationFee({ subtotalCents })` — cross-check against the `fees.test.ts` numbers.

**Idempotency:** re-deliver the event (`stripe events resend <id>`) → the handler
sees the existing `Charge` (`stripePaymentIntentId`) and returns without a duplicate.

## 2b. Partner payout — the OTHER money gate (`executePendingTransfers` + Connect transfer)

After §1 (partner ACTIVE) and §2 (order PAID, dispatches created), the partner gets
paid when they **ship** a dispatch: `shipDispatch` queues a `Transfer` row (`PENDING`,
`amountCents` = the dispatch cost). The payout itself runs from a cron.

**2b-dry (flag OFF).** With `STRIPE_TRANSFERS_ENABLED` unset, hit the cron:
`curl -X POST localhost:3003/api/cron/execute-transfers -H "Authorization: Bearer $CRON_SECRET"`.

**Pass (dry):** the response lists the queued transfer under `outcomes` with
`executed:false`; **no Stripe transfer, Transfer stays `PENDING`**.

**2b-exec (flag ON, still test mode).** Set `STRIPE_TRANSFERS_ENABLED=true`, restart,
ship a dispatch on a PAID order whose partner is ACTIVE, then hit the cron again.

**Pass (executed):**
- `stripe.transfers.create` called with idempotencyKey `transfer:<transferId>`,
  `amount == Transfer.amountCents`, `destination == partner.stripeAccountId`,
  `source_transaction` = the charge's `ch_…` (omitted if only a `pi_…` is on file).
- `Transfer.status=COMPLETED`, `stripeTransferId` + `executedAt` + `destinationStripeId` set.
- A partner whose account is **not** ACTIVE (or whose charge isn't SUCCEEDED) is
  **held** (`PENDING`, `result: held_*`) — never failed, never double-sent.

**Idempotency:** re-run the cron → the COMPLETED row is no longer PENDING (not
reconsidered); a mid-flight row claimed `EXECUTING` isn't grabbed by a second run.
On a Stripe error the row reverts to `PENDING` with `failureReason` and retries next run.

## 3. Sample order → credit mint (no production)

Place a **SAMPLE** order (orderType=SAMPLE) for a product whose `ProductSampleOption`
grants credit, with `SampleSettings.creditBackEnabled = true`. Pay.

**Pass:** a `SampleCredit` row (`status=AVAILABLE`, `remainingCents>0`, 90-day
`expiresAt`) keyed by the unique `sourceOrderId`; **no `OrderDispatch`** (samples skip
the production graph). Re-deliver → upsert on `sourceOrderId` is idempotent (no dup credit).
With `creditBackEnabled=false`, a sample is just a paid order (no credit). (`mintCreditForPaidSample`.)

## 4. Refund — THE money gate (`executeOrderRefund` + `charge.refunded`)

**4a. Dry-run first (flag OFF).** With `STRIPE_REFUNDS_ENABLED` unset, approve a
cancellation/refund on a paid order (admin Cancellations or dispute resolution).

**Pass (dry-run):** an audit row `REFUND_PLANNED` with the computed breakdown;
**no Stripe refund, no `Refund` row** (`executeOrderRefund` returns `{ executed:false, plan }`).

**4b. Execute (flag ON, still test mode).** Set `STRIPE_REFUNDS_ENABLED=true`, restart,
repeat on another paid order.

**Pass (executed):**
- `stripe.refunds.create` called with `idempotencyKey refund:<orderId>:<refundCents>`.
- One `Refund` row (`stripeRefundId`, `amountCents == plan.refundCents`, status SUCCEEDED/PENDING).
- For each `COMPLETED` transfer: a Stripe **reversal** (idempotencyKey `reverse:<refundId>:<transferId>`),
  `Transfer.status=REVERSED` + `reversedByRefundId`; not-yet-sent transfers → `Transfer.status=CANCELED`.
- One `PartnerClawback` (`PENDING_APPROVAL`) per recouped transfer.
- The `charge.refunded` webhook then sets `Order.status=REFUNDED` (only from PAID/DELIVERED/
  COMPLETED/DISPUTED — a CANCELLED order stays CANCELLED) and reconciles `Refund.status`.

**Verify the split invariant:** `Σ reversal.amountCents + platformShareCents == refundCents`,
and no reversal exceeds its transfer. (This is exactly what `refund-plan.test.ts` proves;
confirm the live numbers match.)

**Idempotency:** resend `charge.refunded` → `Refund` status updates are idempotent,
no duplicate `Order` flip.

## 5. Tier subscription (`checkout.session.completed` → updated → deleted)

1. Upgrade a creator (Maker→Builder/Agency) via the Stripe-hosted Checkout (mode=subscription).
2. `checkout.session.completed` (metadata `ilaunchify_kind=tier`, `payment_status=paid`).

**Pass:** `CreatorProfile.stripeTierSubscriptionId` + `tierCurrentPeriodEnd` set;
tier flipped via `setCreatorTierWithAudit` → audit `CREATOR_TIER_CHANGE`, `actorRole=SYSTEM`.
Re-deliver → same-sub-id short-circuits (no double audit).

3. Cancel on `/settings/plan` → `customer.subscription.updated` → `tierCancelAtPeriodEnd=true`
   mirrored (tier NOT yet changed).
4. At period end `customer.subscription.deleted` → tier back to `MAKER`, Stripe handles cleared.

## 6. Production subscription cycle (`invoice.payment_succeeded`)

1. Subscribe-and-save a production run. The **day-1** invoice (`billing_reason=subscription_create`)
   is ignored here (the one-time order already handled it).
2. Advance the test clock to the next cycle → `invoice.payment_succeeded` (`subscription_cycle`).

**Pass:** a new `Order` (PAID) + `OrderItem` + `Charge` from the locked `manifestSnapshot`,
`internalNotes` stamped `stripe_invoice_id:<id>` (idempotency key — resend → no dup Order);
`createDispatches` runs; `runsCompleted++`, `nextRunAt` advanced. At `totalRuns` →
Stripe subscription cancelled + `status=COMPLETED`.

## 7. Webhook security + dedupe (synthetic OK here)

- **Bad signature:** POST a body with a wrong/missing `Stripe-Signature` → route returns 4xx,
  no handler runs (`constructEvent` throws).
- **Event-id dedupe:** resend the SAME `event.id` → second delivery logs
  `webhook.duplicate_skipped` and returns `{ duplicate:true }` (the `ProcessedWebhookEvent`
  claim lost the P2002 race).
- **Retry-on-throw:** if a handler throws, the claim is released so Stripe's retry reprocesses
  (don't leave a paid-order event permanently swallowed).

---

## Go / No-Go

| # | Flow | Pass criteria | ✅ |
|---|---|---|---|
| 0 | Preflight | `stripe-preflight.mjs` ✓, test key only | ☐ |
| 1 | Connect | `stripeAccountStatus` transitions correctly | ☐ |
| 2 | Charge | Charge row + fee == 15%/override, Order PAID, 2 dispatches | ☐ |
| 2b | Partner payout | ship → Transfer PENDING; cron → COMPLETED, idempotent, inactive held | ☐ |
| 3 | Sample | SampleCredit AVAILABLE, no dispatch, idempotent | ☐ |
| 4a | Refund dry-run | REFUND_PLANNED audit, no money, no Refund row | ☐ |
| 4b | Refund execute | Refund + reversals + clawbacks; Σ invariant holds | ☐ |
| 5 | Tier sub | tier flip + mirror + downgrade on delete | ☐ |
| 6 | Production sub | cycle-2 Order idempotent; cap → COMPLETED | ☐ |
| 7 | Webhook sec | bad-sig rejected; dupe skipped; throw → retry | ☐ |

**Only after every row is ✅:** move to live keys, set `STRIPE_REFUNDS_ENABLED=true`
and `STRIPE_TRANSFERS_ENABLED=true` in production, register the live webhook
endpoints (creator + partner), and schedule the `execute-transfers` cron (every few
minutes). Keep each flag off until you've watched the first live refund reconcile and
the first live partner payout land.
