# Routing Binding Model — owner-pinned manufacturing vs routed commodity legs

**Status:** PARTIALLY LOCKED. D1 locked (cancel+refund); D2–D5 open. Amends
`PRODUCTION_ORCHESTRATION.md` §2 + §5. Priority build = delay-accept (§7); Recovery Mode
(§10) deferred to a dedicated discussion.
**Raised by:** Pavel 2026-06-14 — "the manufacturer has a specific product and specific
ingredients that may not other manufacturers can execute, so this routing might not work
properly… and even print services have to match with a specific print SERVICE."

> ⛔ Do not build or change `findRouting` / `orchestration.ts` until the open decisions
> at the bottom are locked. This note exists because routing must be planned before we
> route anything.

---

## 1. The mismatch

`PRODUCTION_ORCHESTRATION.md` §5.2 routes **every** BOM node — including the
MANUFACTURING node — by `serviceType` + capability + MOQ + score, then picks the
cheapest qualified partner. That is a **generic-BOM / commodity** product model: it
assumes any qualified manufacturer can produce the product.

The current `packages/orders/src/routing.ts` implements exactly that for the
manufacturer leg: it shops **all** ACTIVE `MANUFACTURING` services whose
`capabilities.categories[]` include the product's category, and picks the best by score.
It ignores `ProductTemplate.manufacturerServiceId` entirely. (It also reads the *legacy*
`Product.template` for the die-cut, not the *new* `Product.productTemplate` where the
owner lives — a second drift.)

**But iLaunchify V1 is an owner-product model.** A creator browses the marketplace,
picks **a specific manufacturer's product** (their recipe / formulation / process — their
IP), and customizes packaging + branding on top. The manufacturer is therefore **already
determined at product-selection time**. No other manufacturer has that recipe, sourced
those ingredients, or validated that process. Auto-routing the order to a different
category-matching manufacturer would produce a *different product* — or fail outright
because that partner never set this product up.

The codebase already half-encodes the correct principle: `declineDispatch` cancels the
order on a manufacturer decline with the comment *"recipe owner can't be rerouted, per
the orchestration thesis."* The routing **entry** point must honor the same rule.

---

## 2. The corrected model — bind per leg, don't shop the recipe

A production graph node is one of two kinds:

