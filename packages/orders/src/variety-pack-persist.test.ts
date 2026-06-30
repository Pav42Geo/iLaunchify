import { describe, it, expect } from 'vitest'
import {
  aggregateFlavorQuantities,
  packOrderTotalCents,
  buildManifestPackStructure,
  type PackSlotInput,
} from './manifest'

// Money-path tests for the variety-pack persistence + manifest math
// (docs/VARIETY_PACK_MODEL.md §5-7, step 4). Exact integer values — no floats.

describe('aggregateFlavorQuantities — packCount × per-pack slot units', () => {
  it('multiplies each slot by the pack count', () => {
    // 24-pack, 3 flavors 8/8/8, 10 packs → 80/80/80 each.
    const slots: PackSlotInput[] = [
      { flavorPresetId: 'a', units: 8 },
      { flavorPresetId: 'b', units: 8 },
      { flavorPresetId: 'c', units: 8 },
    ]
    expect(aggregateFlavorQuantities(10, slots)).toEqual([
      { flavorPresetId: 'a', qty: 80 },
      { flavorPresetId: 'b', qty: 80 },
      { flavorPresetId: 'c', qty: 80 },
    ])
  })

  it('handles an uneven fill (10-pack 4/3/3 × 5 packs)', () => {
    const slots: PackSlotInput[] = [
      { flavorPresetId: 'a', units: 4 },
      { flavorPresetId: 'b', units: 3 },
      { flavorPresetId: 'c', units: 3 },
    ]
    const agg = aggregateFlavorQuantities(5, slots)
    expect(agg).toEqual([
      { flavorPresetId: 'a', qty: 20 },
      { flavorPresetId: 'b', qty: 15 },
      { flavorPresetId: 'c', qty: 15 },
    ])
    // The aggregate flavor totals sum to packCount × unitsPerPack (5 × 10 = 50).
    const total = agg.reduce((t, f) => t + f.qty, 0)
    expect(total).toBe(50)
  })

  it('zero pack count → all zero', () => {
    expect(aggregateFlavorQuantities(0, [{ flavorPresetId: 'a', units: 6 }])).toEqual([
      { flavorPresetId: 'a', qty: 0 },
    ])
  })
})

describe('packOrderTotalCents — PER_PACK (flat × packs)', () => {
  it('flat per-pack price × pack count', () => {
    // $12.00/pack × 10 packs = $120.00.
    expect(packOrderTotalCents('PER_PACK', 10, { pricePerPackCents: 1200 })).toBe(12000)
  })

  it('flavor mix does not change a PER_PACK total', () => {
    const a = packOrderTotalCents('PER_PACK', 4, {
      pricePerPackCents: 999,
      slots: [{ flavorPresetId: 'x', units: 6 }],
    })
    const b = packOrderTotalCents('PER_PACK', 4, {
      pricePerPackCents: 999,
      slots: [
        { flavorPresetId: 'x', units: 3 },
        { flavorPresetId: 'y', units: 3 },
      ],
    })
    expect(a).toBe(3996)
    expect(b).toBe(3996)
  })

  it('null per-pack price → 0', () => {
    expect(packOrderTotalCents('PER_PACK', 5, { pricePerPackCents: null })).toBe(0)
  })
})

describe('packOrderTotalCents — PER_FLAVOR (Σ slot price × packs)', () => {
  it('sums each slot at its flavor unit price, then × pack count', () => {
    // pack: 8×$1.50 + 8×$2.00 + 8×$1.00 = 1200 + 1600 + 800 = 3600c/pack.
    // 10 packs → 36000c.
    const slots: PackSlotInput[] = [
      { flavorPresetId: 'a', units: 8 },
      { flavorPresetId: 'b', units: 8 },
      { flavorPresetId: 'c', units: 8 },
    ]
    const prices = { a: 150, b: 200, c: 100 }
    expect(packOrderTotalCents('PER_FLAVOR', 10, { slots, unitPriceByFlavor: prices })).toBe(36000)
  })

  it('flavor mix DOES change a PER_FLAVOR total', () => {
    const prices = { x: 100, y: 300 }
    const cheap = packOrderTotalCents('PER_FLAVOR', 2, {
      slots: [{ flavorPresetId: 'x', units: 6 }],
      unitPriceByFlavor: prices,
    })
    const mixed = packOrderTotalCents('PER_FLAVOR', 2, {
      slots: [
        { flavorPresetId: 'x', units: 3 },
        { flavorPresetId: 'y', units: 3 },
      ],
      unitPriceByFlavor: prices,
    })
    expect(cheap).toBe(1200) // 6×100 ×2
    expect(mixed).toBe(2400) // (3×100 + 3×300) ×2 = 1200 ×2
  })

  it('missing flavor price counts as 0', () => {
    expect(
      packOrderTotalCents('PER_FLAVOR', 3, {
        slots: [{ flavorPresetId: 'ghost', units: 4 }],
        unitPriceByFlavor: {},
      }),
    ).toBe(0)
  })
})

describe('buildManifestPackStructure — pack structure output', () => {
  it('emits N packs of size X with derived total units', () => {
    expect(
      buildManifestPackStructure({
        packVariantId: 'var-24',
        packCount: 10,
        unitsPerPack: 24,
        pricingBasis: 'PER_FLAVOR',
        pricePerPackCents: 3600,
      }),
    ).toEqual({
      packVariantId: 'var-24',
      packCount: 10,
      unitsPerPack: 24,
      totalUnits: 240,
      pricingBasis: 'PER_FLAVOR',
      pricePerPackCents: 3600,
    })
  })

  it('null for non-pack items (no variant id)', () => {
    expect(
      buildManifestPackStructure({
        packVariantId: null,
        packCount: null,
        unitsPerPack: null,
        pricingBasis: null,
        pricePerPackCents: null,
      }),
    ).toBeNull()
  })

  it('null when pack count is zero', () => {
    expect(
      buildManifestPackStructure({
        packVariantId: 'var-6',
        packCount: 0,
        unitsPerPack: 6,
        pricingBasis: 'PER_PACK',
        pricePerPackCents: 500,
      }),
    ).toBeNull()
  })
})

describe('integration — aggregate totals reconcile with manifest total units', () => {
  it('Σ per-flavor aggregate qty === packCount × unitsPerPack', () => {
    const slots: PackSlotInput[] = [
      { flavorPresetId: 'a', units: 9 },
      { flavorPresetId: 'b', units: 9 },
      { flavorPresetId: 'c', units: 6 },
    ]
    const packCount = 7
    const unitsPerPack = 24
    const agg = aggregateFlavorQuantities(packCount, slots)
    const aggTotal = agg.reduce((t, f) => t + f.qty, 0)
    const structure = buildManifestPackStructure({
      packVariantId: 'v',
      packCount,
      unitsPerPack,
      pricingBasis: 'PER_PACK',
      pricePerPackCents: 0,
    })
    expect(aggTotal).toBe(structure!.totalUnits)
    expect(aggTotal).toBe(168) // 7 × 24
  })
})
