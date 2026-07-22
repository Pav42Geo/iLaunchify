// tierGoodsCentsAtBand goldens (C2.2 velocity-banded on-demand pricing,
// LOCKED Pavel 2026-07-21). Pure; runs under the sandbox shim too.

import { describe, it, expect } from 'vitest'
import { tierGoodsCents, tierGoodsCentsAtBand, type PricingBandInput } from './pricing-band'

// A realistic on-demand band set (sorted by sortOrder, ascending minQty).
const BANDS: PricingBandInput[] = [
  { minQty: 1, perUnitCents: 899 },
  { minQty: 25, perUnitCents: 749 },
  { minQty: 100, perUnitCents: 599 },
]

describe('tierGoodsCentsAtBand', () => {
  it('selects the band by bandSelectionUnits but bills billedUnits', () => {
    // qty-2 consumer order, creator has 250 trailing units: 100+ band applies.
    expect(tierGoodsCentsAtBand(BANDS, 2, 252)).toBe(2 * 599)
  })

  it('a cold-start creator (no trailing volume) prices at band 1', () => {
    expect(tierGoodsCentsAtBand(BANDS, 1, 1)).toBe(899)
  })

  it('equals tierGoodsCents when both quantities coincide', () => {
    for (const n of [1, 2, 25, 99, 100, 500]) {
      expect(tierGoodsCentsAtBand(BANDS, n, n)).toBe(tierGoodsCents(BANDS, n))
    }
  })

  it('keeps the below-first-band fallback (never $0)', () => {
    const highFloor: PricingBandInput[] = [{ minQty: 50, perUnitCents: 500 }]
    expect(tierGoodsCentsAtBand(highFloor, 2, 2)).toBe(2 * 500)
  })

  it('null on an empty band list (no partner price, no sale)', () => {
    expect(tierGoodsCentsAtBand([], 2, 252)).toBeNull()
  })

  it('floors fractional billed units and clamps negatives to 0', () => {
    expect(tierGoodsCentsAtBand(BANDS, 2.9, 252)).toBe(2 * 599)
    expect(tierGoodsCentsAtBand(BANDS, -1, 252)).toBe(0)
  })
})
