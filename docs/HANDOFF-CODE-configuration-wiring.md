# Code handoff — wire the Creator Product Configuration snapshot

**Owner:** Code (all hot files below). **Depends on:** `@ilaunchify/orders` toolkit (Cowork, built +
tested). **Spec:** `docs/CREATOR_PRODUCT_CONFIGURATION.md`. Import everything from `@ilaunchify/orders`.

The goal: write the creator's finalized spec ONCE at checkout as an immutable snapshot on the
`OrderItem`, and have the manifest + channel READ it instead of re-deriving from the template pool.

## Checklist

### 1. Schema — `OrderItem.configurationSnapshot Json?` (additive)
`packages/db/prisma/schema.prisma` — add to `model OrderItem` (near the existing pack snapshot cols):
```prisma
// The creator's finalized product spec at order time (docs/CREATOR_PRODUCT_CONFIGURATION.md).
// Source of truth for the partner manifest + channel listing. Shape = @ilaunchify/orders
// CreatorConfiguration (versioned).
configurationSnapshot Json?
```
Push it together with / right after the pending `Product.selectedFlavorPresetIds` migration
(`db:push` → `db:generate` → `rm -rf apps/*/.next` → restart). Cast-guard reads/writes until generate.

### 2. Write at checkout — `apps/creator/src/app/(checkout)/products/[productId]/checkout/cart-actions.ts`
Inside the order transaction, where `OrderItem` / `OrderItemFlavor` are created (~`:533-567`), assemble
the snapshot from data already resolved there and store it. Concretely:

```ts
import {
  buildCreatorConfiguration, mapRecipeIngredients, composeFlavorUnitPrices, resolveFlavorRecipe,
} from '@ilaunchify/orders'

// base recipe → snapshot ingredients (product.recipe.ingredients already loaded for the compliance gate)
const baseIngredients = mapRecipeIngredients(product.recipe?.ingredients ?? [])

// per-flavor unit prices from the pack basis + per-flavor deltas/unit prices (matrix.pool / FlavorPreset)
const perFlavorPrice = composeFlavorUnitPrices(pricingBasis, baseUnitCents, flavorRows.map((f) => ({
  flavorPresetId: f.flavorPresetId,
  unitPriceCents: poolPriceById.get(f.flavorPresetId) ?? null,   // from matrix.pool
  priceDeltaCents: deltaById.get(f.flavorPresetId) ?? null,      // FlavorPreset.priceDeltaCents
})))

const configuration = buildCreatorConfiguration({
  flavors: flavorRows.map((f) => ({
    flavorPresetId: f.flavorPresetId,
    name: f.flavorName,
    statementOfIdentity: f.soiSnapshot,
    qty: f.qty,
    unitPriceCents: perFlavorPrice[f.flavorPresetId] ?? null,
    lockedDesignVersionId: f.designVersionId ?? null,
    // per-flavor final recipe = base + that flavor's extras (FlavorPreset.extras)
    recipeIngredients: resolveFlavorRecipe(baseIngredients, extrasByFlavor.get(f.flavorPresetId) ?? []),
  })),
  recipe: product.recipe
    ? { servingSizeG: Number(product.recipe.servingSizeG), servingsPerContainer: Number(product.recipe.servingsPerContainer), ingredients: baseIngredients }
    : null,
  variant: { id: product.variantId, containerFormat: variant?.containerFormat ?? null, netQuantity: derivedNetQuantity },
  options: { substrateSlug, packagingMaterialSlug, finishPartnerFinishIds, dieCutTemplateId: variant?.dieCutTemplateId ?? null },
  pricing: { basis: pricingBasis, pricePerPackCents },
  lockedPhraseIds,   // from resolveProductPhrases (locked ids), if resolved at checkout
})

// store on the OrderItem (cast-guarded until db:generate)
await (tx as unknown as { orderItem: { update: (a: unknown) => Promise<unknown> } }).orderItem
  .update({ where: { id: orderItem.id }, data: { configurationSnapshot: configuration } })
```
Notes: `flavorRows`, `soiSnapshot`, `designVersionId`, `pricePerPackCents`, `pricingBasis` are already
computed in this file (audit refs `cart-actions.ts:225-271, 543-567`). `extrasByFlavor` = each
`FlavorPreset.extras` for the selected flavors (load in the same product query). `lockedPhraseIds` is
optional at V1 (can be filled later).

### 3. Read → partner — `packages/orders/src/manifest.ts`
When the item has a `configurationSnapshot`, emit the exact filtered recipe (closes the recipe-in-
manifest gap):
```ts
import { isCurrentConfiguration, configurationManifestRecipe } from './creator-configuration'
// …
const cfg = orderItem.configurationSnapshot
if (isCurrentConfiguration(cfg)) {
  manifestItem.recipe = configurationManifestRecipe(cfg)   // { servingSizeG, servingsPerContainer, ingredients[] }
  manifestItem.perFlavorRecipes = cfg.flavors.filter((f) => f.recipe).map((f) => ({ flavorPresetId: f.flavorPresetId, ingredients: f.recipe!.ingredients }))
}
```
Legacy orders (no snapshot) keep today's behaviour.

### 4. Read → channel — `apps/.../publish/actions.ts` (`pushListing` + `loadSellData`)
Replace the full-pool variant build (`flavorPreset.findMany({ where: { status: 'ACTIVE' } })`, audit
ref `publish/actions.ts:403-413`) with the snapshot's selected flavors + per-flavor price:
```ts
import { isCurrentConfiguration, configurationChannelVariants } from '@ilaunchify/orders'
// prefer the order's snapshot; else the Product.selectedFlavorPresetIds subset; else legacy full pool
const cfg = orderItem?.configurationSnapshot
const variantSource = isCurrentConfiguration(cfg)
  ? configurationChannelVariants(cfg)                      // [{ flavorPresetId, name, unitPriceCents }]
  : /* fallback: scope flavorPresets to product.selectedFlavorPresetIds, else full pool */ …
const variants = variantSource.map((v) => ({ variantKey: variantKey(product.id, v.flavorPresetId), title: v.name, price: fmtPrice(v.unitPriceCents ?? flatPriceCents) }))
```

### 5. Cast-guards
`configurationSnapshot` reads/writes are cast-guarded until `db:generate`; then drop them (same pattern
as `docs/POST_PUSH_CASTGUARD_CLEANUP.md`).

### 6. Verify
`tsc` clean for `apps/creator`, `apps/marketing`, `packages/orders`. Keep the `@ilaunchify/orders`
`creator-configuration.test.ts` green (Cowork owns it).

## Boundaries
- **Do not edit** `packages/orders/src/creator-configuration.ts` (Cowork owns it; extend via new pure
  helpers there only by asking Cowork).
- Everything in steps 1–5 is Code's hot-file zone. Ping Cowork if you need another pure resolver.
