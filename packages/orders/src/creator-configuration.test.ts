import { describe, it, expect } from 'vitest'
import {
  buildCreatorConfiguration,
  configurationChannelVariants,
  configurationManifestRecipe,
  isCurrentConfiguration,
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
