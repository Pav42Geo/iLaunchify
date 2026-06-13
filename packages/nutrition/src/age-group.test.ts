// Age-group Nutrition Facts variants (21 CFR 101.9(j)(5)). Verifies that the
// `audience` option selects the correct Daily Value table for %DV and that the
// infant panel suppresses the rows the regulation forbids. Values cross-checked
// against eCFR 21 CFR 101.9(c)(8)(iv) (RDI) + (c)(9) (DRV).

import { describe, it, expect } from 'vitest'
import { calculateLabel } from './engine'
import { toPanelData } from './panel-adapter'
import type { IngredientInput } from './engine'
import type { NutritionAudience } from './nutrients'

// 1 ingredient @ 100 g, served as a single 100 g serving ⇒ per-serving == per-100g.
const ings: IngredientInput[] = [{
  id: 'a', name: 'Test', quantity: 100, unit: 'g',
  per100g: {
    calories: 100, totalFat: 10, saturatedFat: 5, cholesterol: 30, sodium: 200,
    totalCarbohydrate: 20, dietaryFiber: 5, addedSugars: 10, protein: 8,
    vitaminD: 5, calcium: 130, iron: 3.6, potassium: 235,
  },
}]
const geo = { basis: 'serving' as const, servingSizeG: 100, servingsPerPackage: 1 }

const panel = (audience: NutritionAudience) =>
  toPanelData(calculateLabel(ings, geo, { audience }))
const pct = (audience: NutritionAudience, id: string) =>
  panel(audience).rows.find((r) => r.id === id)?.percentDailyValue
const hasRow = (audience: NutritionAudience, id: string) =>
  panel(audience).rows.some((r) => r.id === id)

describe('Nutrition Facts age-group variants', () => {
  it('GENERAL uses the ≥4-yr DV table; protein %DV is voluntary (omitted)', () => {
    expect(pct('GENERAL', 'totalFat')).toBe(13) // 10/78
    expect(pct('GENERAL', 'saturatedFat')).toBe(25) // 5/20
    expect(pct('GENERAL', 'sodium')).toBe(9) // 200/2300
    expect(pct('GENERAL', 'vitaminD')).toBe(25) // 5/20
    expect(pct('GENERAL', 'protein')).toBeUndefined()
  })

  it('CHILD_1_3 uses the 1–3-yr DV table; protein %DV is shown', () => {
    expect(pct('CHILD_1_3', 'totalFat')).toBe(26) // 10/39
    expect(pct('CHILD_1_3', 'saturatedFat')).toBe(50) // 5/10
    expect(pct('CHILD_1_3', 'sodium')).toBe(13) // 200/1500
    expect(pct('CHILD_1_3', 'addedSugars')).toBe(40) // 10/25
    expect(pct('CHILD_1_3', 'protein')).toBe(62) // 8/13
    expect(pct('CHILD_1_3', 'vitaminD')).toBe(33) // 5/15
    expect(hasRow('CHILD_1_3', 'cholesterol')).toBe(true)
  })

  it('INFANT_0_12 omits sat fat / trans fat / cholesterol and shows no %DV where FDA set none', () => {
    expect(pct('INFANT_0_12', 'totalFat')).toBe(33) // 10/30
    expect(hasRow('INFANT_0_12', 'saturatedFat')).toBe(false)
    expect(hasRow('INFANT_0_12', 'transFat')).toBe(false)
    expect(hasRow('INFANT_0_12', 'cholesterol')).toBe(false)
    // Sodium / fiber / added sugars are still declared (amount) but carry no %DV.
    expect(hasRow('INFANT_0_12', 'sodium')).toBe(true)
    expect(pct('INFANT_0_12', 'sodium')).toBeUndefined()
    expect(pct('INFANT_0_12', 'dietaryFiber')).toBeUndefined()
    expect(pct('INFANT_0_12', 'addedSugars')).toBeUndefined()
    expect(pct('INFANT_0_12', 'protein')).toBe(73) // 8/11
    expect(pct('INFANT_0_12', 'vitaminD')).toBe(50) // 5/10
  })

  it('infant/toddler footer drops the "2,000 calories a day" sentence', () => {
    expect(panel('INFANT_0_12').requiredFooter).not.toMatch(/2,000 calories/)
    expect(panel('CHILD_1_3').requiredFooter).not.toMatch(/2,000 calories/)
    expect(panel('GENERAL').requiredFooter).toMatch(/2,000 calories/)
  })

  it('GENERAL output is unchanged vs the default (no-audience) call', () => {
    const withAudience = JSON.stringify(toPanelData(calculateLabel(ings, geo, { audience: 'GENERAL' })))
    const noAudience = JSON.stringify(toPanelData(calculateLabel(ings, geo)))
    expect(withAudience).toBe(noAudience)
  })
})
