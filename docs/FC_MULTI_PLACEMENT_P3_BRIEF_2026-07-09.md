# Multi-FC Inventory Placement + Demand Forecasting — P3 Brief (2026-07-09)

Companion to `FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md` (the Adaptive Fulfillment Engine, P1–P2,
BUILT). This is the **P3** layer — and it is a distinct subsystem, not a tail of AFE.

## 1. The two layers

- **Order routing (BUILT — AFE):** given stock already sits *somewhere*, pick the best single FC to
  send *this* order to. Reactive, per order.
- **Inventory placement (P3):** *before* any order, decide **how to split a production run across
  several FCs** so stock physically sits close to where it will sell. Proactive, per run.
  - **Demand forecasting** is placement's input — predict *where and how much* a product sells (by
    region, over time, seasonality) so the split is right.

This mirrors ShipBob's Inventory Placement Program and Amazon's inventory placement: distribute
stock across the network ahead of demand; per-order routing then ships from the nearest node with
stock. (Research: `FC_SELECTION_STRATEGY_BRIEF` §1.)

## 2. Why it benefits iLaunchify — with the B2B caveat

Classic benefits: lower outbound shipping cost (shorter zones to the buyer), faster delivery (lifts
the creator's conversion), fewer regional stockouts, load-leveling across FCs.

**The iLaunchify twist:** we are NOT a D2C 3PL. The creator sells on **their** channel
(Shopify/TikTok/Amazon); the channel fulfills outbound to end buyers. So placement's payoff is more
modest than for ShipBob and concentrates on: which FC the creator's channel pulls from, and the
first-leg (factory→FC) split cost. The big win is for creators at volume selling nationally.

**Near-term bonus (why P3.0 is worth building NOW):** capturing demand-by-region also improves the
*existing* AFE — the fc-scorer already has an "outbound zone profile" dimension that today has no
real signal. Real demand-by-region gives it one, and gives creators a demand map immediately.

## 3. Preconditions (why the full engine is V2)

Placement only pays off with all four: **per-FC inventory** (stock tracked by node — today
`InventoryPool` is bulk available-to-sell, not split), a **demand signal** (per-region sales history
— channel ingestion stores `shipToJson` but no queryable aggregate), a **placement/split engine**
(the "how much goes where" math + replenishment), and **volume** (multiple FCs live + months of
history + creators shipping enough to justify splitting a run). With a handful of FCs and no
history, the correct answer is what AFE already does: **single-hub, nearest eligible FC** (minimize
first-leg, don't strand split inventory).

## 4. Phased plan

- **P3.0 — Demand-by-region capture — BUILT 2026-07-09 (gates on db:push+generate):**
  `ProductDemandSignal` (product × US-state region → units/orderCount/lastOrderAt, uuid, additive);
  pure `normalizeDemandRegion` + `summarizeDemand` in `packages/orders/src/demand-signal.ts`
  (+tests, green); best-effort accumulation wired into channel-order ingestion
  (`channels/orders/ingest.ts`, cast-guarded `d('productDemandSignal')`, non-blocking). Accumulates
  the forecasting input from day one, ready to feed the AFE outbound-zone weight and a creator
  "where your buyers are" view. **Next (small, after data accrues):** surface the summary to the
  creator + optionally feed the fc-scorer zone dimension.
- **P3.1 — Per-FC inventory model:** split `InventoryPool` (or add a per-node child) so stock is
  tracked *by FC*, with stock-release/rebalance moves. Prereq for any real placement.
- **P3.2 — Demand forecasting:** turn the P3.0 signal into a forecast (recency-weighted, seasonal)
  per product × region. Only meaningful once ~months of P3.0 data exist.
- **P3.3 — Placement/split engine:** given a run quantity + the forecast + FC network, output the
  split ("2,000 Reno / 2,000 NJ / 1,000 TX"), admin-gated + explainable, mirroring AFE's pattern
  (pure engine + shadow-inert policy + award/decision log). Reuses the fc-scorer eligibility filters.

## 5. Recommendation

Build **P3.0 now** (this doc's build), then STOP until the network + data exist. P3.1–P3.3 are a
dedicated V2 effort, greenlit when: ≥3 FCs live, a creator cohort at volume, and a few months of
P3.0 demand data. Do not build a forecasting/placement engine against a cold start.
