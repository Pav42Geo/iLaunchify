# C2.2 build brief: the READY → production router + auto-billing

**Status:** BUILT 2026-07-22 (same day, Cowork session): all 5 work items landed;
verify on-Mac per the runbook in the session handoff (db:push + db:generate +
typecheck + `pnpm c22:report` + stub e2e). Original brief follows.

START-HERE for the C2.2 session (written 2026-07-22 at the end of the
on-demand track). Read with `ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md` (all
gates BUILT + LIVE) and `CHANNEL_MANAGEMENT_SPEC.md` §3.3/§3.5. The DB matches
the schema and the client is fresh: nothing here is dark.

## What C2.2 is

The missing middle of the channel loop: a READY ChannelOrder (ingested, gated,
optionally manual-confirm released) becomes a REAL production Order, auto-billed
to the creator's saved payment method. Ingest stops at READY today
(`channels/orders/ingest.ts:15`); `approveChannelOrder` releases holds. This
router consumes `READY && !manualConfirmRequired`.

## LOCKED decisions that bind this build

1. **Full-service single-partner (gate doc §0):** call `findRouting`, then
   `assertSinglePartnerPlan` (packages/orders/on-demand-eligibility.ts) BEFORE
   creating dispatches. CHECK 18 greps for this: any file touching channelOrder +
   findRouting must call it. Violation = park the channel order NEEDS_ATTENTION,
   never fan out.
2. **Velocity-banded pricing (§4b.5, LOCKED 2026-07-21):** price via
   `resolveTierGoodsCents(templateId, qty, 'ON_DEMAND')` but select the band by
   the creator's TRAILING 30-DAY unit volume for that product (per-order qty is
   ~1-2). Extend the tier read with a band-selection quantity distinct from the
   billed quantity, or pass `bandUnits = trailing30dUnits + orderUnits`.
   Snapshot the selection input on the order. No on-demand bands = REFUSE
   (null), never borrow the bulk curve.
3. **A sample is not a different kind of order and neither is this (PP-0d):**
   the charge flows through `computeOrderPricing`, the creator's tier fee
   applies via `resolveCreatorFeeBps`, snapshotted per the existing placeOrder
   pattern (`Order.platformFeeBps/Cents/Source`).
4. **Per-order auto-charge (channel spec LOCKED #1):** charge the SAVED method
   off-session (Stripe test mode is fine pre-verification), daily cap from
   OrderSettings, breach or charge failure => ChannelOrder ON_HOLD with reason,
   auto-recoverable next cycle. Money boundary: consumer payment stays on the
   channel; iLaunchify bills PRODUCTION only.
5. **Payment-method-on-file go-live gate (gate doc §4):** add
   `PAYMENT_METHOD_MISSING` to `pushListing`'s ON_DEMAND branch (publish/
   actions.ts) so a listing can't go LIVE without a chargeable saved method.
   Build it in this session: it's the flow-side twin of the charge.
6. **Made-to-order finish:** the dispatch consumes
   `ProductTemplate.onDemandDecorationOfferingId` (pin, or the sole candidate;
   see `onDemandDecorationCandidates` in partner build-actions). The plan is
   single-dispatch by construction (assert), decorated in-house.
7. **BULK channel orders** also route here: they DECREMENT the pool
   (RESERVATION already written at ingest; fulfillment converts to
   CHANNEL_SALE) and ship from stock: no production order. Two branches, one
   router.

## Existing rails (do not rebuild)

- Gates 1-4 + `evaluateReadiness.fullServiceBlocker` (channels order-fsm).
- `loadOnDemandEligibility` / `assertSinglePartnerPlan` / CHECK 18.
- `resolveTierGoodsCents(mode)` (checkout/tier-pricing.ts) + mode-filtered PDP.
- OnDemandEnablement (consent + capacityPerDay: enforce the daily capacity!).
- `OrderSettings` channel knobs; `applyLedgerEntry`; ChannelOrder FSM
  (READY → ROUTED → IN_FULFILLMENT → FULFILLED → CLOSED, transitions in
  @ilaunchify/channels order-fsm).
- Admin oversight: /channels/orders shows reason + production-order link col.

## Suggested order of work

1. Pure core in @ilaunchify/channels or orders: `planChannelOrderRouting`
   (branch by line mode, aggregate per product) + trailing-30-day volume reader
   (snapshot input). Vitest.
2. The router action (creator app, cron-able + "Route now" button): READY scan →
   per-order transaction: findRouting → assert → price → create Order +
   dispatch → charge → ChannelOrder ROUTED w/ productionOrderId; failures park
   with reason + audit. Idempotent (unique on channelOrderId → orderId).
3. Auto-billing: saved-method off-session PaymentIntent via @ilaunchify/payments,
   daily-cap ledger, ON_HOLD on breach/failure + notification.
4. `PAYMENT_METHOD_MISSING` gate + SellChannels copy.
5. e2e on the stub adapter: publish → sync → route → assert charge === quote;
   `pnpm mode:delta`-style delta report if anything reprices.

## Watch-outs

- Cast-guard burndown is OPTIONAL now (client is fresh); don't mix it into the
  money path commit.
- `RotationOrderContext` has no ON_DEMAND value ON PURPOSE: rotation must stay
  unreachable; don't add one.
- Capacity: `OnDemandEnablement.capacityPerDay` is partner consent, the daily
  cap is creator protection: enforce BOTH, park (don't fail) on either.
- Hot zones: coordinate with Code before touching checkout/production-actions.
