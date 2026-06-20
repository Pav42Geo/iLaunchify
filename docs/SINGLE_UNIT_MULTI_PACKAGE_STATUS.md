# Single unit, two packages — end-to-end status

Reference for the "supplement bottle + outer carton" shape: structurally one
saleable **SINGLE_UNIT** product whose packaging is multi-component (PRIMARY
container + SECONDARY carton). Captured 2026-06-20 after the custom-packaging
co-review work. Decision: a multi-package custom upload approves into **one
`PackagingType` carrying multiple die-lines** (not one type per package) —
simplest for partner + admin. See the layer table for where that lands.

## Where it's real today (V1)

| Layer | Status | Notes |
|---|---|---|
| Partner upload (custom packaging) | ✅ Built | One upload, multiple **label-tagged** mockups + die-lines ("Bottle", "Outer box"); panel tags on die-lines. `PackagingSystem.files[]`. |
| Admin review | ✅ Built | `ReviewQueue` shows every file with role/panel/label chips + params. |
| Admin approve | ✅ Built (2026-06-20) | Creates **one** ACTIVE `PackagingType`; promotes **all** uploaded die-lines into `PackagingDieline` rows (first carries the partner's inline frames as `PARTNER_CONFIRMED`, the rest `UPLOADED`). No die-line is dropped. |
| Catalog | ✅ | One type, N die-lines. Index `(partnerServiceId, packagingTypeId, decorationMethod)` is non-unique, so multiple die-lines coexist. |
| Creator product — components | ✅ Built (2026-06-20) | `impliedComponentSlots` still auto-derives only PRIMARY container/closure/seal, but the Components step now has a one-click **"Add outer carton"** affordance (`addOuterCarton` → SECONDARY `CARTON`, dup-guarded, picks from BOX/CARTON/CASE catalog types). So the box is a first-class component when the creator opts in. |
| Order routing + manifest | ✅ Built | Per-component: `CARTON`/`SHIPPER` components scope a COPACKING dispatch leg; LABEL dispatch scopes decorated components. If the carton component exists, production splits correctly. |
| Creator design — carton surface | ⛔ Deferred V1.5 | Designing artwork on the secondary carton (or closure/seal) is the **multi-surface** release (`docs/MULTI_SURFACE_PLAN.md`). The Studio Components drawer is read-only by design today, platform-wide for ALL multi-component packaging. |

## Bottom line

Nothing is broken by the one-type-multi-dieline decision. A bottle+box is fully
modeled and flows through production/manifest **if** the carton is added as a
component. The two genuine "make it seamless" follow-ups are independent of the
one-type-vs-many decision:

1. **Outer-carton component affordance (V1-eligible).** Either auto-imply a
   SECONDARY `CARTON` slot when the product's packaging indicates an outer carton,
   or expose a one-click "Add outer carton" in the creator's Components step.
   Today it requires the generic `addPackagingComponent` path.
2. **Carton surface design (V1.5).** Putting creator artwork on the carton rides
   the deferred multi-surface plan. Until then the carton is a production spec +
   die-line, decorated later.

## Storefront note

Marketplace listing + product detail render a single Layer-A hero image
(`docs/MOCKUP_STRATEGY.md`), not a per-component gallery. Bottle+box appears as
one product hero unless a composed mockup is supplied. Presentation choice, not a
modeling gap.