### A. Owner-pinned (recipe/formulation-bearing) — NOT routed
- **MANUFACTURING** (and any future node that carries the product's recipe/process).
- Bound to **`ProductTemplate.manufacturerServiceId`** — the partner who built the
  product. Fixed at product-selection time. Never scored, never rerouted.
- Validation at order time is a *health check on the owner*, not a search:
  owner service `ACTIVE` + partner `ACTIVE` + payouts enabled + MOQ covers the qty.
- If the owner fails the health check (inactive, payouts off, MOQ miss, declines, times
  out) the order **cannot be auto-fulfilled** — it goes to admin (see §4). There is no
  alternative manufacturer by definition.

### B. Routed commodity legs — bound to a SPECIFIC matching service
- **LABEL_PRINTING**, **COPACKING**, **WAREHOUSE**.
- "Commodity" only in the sense that more than one partner *can* satisfy the spec — but
  the match is to a **specific service whose capabilities exactly cover the product's
  requirements**, never a loose category match. Pavel's point: a printer must match the
  specific print service capability, not "any printer."
- **Print-leg match tuple (all must hold)** — grounded in the real schema:
  - die-line: `PartnerServiceDieCut` covers the product's die-cut / `PackagingDieline`
  - decoration method: the service supports the product's decoration (CMYK / foil / etc.)
  - substrate: `PartnerServiceSubstrate` covers the product's substrate
  - packaging material: `PartnerServicePackagingMaterial` covers the material
  - MOQ range includes the order qty; region serviceable; payouts enabled
  - (`PartnerPackagingOffering` = the container × decoration × dieline tuple a service
    actually offers — the authoritative "can this service make THIS packaging" row)
- Because many partners will NOT qualify, the candidate set is usually small. Scoring (§7)
  and `excludeServiceIds` reroute apply **here only**.

### C. The cold-start reality (important)
Most manufacturers are **full-service**: they fill **and** label **and** pack the product
they uploaded, with their own packaging. So for the typical V1 product the graph collapses
to **"the owner does every leg"** — routing is a no-op beyond pinning the owner. The order
splits to other partners **only** when the owner explicitly does not offer a downstream
leg (e.g. they manufacture but don't print). This sharply shrinks the "not enough partners"
problem: at launch the owner is self-sufficient for most products, and the only routable
gap is a missing commodity leg — which, if unmatched, parks the order for admin rather than
mis-routing it.

---

## 3. Reconciling with the BOM (§4 of the orchestration spec)
- The BOM still defines the **graph topology** (which legs exist, in what order).
- Binding changes: BOM line `serviceType = MANUFACTURING` → **resolve to the owner**, not
  a search. Downstream lines → resolve to the owner's own service of that type **if the
  owner offers it**, else search other partners by the exact capability tuple (§2B).
- The generic-BOM "shop the manufacturer" path is **not V1**. It belongs to a future
  *platform-owned generic product* class (the Mode 2/3 pooling + buffer world, where the
  platform — not a creator-chosen partner — owns a commodity SKU). Keep it explicitly out
  of V1.

---

## 4. Failure handling (no silent mis-route)
- **Owner manufacturer can't fulfill** (declines / times out / inactive / payouts-off /
  MOQ miss) → **cancel + refund** — **D1 LOCKED (Pavel 2026-06-14).** Manufacturing is
  owner-pinned and alternate-manufacturer recovery is deferred (§10), so there is no
  partner to fall back to; the creator is refunded rather than left parked indefinitely.
  Two things make this acceptable rather than harsh: (a) **delay-accept (§7)** rescues the
  most common recoverable case — "can make it, just not by the quoted date" — *before* it
  ever times out; and (b) repeated no-shows feed the **reliability/penalty model (§8)**.
  The shipped `runAutoCancel` → `ON_HOLD`-on-timeout is an interim admin-visible state until
  the auto cancel+refund is wired.
- **No matching downstream commodity service** (print / co-pack / warehouse) → `ON_HOLD`
  (admin), with the failing leg + missing capability named in `internalNotes`. Never route
  to a non-matching service.
- **Null `manufacturerServiceId`** (legacy/seed products, pre-V1.1 self-builder) →
  Open decision D2: fall back to today's category match, or treat as un-routable → ON_HOLD.

---

## 5. Concrete implementation corrections (when D1–D3 are locked)
1. `findRouting`: read `Product.productTemplate` (NOT legacy `Product.template`); pin the
   manufacturer leg to `productTemplate.manufacturerServiceId`; health-check it; do not
   score/shop it. **✅ SHIPPED 2026-06-14** — manufacturer leg is now owner-pinned (health-
   check: active service + active partner + payouts + MOQ covers qty; excluded owners or any
   failure → `NO_MANUFACTURER` → ON_HOLD/cancel per D1). Null-owner legacy products keep the
   category-match + scoring fallback (D2 conservative). The print leg still reads the legacy
   `template.dieCutTemplateId` (item 2 below, untouched — D3 open).
2. Downstream legs: prefer the owner's own service of that type; else match other partners
   on the **full** capability tuple (die-line + decoration + substrate + material + MOQ +
   region), not category + die-cut alone (today's print match is too loose).
3. Keep `excludeServiceIds` reroute for downstream legs only.
4. Emit a `RoutingDecision` audit row (§7.3 of the orchestration spec) recording, per node,
   whether it was OWNER_PINNED or ROUTED, and why each candidate was gated out.
5. Update `PRODUCTION_ORCHESTRATION.md` §2/§5 to mark the manufacturing node owner-pinned in
   V1 (the generic-BOM shop-the-manufacturer path is V2 / platform-owned products).

---

## 6. Open decisions
- **D1 — owner unavailable → cancel + refund. ✅ LOCKED (2026-06-14).** No alternate
  manufacturer in V1 (recovery deferred, §10); delay-accept (§7) + penalties (§8) cover the
  recoverable cases.
- **D2 — null `manufacturerServiceId`:** category-match fallback (nothing breaks today) vs
  treat null-owner as un-routable → ON_HOLD? *(open, low stakes)*
- **D3 — owner as default downstream provider:** auto-assign the owner's own
  LABEL_PRINTING / COPACKING / WAREHOUSE service when they offer it, before searching other
  partners? *(open — recommended yes; matches full-service reality, minimizes splitting)*
- **D4 — generic-BOM products:** confirm "shop the manufacturer" is V2-only (platform-owned
  commodity SKUs), out of V1. *(open — recommended yes)*
- **D5 — multi-flavor lead time (§9):** does each flavor add a production run (sequential)
  or run in parallel? *(open — recommended: manufacturer declares; default parallel)*

---

## 7. Delay-accept — manufacturer counter-offers a later date (PRIORITIZE)

The single highest-leverage idea from the 2026-06-14 discussion, and V1-safe (no IP,
compliance, or reroute issues — the order stays with the rightful owner-manufacturer).

**Problem it solves:** today a manufacturer who *can* make the product but not by the quoted
lead time has only "accept" or "decline" — so a pure *timing* constraint forces a decline →
lost order. That mis-models reality (they'd happily make it a week later).

**Flow:** at `PENDING_ACCEPT`, the manufacturer can choose **"Accept with a revised
delivery date"** (later than the quoted lead time, with an optional reason) →
`PENDING_CREATOR_APPROVAL` → creator **approves** (order proceeds on the revised date) or
**rejects** → `DECLINED` → cancel + refund (per D1).

**FSM addition (OrderDispatch):**
```
PENDING_ACCEPT
  → ACCEPTED                               (on-time accept, today)
  → DECLINED                               (refuse, today)
  → ACCEPTED_PENDING_DATE_APPROVAL  (NEW)  (maker proposes revisedDeadlineAt + reason)
ACCEPTED_PENDING_DATE_APPROVAL
  → ACCEPTED                               (creator approves; order deadline := revised)
  → DECLINED                               (creator rejects → cancel + refund)
```
Stamp `revisedDeadlineAt` + `delayReason` on the dispatch; notify the creator to
approve/reject; on approval, the order's promised date updates and the creator is told the
new ETA (consequence-framed, no partner name). Reduces how often D1 (cancel+refund) even
fires.

---

## 8. Reliability / penalty model (graduated, admin-in-the-loop)

Hooks already exist: `PartnerClawback` model + `OrderSettings.partnerStrikeOnCancel`.

**Punish the right behavior — not all "no"s are equal:**
| Behavior | Severity | Consequence |
|---|---|---|
| Honest **decline with reason** (e.g. "at capacity") | low | reliability note only — we *want* this over accept-then-fail |
| **Ghosting** (accept window times out, no response) | high | reliability strike (the real bad actor) |
| **Accept-then-abandon** (withdraw after accepting) | highest | strike + `PartnerClawback` fee |

**Escalation ladder (no auto-bans in V1):** reliability score → lower routing /
marketplace ranking (market-based penalty — often fairer + more effective than a ban) →
temporary "no new orders" pause → admin-reviewed suspension / de-list. Cold-start has false
positives (partners still learning), so hard actions stay admin-decided. Reward the inverse:
high-acceptance / on-time partners rank higher. Matches "operational trust > margin".

---

## 9. Lead time is quantity-tiered (already modeled — wire it up)

Concern raised: "is 500 the same lead time as 50,000?" The schema already says no:
- `ProductTemplatePricingTier.leadTimeDays` — **per quantity band** (`minQty`/`maxQty`) and
  **per `fulfillmentMode`** (bulk vs on-demand); falls through to `packaging.leadTimeDays`.
- `ProductTemplateVariant.leadTimeFirstRunDays` vs `leadTimeRepeatDays` — first run (incl.
  stability testing) vs repeat.

**Gaps (not schema):** (1) the quote/routing must read the **tier-matched** lead time (by
qty + fulfillment mode, first-run vs repeat), not a flat number; (2) **multi-flavor** rule
(D5) — sequential runs add time, parallel don't; recommend the manufacturer declares it,
default parallel (= single-flavor tier time).

**Shipped 2026-06-14:** gap (1) done for the creator-facing product-detail quote —
`PricingTierRow.leadTimeDays` threaded through `getPricingTierRows` →
`ProductDetailConfigurator` now reads the **band-matched** lead time (falls back to
packaging → template), so the displayed lead time changes with the selected quantity.
First-run-vs-repeat surfacing + multi-flavor (D5) remain open.

---

## 10. Recovery Mode — broadcast to alternate manufacturers (DEFERRED, dedicated discussion)

Pavel's idea: when the owner can't fulfill AND the product is flagged **"open to alternate
manufacturers"** (per-product, default OFF, with an "ⓘ" explainer), broadcast an **open
project inquiry** to capability-matching manufacturers, who **apply** from a "pool of
inquiries" UI; the system (or, as a premium-tier upsell, the creator) picks an accepted
offer; if none accept within **48–72 h**, cancel + refund. Doubles as manufacturer lead-gen.

**Why deferred (hard problems to resolve first):**
- **Recipe IP / copyright** — handing one manufacturer's formulation to a competitor; the
  default must be OFF and opt-in.
- **FDA label = a new legal artifact** — the label carries the *manufacturer's name +
  address* ("Manufactured by…"); a different facility changes the legal label and needs *its
  own* certifications (FDA registration, GMP, allergen controls) validated for that product.
  Not a routing swap.
- **Re-quote** — a different manufacturer has different cost + lead time vs the quote the
  creator already paid; who absorbs the delta / does the creator re-approve?
- **System-picks vs creator-picks** — default **system auto-picks** the best accepted offer
  (consequence-framed, no partner names — matches "hide the orchestration"); creator-picks
  only as a premium upsell. *(Research item.)*
- Reconciles with the thesis as a **recovery fallback**, not the default route (which stays
  orchestration, not matching).

This is essentially the V2 pooling mechanic (pool window, fairness, who-fills-it) applied to
order recovery — build on that infrastructure, not before it.
