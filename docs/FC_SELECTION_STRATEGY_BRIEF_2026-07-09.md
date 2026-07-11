# Fulfillment-Center Selection Strategy — Research + Recommendation (2026-07-09)

**Question (Pavel):** how should we pick / rotate the FC for an order? Three candidate models
he named: (A) algorithm tracks eligibility + location + price and picks; (B) offer all FCs, creator
picks one; (C) offer a default by matching product requirements, creator can change for price/other
reason. Plus: build a **smart decision mechanism that adapts to the creator's behavior** (Pavel's
"delta engine" — not a literal delta computation, but a learning default).

## 1. What the major 3PLs actually do (researched 2026-07-09)

Strong convergence — **the end merchant does NOT hand-pick a fulfillment center per order.** Two
separate layers, both automated:

- **ShipBob** — per order, the algorithm auto-selects the warehouse + carrier giving the fastest
  turnaround at the best price, shipping from the location closest to the customer. Strategic
  *inventory placement* (which FCs hold stock) is driven by an AI decision engine using demand
  forecasting + historical sales by SKU. The merchant never picks the node per order.
- **Amazon FBA** — the seller **cannot** choose which FC ships an order; Amazon assigns by
  product type, regional demand, and capacity. Even "Inventory Placement" only lets you ship to
  one receive center; Amazon still splits and assigns.
- **ShipHero (3PL software)** — Multi-Warehouse Allocation is a **rules engine** (conditions →
  actions) with **warehouse priority** sorting: route to the warehouse that fills the most items,
  or reserve product lines to dedicated FCs, ranked by a priority function. Configured by the
  operator, not the end customer.
- **Flexport / Pipe17** — an orchestration engine routes each order to the optimal location by
  real-time inventory, cost, and service rules; operators tune with drag-and-drop rules.

**The universal pattern = two layers + operator-owned controls:**
1. **Inventory placement** (strategic, periodic): which FC(s) hold stock — demand-forecast driven;
   at low/no-history volume, a single hub nearest the source.
2. **Order routing** (per order, automatic): among FCs that HAVE stock and pass hard filters, pick
   the best by proximity-to-destination + cost + speed.
3. **Control lives with the operator/admin** (priority, cost weights, dedicated lines, rules) —
   never a per-order pick by the end merchant.

**Verdict on A/B/C:** **B is wrong** — no major platform lets the merchant pick a node per order;
it breaks the hidden-orchestration thesis and invites bad choices (a creator optimizing on sticker
price picks a far FC → slower, costlier delivery). The right answer is a **refined C**: a smart
auto-**default** the creator normally accepts, with the real controls at admin — i.e. functionally
A's automation, presented with C's transparency and a *constrained* override.

## 2. What iLaunchify already has (audited)

