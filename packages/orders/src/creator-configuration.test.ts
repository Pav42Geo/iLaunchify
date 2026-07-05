import { describe, it, expect } from 'vitest'
import {
  buildCreatorConfiguration,
  configurationChannelVariants,
  configurationManifestRecipe,
  isCurrentConfiguration,
  mapRecipeIngredients,
  composeFlavorUnitPrices,
  resolveFlavorRecipe,
  CREATOR_CONFIG_VERSION,
} from './creator-configuration'

describe('buildCreatorConfiguration', () => {
  it('snapshots only the selected flavors, deduped + priced', () => {
    const cfg = buildCreatorConfiguration({
      flavors: [
        { flavorPresetId: 'a', name: 'Strawberry', qty: 4, unitPriceCents: 535, lockedDesignVersionId: 'dv1' },
        { flavorPresetId: 'b', name: 'Chocolate', qty: 8, unitPriceCents: 560 },
      ],
      pricing: { basis: 'PER_FLAVOR', pricePerPackCents: 4380 },
    })
    expect(cfg.version).toBe(CREATOR_CONFIG_VERSION)
    expect(cfg.selectedFlavorPresetIds).toEqual(['a', 'b'])
    expect(cfg.pricing.perFlavorUnitPriceCents).toEqual({ a: 535, b: 560 })
    expect(cfg.flavors[0]?.lockedDesignVersionId).toBe('dv1')
  })

  it('captures the FINAL recipe sorted by position (after swaps/optionals)', () => {
    const cfg = buildCreatorConfiguration({
      recipe: {
        servingSizeG: 30,
        servingsPerContainer: 10,
        ingredients: [
          { ingredientId: 'x', weightG: 50, position: 1, source: 'TEMPLATE_REPLACEMENT', filledSlotId: 'slot1' },
          { ingredientId: 'y', weightG: 90, position: 0, source: 'TEMPLATE_BASE' },
        ],
      },
    })
    expect(cfg.recipe?.ingredients.map((i) => i.ingredientId)).toEqual(['y', 'x'])
    expect(cfg.recipe?.ingredients[1]).toMatchObject({ source: 'TEMPLATE_REPLACEMENT', filledSlotId: 'slot1', allergenFlags: [] })
  })

  it('defaults options/pricing/phrases cleanly', () => {
    const cfg = buildCreatorConfiguration({})
    expect(cfg.recipe).toBeNull()
    expect(cfg.options.finishPartnerFinishIds).toEqual([])
    expect(cfg.pricing.perFlavorUnitPriceCents).toEqual({})
    expect(cfg.phrases.lockedPhraseIds).toEqual([])
  })

  it('channel selector exposes only selected flavors + per-flavor price', () => {
    const cfg = buildCreatorConfiguration({
      flavors: [{ flavorPresetId: 'a', name: 'Strawberry', qty: 4, unitPriceCents: 535 }],
    })
    expect(configurationChannelVariants(cfg)).toEqual([{ flavorPresetId: 'a', name: 'Strawberry', unitPriceCents: 535 }])
  })

  it('manifest selector returns the exact filtered recipe', () => {
    const cfg = buildCreatorConfiguration({ recipe: { ingredients: [{ ingredientId: 'x', weightG: 10, position: 0 }] } })
    expect(configurationManifestRecipe(cfg)?.ingredients).toHaveLength(1)
  })

  it('version guard rejects unknown/legacy snapshots', () => {
    expect(isCurrentConfiguration(null)).toBe(false)
    expect(isCurrentConfiguration({ version: 0 })).toBe(false)
    expect(isCurrentConfiguration(buildCreatorConfiguration({}))).toBe(true)
  })
})

