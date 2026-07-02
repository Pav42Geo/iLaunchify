# Logistics & fulfillment — LOCKED + BUILT (2026-07-02, Cowork)

**Spec:** `docs/LOGISTICS_AND_FULFILLMENT.md` (research + decisions L1–L9 + phased plan + checklist). Read it before touching anything logistics-shaped.

## What exists (all shipped, all admin-gated OFF via LogisticsSetting)

- **4 ship-to types:** `OrderShipToType` += HOLD_AT_MANUFACTURER (StorageAgreement lifecycle: fee snapshot, business-day grace, releases w/ decrement-at-SHIPPED, auto-close at 0) + CHANNEL_INBOUND (ChannelInboundPlan, DRAFT until SP-API). Checkout Step 4 = 4 destination cards, server-enforced gates.
- **`packages/shipping`** (prisma-free, pure suites in run-vitest-suites.mjs): classifier (mode/temp/hazmat/NMFC), CarrierServiceRule eligibility + fallback chains, EasyPost gateway (DI'd http), rate shop + firstLegMargin, tracker-webhook mapping + HMAC, dispatch doc gate (COA/SDS/logger/washout block SHIPPED), receiving checklists (SHIPPER/RECEIVER halves), cold-pack calc, storage accrual, channel-inbound gates (frozen=no channel, WFS=no temp-sensitive, FBA meltable window Oct16–Apr14, 105-day shelf floor), placement-splits optimizer.
- **FC selection:** `packages/orders/fc-selector.ts` (V1 nearest-eligible; Phase-1 filters HARD: storage class, hazmat, FDA-reg for food domains, capacity) + `fc-scorer.ts` (V1.5 weighted + rotation band; auto-activates at ≥3 eligible nodes; weights = OrderSettings fc* fields). Every award → FcAwardLog (explainability + fairness memory). Admin can override on order detail (blocked once goods moving).
- **Surfaces:** creator /settings/channels (manual seller-id + FNSKU table) + /inventory (VMI); partner ship panel (doc uploads, QC checklist, buy-label, seal/coolant), /settings/storage, /settings/shipping, /inbound queue (WAREHOUSE partners); admin /logistics/{shipments,carriers,fulfillment-centers,channel-plans,settings}.
- **Webhook:** `apps/partner/api/webhooks/easypost` — forward-only dispatch echo, NEVER advances from READY (doc gate + payout can't be bypassed).

## Invariants (do not violate)

1. **Temp class + hazmat are HARD filters** — never weights, never silent fallback across classes.
2. Everything ships **build-ready, admin-gated** (LogisticsSetting; DomainSetting pattern; server-enforced).
3. Fee snapshots frozen at agreement time (legal reproducibility). Money EXECUTION (insurance, storage billing) stays behind verification checklists (docs/SHIPPING_INSURANCE_VERIFICATION.md).
4. Infant formula excluded at ENTRY POINT (Step-1 category + marketplace), not checkout.
5. FNSKU is seller-scoped → lives on ChannelProductLink, never Product.

## Blocked externally (code done up to the seam)

Amazon SP-API dev approval (→ OAuth + live inbound confirmation; "Confirm with Amazon" button ships disabled) · EasyPost account (env EASYPOST_API_KEY + EASYPOST_WEBHOOK_SECRET → flip `carrier:easypost`) · ShipBob master agreement (→ L4 FulfillmentConnector) · insurance verification pass (→ flip `insurance`) · WFS/FBT creds (→ L4 adapters).

## For Code specifically

- **FNSKU-in-dieline** is yours (Studio): `docs/HANDOFF-TO-CODE-fnsku-in-dieline.md`.
- `transitionDispatch` in @ilaunchify/orders is still a stub — logistics actions use assertDispatchTransition + txn pattern; consolidate when you implement it.
- packages/shipping types mirror Prisma enums 1:1 by hand (prisma-free) — adding an enum value means updating both.
