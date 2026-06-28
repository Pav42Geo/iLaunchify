// Verification harness for the marketplace Customize-rail recompute.
//
// Mirrors the seeded demo product (Adaptogen Sparkling Tonic, 355 mL can) and
// asserts EXACT FDA-rounded label values so the live recompute can be trusted:
//   • base recipe → protein 0 g, calories 50, added sugars 12 g
//   • + Whey add-on → protein 3.5 g  (the bug the user caught: add-ons must count)
//   • Sweetener swap (sugar → stevia, weightGOverride 0.2 g) → calories 5, added sugars 0
//   • composer structure: slot weights, weightGOverride honored, add-on inclusion
//
// Hand-computed against the engine model (batch = Σ per100g×g/100; per serving =
// batch ÷ (rawMass/servingSize)) so a regression in either the composer or the
// engine fails loudly.

import { describe, it, expect } from 'vitest'
import { calculateLabel } from './engine'
import { composeMarketplaceRows, type RecomposeSlot, type RecomposeOptional } from './marketplace-recompose'

// --- ingredient nutrition (per 100 g), mirroring seed-demo-product.ts ---
const N = {
  water: { calories: 0 },
  sugar: { calories: 387, totalCarbohydrate: 100, totalSugars: 100, addedSugars: 100 },
  stevia: { calories: 0 },
  ashwagandha: { calories: 250, totalFat: 0.3, totalCarbohydrate: 60, dietaryFiber: 30, protein: 3 },
  coconut: { calories: 45, sodium: 105, totalCarbohydrate: 11, totalSugars: 9, potassium: 250 },
  citric: { calories: 0 },
  salt: { calories: 0, sodium: 38758 },
  whey: { calories: 360, sodium: 200, totalCarbohydrate: 5, protein: 85 },
}

// Base recipe slots (per 355 mL can). Sweetener slot is replaceable with a
// 0.2 g stevia override (0.2 g stevia replaces 12 g sugar).
const SLOTS: RecomposeSlot[] = [
  { weightG: 330, base: { name: 'Carbonated Water', per100g: N.water } },
  {
    weightG: 12,
    base: { name: 'Cane Sugar', per100g: N.sugar },
    replacements: [{ id: 'rep-stevia', weightGOverride: 0.2, ingredient: { name: 'Stevia', per100g: N.stevia } }],
  },
  { weightG: 1.5, base: { name: 'Ashwagandha', per100g: N.ashwagandha } },
  { weightG: 5, base: { name: 'Coconut Water Concentrate', per100g: N.coconut } },
  { weightG: 0.5, base: { name: 'Citric Acid', per100g: N.citric } },
  { weightG: 0.1, base: { name: 'Sea Salt', per100g: N.salt } },
]

const OPTIONALS: RecomposeOptional[] = [
  { id: 'opt-whey', weightG: 4, ingredient: { name: 'Whey Protein Isolate', per100g: N.whey } },
]

const GEO = { basis: 'serving' as const, servingSizeG: 355, servingsPerPackage: 1 }

describe('composeMarketplaceRows', () => {
  it('base composition yields one row per slot with slot weights', () => {
    const rows = composeMarketplaceRows(SLOTS, OPTIONALS, {})
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => r.quantity)).toEqual([330, 12, 1.5, 5, 0.5, 0.1])
  })

  it('honors weightGOverride on a swap (0.2 g stevia, not 12 g)', () => {
    const rows = composeMarketplaceRows(SLOTS, OPTIONALS, { replacements: { 'slot-1': 'rep-stevia' } })
    expect(rows[1]?.name).toBe('Stevia')
    expect(rows[1]?.quantity).toBe(0.2)
  })

  it('includes an add-on only when ticked', () => {
    expect(composeMarketplaceRows(SLOTS, OPTIONALS, {})).toHaveLength(6)
    const withWhey = composeMarketplaceRows(SLOTS, OPTIONALS, { addOnIds: ['opt-whey'] })
    expect(withWhey).toHaveLength(7)
    expect(withWhey[6]?.quantity).toBe(4)
    expect(withWhey[6]?.name).toBe('Whey Protein Isolate')
  })
})

describe('recompute → Nutrition Facts (exact FDA-rounded values)', () => {
  const panel = (sel: Parameters<typeof composeMarketplaceRows>[2]) =>
    calculateLabel(composeMarketplaceRows(SLOTS, OPTIONALS, sel), GEO).perServing

  it('base recipe: protein 0 g, calories 50, added sugars 12 g', () => {
    const p = panel({})
    expect(p.protein.amount).toBe(0)
    expect(p.calories).toBe(50)
    expect(p.addedSugars.amount).toBe(12)
  })

  it('adding the Whey add-on raises protein to 3.5 g (the core fix)', () => {
    const p = panel({ addOnIds: ['opt-whey'] })
    expect(p.protein.amount).toBe(3.5)
  })

  it('swapping sugar → stevia drops calories to 5 and added sugars to 0', () => {
    const p = panel({ replacements: { 'slot-1': 'rep-stevia' } })
    expect(p.calories).toBe(5)
    expect(p.addedSugars.amount).toBe(0)
  })

  it('swap + add-on compose together (stevia + whey): low sugar, real protein', () => {
    const p = panel({ replacements: { 'slot-1': 'rep-stevia' }, addOnIds: ['opt-whey'] })
    expect(p.addedSugars.amount).toBe(0)
    expect(p.protein.amount).toBe(3.5)
  })
})
