# Sample orders — Slice 3 handoff (checkout + credit wiring)

Pavel-locked sample policy (2026-06-10). Slices 1–2 (partner setup + marketplace
quote) and the Slice-3 **foundation** (schema + pure engines) are done. This doc
specs the remaining wiring, which touches the live **Stripe charge + Order FSM**
and so is left for a deliberate pass rather than guessed at.

See also: `MEMORY ilaunchify-sample-policy`, `apps/marketing/src/lib/sample-quote.ts`,
`packages/orders/src/sample-credit.ts`.

## What's already landed

- **Schema** (additive; run `prisma db push`, NOT `migrate dev`):
  - `ProductSampleOption` (per product, partner-set): `kind UNBRANDED|BRANDED`,
    `perFlavorCents`, `samplerSetCents`, `sampleMoq`, `maxUnitsPerFlavor`,
    `leadTimeDays`, `creditTowardFirstOrder`, `creditCapCents`, `maxPerCreatorPerPeriod`.
  - `Order.orderType OrderType @default(PRODUCTION)` + `Order.sampleKind SampleKind?`.
  - `SampleCredit` ledger (scalar FKs, no relation objects): `creatorUserId`,
    `brandId`, `productTemplateId`, `sourceOrderId @unique`, `amountCents`,
    `remainingCents`, `status AVAILABLE|APPLIED|EXPIRED|VOID`, `appliedOrderId?`,
    `expiresAt?`.
- **Pure engines** (no DB, unit-verified):
  - `quoteSample()` (marketing) — per-flavor + sampler-set, MOQ, credit cap.
  - `applySampleCredit()` / `availableSampleCreditCents()` (`@ilaunchify/orders`) —
    FIFO consumption, capped at the subtotal, ignores expired/applied/void.
- **Marketplace** `SampleOrderCard` renders the quote; its CTA is the entry point
  for task A below. **BRANDED is gated** on `dielineReady` (hardcoded `false` until
  the dieline flow, #36).

## Task A — `createSampleOrder` action (creator app)

Home: `apps/creator/src/app/(checkout)/.../sample-actions.ts` (new), called by the
marketplace `SampleOrderCard` CTA (pass productTemplate slug + kind + selection).

1. **Auth + ownership**: `requireUser`; resolve the creator's active brand.
2. **Re-quote server-side** from the DB `ProductSampleOption` (never trust client
   prices) using `quoteSample`. Reject if `errors.length` or kind disabled.
3. **BRANDED gate**: block unless the product's dieline has passed compliance
   (wire the real signal that replaces `dielineReady=false`).
4. **Abuse cap**: enforce `maxPerCreatorPerPeriod` — count this creator's existing
   SAMPLE orders for this template in the window.
5. **Create the Order** with `orderType=SAMPLE`, `sampleKind`, `subtotalCents` =
   quote subtotal, `status=PENDING_PAYMENT`. **No MOQ check** (that's the whole
   point — sampleMoq already validated in the quote). A sample routes to the
   single manufacturer service; it does **not** spawn the multi-partner dispatch
   graph — keep `aggregateApprovalStatus` out of the sample path.
6. **Charge** via the existing Stripe path (mirror the production checkout's
   `cart-actions.ts` / `webhook-handlers.ts`). On `PAID`:
   - If the option has `creditTowardFirstOrder`, **mint a `SampleCredit`**:
     `amountCents = remainingCents = min(subtotal, creditCapCents ?? subtotal)`,
     `status=AVAILABLE`, `sourceOrderId = <order>`, set `expiresAt` if you add an
     expiry policy (none today).
7. **AuditLog** every mutation (order create, credit mint) — never inline state.
8. **Labeling**: UNBRANDED samples must render **"SAMPLE — NOT FOR RESALE"** and
   carry no retail GTIN.

## Task B — apply credit at production checkout

In the production checkout (`apps/creator/src/app/(checkout)/.../cart-actions.ts`):

1. **Show available credit**: load this creator+brand+template's `SampleCredit`
   rows where `status=AVAILABLE`, call `availableSampleCreditCents()`, surface a
   "You have $X in sample credit" line in the order summary.
2. **At placement**: `applySampleCredit(productionSubtotalCents, credits)` →
   `appliedCents`. Reduce `totalCents` by `appliedCents` (credit applies to the
   production subtotal, before/after fee per Pavel's call — default: reduce the
   creator-facing total, keep the partner payout whole; confirm).
3. **Persist consumption** from `result.consumed`: for each, set
   `remainingCents=newRemainingCents`; when `fullyUsed`, set `status=APPLIED` +
   `appliedOrderId=<production order>`. Wrap in a transaction with the order
   create. AuditLog the application.
4. **Idempotency**: guard against double-applying on webhook retries (the global
   event-id dedupe from Tier 1.4).

## Open decisions for Pavel

- Credit applies to subtotal **only**, or also offsets the platform fee? (Default:
  subtotal only; partner payout unaffected.)
- Credit **expiry** (e.g. 90 days)? Today `expiresAt` is null = never.
- Does a refunded/cancelled sample **void** its credit (`status=VOID`)? (Recommended yes.)
- BRANDED `dielineReady` — wire to the dieline compliance signal when #36 lands.
