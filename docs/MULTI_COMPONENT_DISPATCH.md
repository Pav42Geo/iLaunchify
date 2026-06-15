# Multi-component dispatch decomposition (plan)

**Status:** PROPOSAL — needs Pavel sign-off before touching `createDispatches`. Resolves the
V1 limitation flagged in `ROUTING_BINDING_MODEL.md` §11 (one PRODUCT + one LABEL dispatch).
**Scope:** decompose an order into one dispatch per real production leg, routed per component.

---

## 1. The gap

Today `createDispatches` (`packages/orders/src/routing.ts`) reads `order.items[0]` and creates
exactly **two** dispatches — one PRODUCT (manufacturer) + one LABEL (printer/self-label). That
holds for a simple product (one container + its label). It does NOT hold for:
- **Multi-component packaging** — a carton + N inner units + a seal, where components can have
  different `partnerOfferingId` / printer / die-line (e.g. a cosmetic blister inside an outer box).
- **Variety / multipack / pick-N** — multiple flavored units + an outer carton.
- **Multi-SKU orders** — `order.items` length > 1 (also unsupported; reads `[0]` only).

The data to do better already exists: **`PackagingComponent`** (per `Product`) carries `tier`
(PRIMARY/SECONDARY/TERTIARY), `role` (CONTAINER/CARTON/CLOSURE/SEAL/INSERT/LABEL/SHIPPER),
`packagingTypeId`, `decorationMethod`, `dielineId`, `partnerOfferingId` (the chosen provider),
and `parent`/`children` hierarchy. This **is** the per-order BOM — no new schema needed.

---

## 2. Proposed model

For each paid order, build the dispatch set from the product's `PackagingComponent` graph:

- **Manufacturing dispatch** — one, owner-pinned (unchanged: `ProductTemplate.manufacturerServiceId`).
- **Per decorated component → a print/decoration dispatch** — each component with
  `decorationMethod != NONE` routes to its `partnerOffering.partnerService` (the binding the
  product already chose), or self-labels to the owner when none (per §11 fix). Components that
  share a provider + die-line **collapse into one dispatch** (don't over-split).
- **Co-pack / assembly dispatch** — when the graph has a parent CARTON/SHIPPER assembling
  children (multipack/variety), one COPACKING dispatch for the assembly leg (future; needs a
  co-packer offering on the component or a default).
- **Fallback** — a product with NO components keeps today's 2-dispatch behavior (back-compat).

Each dispatch still carries its own manifest (`generateOrderManifest`) scoped to its component(s).

---

## 3. What this touches (and the risks)

1. **`createDispatches`** — replace the hard-coded 2-dispatch block with a loop over the resolved
   legs. Keep the simple-product path identical (1 manufacturer + 1 label) for back-compat.
2. **Aggregate approval** (`recomputeAggregateApprovalStatus`) — already counts N dispatches
   generically (it flips to FULLY_ACCEPTED when all are accepted-or-further), so N>2 should work,
   but must be re-verified: the order only enters fulfillment when **every** leg accepts.
3. **Cost allocation** — `estimateDispatchCosts` is naive (30%/8% of unit price). With N legs it
   needs a per-component cost split. **Open decision C1** below.
4. **Creator order view** — already renders one card per dispatch, so N gates display fine; just
   more cards. The "hide the orchestration" rule still holds (no partner names).
5. **Cold-start escalation / delay-accept / auto-cancel** — already per-dispatch, so they extend
   naturally; re-verify the ON_HOLD/cancel semantics when one of N legs fails.

---

## 4. Phasing
- **Phase 1 (bounded): ✅ SHIPPED 2026-06-14.** `createDispatches` now emits one owner-pinned
  PRODUCT dispatch + **one LABEL dispatch per DISTINCT decorated-component provider** (collapsed
  by `partnerOfferingId` → service). C1 = naive print cost split evenly across legs. Simple
  products (no decorated components with offerings) keep the exact 2-dispatch behavior. C2 (Phase
  1 default): components whose provider is inactive/payouts-off are dropped and the order self-
  labels via the findRouting fallback — never strands (ON_HOLD-for-missing-leg deferred to Phase
  2). Notifications dedupe by userId. Each LABEL dispatch currently gets the order-level manifest;
  per-component manifest scoping is a Phase-2 refinement.
- **Phase 2:** co-pack/assembly dispatch for parent-carton products (variety/multipack).
  - **2a per-component manifest scoping ✅ SHIPPED 2026-06-14** — `generateOrderManifest` adds a
    `components[]` scoped to the dispatch: a LABEL dispatch carries the decorated components whose
    chosen offering belongs to its `partnerService` (re-derived, NO schema change); self-label
    covers all decorated components; PRODUCT dispatches stay empty. `ProductionManifestView` renders
    a "Components to print" block. So each printer in a multi-component order sees exactly their
    components. 2b co-pack/assembly dispatch still pending.
- **Phase 3:** multi-SKU orders (`order.items` > 1) → repeat the whole graph per item.

---

## 5. Open decisions
- **C1 — cost split across N legs:** keep the naive %-of-unit-price per leg (V1), or derive each
  leg's cost from its component's offering price? (Recommend: naive % for Phase 1; real per-
  component pricing in Phase 2 when co-pack lands.)
- **C2 — when one of N legs has no provider and the owner can't self-do it** (e.g. a specialty
  seal nobody offers): ON_HOLD the whole order for admin (recommended) vs proceed partial?
- **C3 — Phase 1 scope:** ship per-decorated-component print legs now, or wait and do the full
  graph (incl. co-pack) in one pass? (Recommend Phase 1 now — it's the common multi-decoration
  case and low-risk; co-pack assembly is rarer and needs the offering model.)

> No `createDispatches` changes until C1–C3 are decided — it's the core order-creation path.