describe('mapRecipeIngredients', () => {
  it('maps raw rows with allergen + label-name fallbacks and Decimal coercion', () => {
    const out = mapRecipeIngredients([
      { weightG: '90', position: 0, source: 'TEMPLATE_BASE', ingredient: { id: 'y', name: 'Oats', allergenFlags: [], allergens: ['GLUTEN'] } },
      { weightG: 50, position: 1, source: 'TEMPLATE_REPLACEMENT', filledSlotId: 's1', ingredient: { id: 'x', name: 'Whey', labelDeclarationName: 'Whey Protein', allergenFlags: ['MILK'], bioengineeredStatus: 'BIOENGINEERED' } },
    ])
    expect(out[0]).toMatchObject({ ingredientId: 'y', labelDeclarationName: 'Oats', weightG: 90, allergenFlags: ['gluten'] })
    expect(out[1]).toMatchObject({ ingredientId: 'x', labelDeclarationName: 'Whey Protein', filledSlotId: 's1', allergenFlags: ['milk'], bioengineeredStatus: 'BIOENGINEERED' })
  })
})

describe('resolveFlavorRecipe', () => {
  const base = [
    { ingredientId: 'oats', labelDeclarationName: 'Oats', weightG: 90, position: 0, source: 'TEMPLATE_BASE', filledSlotId: null, allergenFlags: [], bioengineeredStatus: null },
    { ingredientId: 'sugar', labelDeclarationName: 'Sugar', weightG: 30, position: 1, source: 'TEMPLATE_BASE', filledSlotId: null, allergenFlags: [], bioengineeredStatus: null },
  ]

  it('appends a new extra as FLAVOR_EXTRA and re-sorts by weight (FDA descending)', () => {
    const out = resolveFlavorRecipe(base, [{ ingredientId: 'straw', name: 'Strawberry', qty: 40, unit: 'g' }])
    expect(out.map((i) => i.ingredientId)).toEqual(['oats', 'straw', 'sugar'])
    expect(out.map((i) => i.position)).toEqual([0, 1, 2])
    expect(out.find((i) => i.ingredientId === 'straw')).toMatchObject({ source: 'FLAVOR_EXTRA', weightG: 40 })
  })

  it('adds weight to an existing base ingredient (with unit conversion)', () => {
    const out = resolveFlavorRecipe(base, [{ ingredientId: 'sugar', qty: 5000, unit: 'mg' }]) // +5g
    expect(out.find((i) => i.ingredientId === 'sugar')?.weightG).toBe(35)
  })

  it('does not mutate the base array', () => {
    resolveFlavorRecipe(base, [{ ingredientId: 'x', qty: 1 }])
    expect(base).toHaveLength(2)
    expect(base[0]?.weightG).toBe(90)
  })
})

describe('per-flavor recipe in the snapshot', () => {
  it('carries flavors[].recipe when recipeIngredients provided', () => {
    const straw = resolveFlavorRecipe([], [{ ingredientId: 's', name: 'Strawberry', qty: 10 }])
    const cfg = buildCreatorConfiguration({ flavors: [{ flavorPresetId: 'a', name: 'Strawberry', qty: 4, recipeIngredients: straw }] })
    expect(cfg.flavors[0]?.recipe?.ingredients[0]?.ingredientId).toBe('s')
  })
})

describe('composeFlavorUnitPrices', () => {
  it('PER_FLAVOR basis uses each flavor absolute price', () => {
    const p = composeFlavorUnitPrices('PER_FLAVOR', 400, [
      { flavorPresetId: 'a', unitPriceCents: 535 },
      { flavorPresetId: 'b', unitPriceCents: 560 },
    ])
    expect(p).toEqual({ a: 535, b: 560 })
  })

  it('non-PER_FLAVOR basis is base + delta, never negative', () => {
    const p = composeFlavorUnitPrices('PER_UNIT', 400, [
      { flavorPresetId: 'a', priceDeltaCents: 25 },
      { flavorPresetId: 'b' },
      { flavorPresetId: 'c', priceDeltaCents: -1000 },
    ])
    expect(p).toEqual({ a: 425, b: 400, c: 0 })
  })
})