Most of the *selection* engine exists — this is not a green field:
- **`destination-options.ts`** — 4 ship-to types; the creator picks the *mode* ("Fulfillment
  center" vs hold-at-manufacturer vs ship-to-me vs channel-inbound), which is exactly the
  best-practice grain (mode, not node).
- **`fc-selector.ts` (V1)** — nearest-eligible FC when <3 candidates.
- **`fc-scorer.ts` (V1.5)** — hard eligibility (temp/hazmat/storage-class/capacity) → **weighted
  score** (first-leg cost, outbound zone profile, storage cost, capacity, SLA) → **rotation only
  inside a ~5% indifference band** (least-recently-awarded) → **SR-4 `RotationPolicy`** admin
  controls. This already mirrors ShipHero priority + ShipBob "best price/speed": optimize first,
  rotate only among near-ties. **Rotation is correctly a tie-breaker, not the driver.**
- **`LOGISTICS_AND_FULFILLMENT.md §5`** already states the principle: "the creator normally never
  picks the node (they pick 'Fulfillment center'; admin/algorithm picks WHICH)."

So the scorer's *shape* is already best-practice. The gaps are (a) inventory placement/stock
awareness, (b) the creator-behavior personalization Pavel wants, (c) a transparency surface.

## 3. Recommendation — the smart default + behavior layer ("delta engine")

**Keep the three-stage engine (eligibility → weighted score → in-band rotation) as the auto-default,
and layer creator-behavior personalization on top of the score — never a per-order manual pick.**

The decision for an order = `pick argmin over eligible FCs of:`
```
score = w_cost·firstLegCost + w_zone·outboundZoneProfile + w_storage·storageCost
      + w_capacity·capacityHeadroom + w_sla·slaRisk
      + w_behavior·creatorBehaviorPenalty        ← NEW personalization term
      (then round-robin only if the top scores tie within the indifference band)
```

**The creator-behavior layer (the "smart mechanism based on creator behavior"):** the driver is the
creator's **behavior of ordering products and what those products require as fulfillment** (Pavel).
Concretely, the engine reads the creator's product mix + order history and the *fulfillment
requirements those products carry* — storage/temp class, hazmat, dims/pallet volume, reorder cadence,
and where demand lands — and biases the default FC to the node that best serves that pattern, without
exposing a node picker. Product requirements are the hard/eligibility floor (already in the scorer);
ordering behavior is the learned re-ranking on top. Signals, cheapest → richest:
1. **Declared preference** (one toggle, set once): "optimize my fulfillment for **speed** / **cost**
   / **balanced**." Re-weights `w_cost` vs `w_sla`/`w_zone`. (This alone covers 80% and is trivial.)
2. **Revealed overrides**: if the creator has, in the constrained override, repeatedly chosen the
   cheaper-but-slower (or faster-but-pricier) alternative, nudge future defaults that way
   (`creatorBehaviorPenalty` learned from their own history — the adaptive part).
3. **Portfolio/region signal**: where the creator's demand actually lands (from channel/outbound
   data over time) tips the zone weight — the personalized analogue of ShipBob's demand-forecast
   placement.

Bounds: personalization only re-ranks **among already-eligible** FCs and only meaningfully moves
the pick **within the indifference band or a small learned margin** — it can never override a hard
filter (temp/hazmat/capacity) or strand an order. Admin owns the weight ceilings + a kill switch,
exactly like the print/FC rotation policies.

**UX (the transparency layer):** creator picks the mode → engine shows the chosen FC + a one-line
"why" ("Reno — closest to your West-Coast demand, fastest at this cost") → a single **"See other
options"** affordance reveals the ranked alternatives with the trade-off (⏱ +2 days / 💲 −$0.40) so
an override is an *informed* exception, and each override feeds signal #2. No free node grid.

## 4. Inventory placement (the second layer — scope note)

True placement (spreading stock across FCs by forecast) is a **V2** subsystem and the biggest net-new
build. For V1, iLaunchify's B2B shape simplifies it: goods go factory→FC, then the creator's OWN
channel does D2C outbound, so "nearest to buyer" is indirect — the **outbound zone profile** already
in the scorer is the right proxy, and a single-hub placement (nearest eligible FC to the manufacturer)
is the correct low/no-history default (matches ShipBob/Amazon "no history → consolidate"). Multi-FC
split placement + demand forecasting is a documented V2, not now.

## 5. Proposed build phases

- **P1 (small, mostly wiring):** declared speed/cost/balanced preference on the creator (one field)
  → `w_behavior`/weight tweak in `fc-scorer`; the "why + See other options" transparency UI on the
  fulfillment step; confirm the scorer already emits the ranked alternatives (it does). No schema
  beyond one enum column.
- **P2 (the adaptive part):** persist a lightweight `CreatorFulfillmentPreferenceSignal` (rolling
  from overrides) → the learned `creatorBehaviorPenalty`; admin weight ceilings + kill switch;
  award-log the behavior contribution for auditability (mirror PrintAwardLog / FcAwardLog).
- **P3 (V2):** true multi-FC inventory placement + demand forecasting (the ShipBob-IPP analogue).

## 6. Open questions for Pavel

1. Confirm the model: **auto-default + constrained informed override + learned behavior weight** —
   NOT a per-order free node picker. (Best practice + your hidden-orchestration thesis both say yes.)
2. Should the creator's declared preference be **per-product** or **account-wide** (or per-product
   override of an account default)? I'd default account-wide with a per-product override.
3. Is "delta engine" a distinct concept you want named as such in the schema/UI, or is it the
   internal name for this behavior-aware scorer? (Naming only — no functional impact.)
4. How much override latitude — reveal *all* eligible alternatives, or only the top ~3 within a
   cost/ETA band (so the creator can't pick a wildly suboptimal node)?

No code changed by this brief.
