# Routing Binding Model — owner-pinned manufacturing vs routed commodity legs

**Status:** PROPOSAL — pending Pavel lock. Amends `PRODUCTION_ORCHESTRATION.md` §2 + §5.
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
- **Owner manufacturer unavailable / declines / times out** → order to **`ON_HOLD`**
  (admin manual handling) — consistent with the cold-start escalation already shipped
  (`runAutoCancel` → ON_HOLD on timeout). Admin can nudge/extend, or cancel + refund.
  Open decision D1 below: ON_HOLD-first vs hard cancel+refund.
- **No matching downstream commodity service** → `ON_HOLD` (admin), with the failing leg
  + missing capability named in `internalNotes`. Never route to a non-matching service.
- **Null `manufacturerServiceId`** (legacy/seed products, pre-V1.1 self-builder) →
  Open decision D2: fall back to today's category match, or treat as un-routable → ON_HOLD.

---

## 5. Concrete implementation corrections (when D1–D3 are locked)
1. `findRouting`: read `Product.productTemplate` (NOT legacy `Product.template`); pin the
   manufacturer leg to `productTemplate.manufacturerServiceId`; health-check it; do not
   score/shop it.
2. Downstream legs: prefer the owner's own service of that type; else match other partners
   on the **full** capability tuple (die-line + decoration + substrate + material + MOQ +
   region), not category + die-cut alone (today's print match is too loose).
3. Keep `excludeServiceIds` reroute for downstream legs only.
4. Emit a `RoutingDecision` audit row (§7.3 of the orchestration spec) recording, per node,
   whether it was OWNER_PINNED or ROUTED, and why each candidate was gated out.
5. Update `PRODUCTION_ORCHESTRATION.md` §2/§5 to mark the manufacturing node owner-pinned in
   V1 (the generic-BOM shop-the-manufacturer path is V2 / platform-owned products).

---

## 6. Open decisions for Pavel to lock
- **D1 — owner unavailable:** ON_HOLD for admin (recommended, gentler, matches cold-start
  fix) vs immediate cancel + refund?
- **D2 — null `manufacturerServiceId`:** category-match fallback (nothing breaks today) vs
  treat null-owner as un-routable → ON_HOLD?
- **D3 — owner as default downstream provider:** do we auto-assign the owner's own
  LABEL_PRINTING / COPACKING / WAREHOUSE service when they offer it, before searching other
  partners? (Recommended yes — matches full-service reality and minimizes splitting.)
- **D4 — generic-BOM products:** confirm the "shop the manufacturer" path is V2-only
  (platform-owned commodity SKUs), explicitly out of V1.
