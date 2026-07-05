# Creator Product Configuration — "the order of the creator"

**Date:** 2026-07-04. Principle (Pavel): every data dimension of a created product is the RESULT of the
creator's filtered choices on the product detail page + customization, and that finalized spec must be
the single source of truth all the way through: **Detail page → Design Studio → Checkout → Partner
(production/manifest) → Channel (listing).** Nothing downstream re-derives from the template pool.

This extends `docs/SELECTION_THREADING_AUDIT.md` (which fixed flavors) to ALL dimensions.

## Audit summary (per dimension)

| Dimension | Final choice captured? | Studio | Checkout | Partner manifest | Channel | Status |
|---|---|---|---|---|---|---|
| **Flavors** | `Product.selectedFlavorPresetIds` | ✅ scoped | ✅ constrained | ✅ `OrderItemFlavor` | ❌ full pool | fix built (pending push); **channel gap** |
| **Recipe / ingredients** (post swap/optional) | `Recipe`+`RecipeIngredient.source`/`filledSlotId` | ✅ final | n/a | ❌ **not in manifest** | ❌ | **partner gap** |
| **Per-flavor pricing / deltas** | `FlavorPreset.priceDeltaCents`/`unitPriceCents`; pack price | ✅ | ✅ composed | ~ reconciled by `max` | ❌ flat price | **not a clean identity** |
| **Mandatory phrases** | `resolveProductPhrases` (engine, real recipe) | ✅ eligible+mandatory | — | — | — | ✅ correct |
| **Net quantity** | `deriveProductCtx` (variant) | ✅ | — | via variant | — | ✅ correct |
| **Size / packaging / finishes** | mostly **dropped for authed users** at launch | partial | re-picked (full catalog) + snapshotted | ✅ (via notes) | — | **size choice dropped** |

**Already correct:** phrases, net quantity, recipe-in-Studio, finishes-into-manifest.
**Gaps:** (1) recipe not snapshotted to the partner manifest; (2) channel listing uses the full flavor
pool + flat price; (3) size/packaging PDP picks dropped at launch for authed users; (4) price isn't one
recorded number PDP↔order↔partner (reconciled by `Math.max`).

## The fix: one immutable snapshot at checkout

Capture the finalized spec ONCE, at order time, as an immutable JSON on the `OrderItem` — exactly how
`designVersionId` is already version-locked at `cart-actions.ts` — and have the **manifest + channel read
from it** instead of re-deriving. This is "the order of the creator."

### Pure core — BUILT (Cowork, `packages/orders/src/creator-configuration.ts` + tests) ✅
- `buildCreatorConfiguration(input) → CreatorConfiguration` — assembles the snapshot from resolved
  pieces (flavors, final recipe with `source`/`filledSlotId`, variant + net quantity, options, pricing
  incl. `perFlavorUnitPriceCents`, locked phrase ids). Pure, deterministic, no Prisma.
- `configurationChannelVariants(cfg)` — channel reads ONLY the selected flavors + per-flavor price.
- `configurationManifestRecipe(cfg)` — partner reads the exact filtered recipe.
- `isCurrentConfiguration(cfg)` — version guard for downstream readers.
Exported from `@ilaunchify/orders`.

### Wiring — Code's zone (hot files)
1. **Schema (additive):** `OrderItem.configurationSnapshot Json?` — cast-guardable like the existing pack
   columns.
2. **Write** (`apps/creator/.../checkout/cart-actions.ts`, inside the order txn where `OrderItem` /
   `OrderItemFlavor` are created): call `buildCreatorConfiguration({...})` with the data already resolved
   there (flavor rows + `soiSnapshot` + `designVersionId`, the product `recipe.ingredients`, the chosen
   variant/options, the composed `pricePerPackCents`, the locked phrase ids) and store it on
   `OrderItem.configurationSnapshot`.
3. **Read → partner** (`packages/orders/src/manifest.ts`): when `isCurrentConfiguration`, emit
   `configurationManifestRecipe(cfg)` into the manifest so the partner gets the creator's exact filtered
   recipe (closes gap 1) — no live re-derivation drift.
4. **Read → channel** (`apps/.../publish/actions.ts pushListing`): build variants from
   `configurationChannelVariants(cfg)` instead of `flavorPreset.findMany({ status: 'ACTIVE' })` (closes
   gap 2 — a 2-of-6 pick lists 2 channel variants, each with its price).
5. **Launch** (`apps/marketing/src/lib/launch-actions.ts`): also persist the creator's chosen size /
   packaging / single-flavor picks (closes gap 3) — currently dropped for authed users.
6. **Pricing identity** (`cart-actions.ts`): record the creator-facing pack price in the snapshot so
   PDP = order = partner is one stored number, not a `Math.max` of three (mitigates gap 4).

## Phasing
1. **Snapshot write + schema** (2 + 1) — the keystone; everything downstream can then read it.
2. **Manifest read** (3) — partner gets the exact recipe.
3. **Channel read** (4) — channel scoped to the selection + per-flavor price.
4. **Launch size/packaging persistence** (5) + **pricing identity** (6).

All additive; no destructive migration. Same pattern as `designVersionId` + flavor-name/SoI snapshots.

## Cowork ⇄ Code split
- **Cowork (done / owns):** the pure `creator-configuration.ts` builder + selectors + tests; can also
  own additional pure resolvers (e.g. per-flavor price composition) as new files.
- **Code (hot files):** the schema field + `cart-actions` write + `manifest.ts` read + channel
  `publish/actions.ts` read + `launch-actions` size/packaging. Import the builder/selectors from
  `@ilaunchify/orders`.
