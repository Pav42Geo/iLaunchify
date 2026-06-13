import { describe, it, expect } from 'vitest'
import { toSupplementPanelData, type DietaryIngredient, type ProprietaryBlend } from './supplement-facts'

describe('toSupplementPanelData', () => {
  const opts = { servingSize: '2 capsules', servingsPerContainer: 30 }

  it('renders vitamins/minerals with %DV and NO 2,000-calorie footnote (101.36(b)(2)(iii)(D))', () => {
    const ings: DietaryIngredient[] = [
      { id: 'd', name: 'Vitamin D (as cholecalciferol)', amountPerServing: 25, unit: 'mcg', percentDV: 125 },
      { id: 'c', name: 'Vitamin C (as ascorbic acid)', amountPerServing: 90, unit: 'mg', percentDV: 100 },
    ]
    const { panel, otherIngredients } = toSupplementPanelData(ings, [], opts)
    expect(panel.format).toBe('SUPPLEMENT_FACTS')
    expect(panel.rows).toHaveLength(2)
    expect(panel.rows[0]).toMatchObject({ label: 'Vitamin D (as cholecalciferol)', amount: '25 mcg', percentDailyValue: 125, indent: 0 })
    expect(panel.servingSize).toBe('2 capsules')
    expect(panel.servingsPerContainer).toBe('30')
    // No calorie-based DRV nutrient declared ⇒ no "2,000 calorie" footnote, no † footnote.
    expect(panel.requiredFooter).not.toContain('2,000 calorie')
    expect(panel.requiredFooter).toBe('')
    expect(otherIngredients).toEqual([])
  })

  it('adds the 2,000-calorie footnote ONLY when a macronutrient DV is declared', () => {
    const ings: DietaryIngredient[] = [
      { id: 'protein', name: 'Protein', amountPerServing: 25, unit: 'g', percentDV: 50 },
    ]
    const { panel } = toSupplementPanelData(ings, [], opts)
    expect(panel.requiredFooter).toContain('2,000 calorie')
  })

  it('marks ingredients without an established DV (†, "Daily Value Not Established")', () => {
    const ings: DietaryIngredient[] = [
      { id: 'l', name: 'L-Theanine', amountPerServing: 200, unit: 'mg', percentDV: null },
    ]
    const { panel } = toSupplementPanelData(ings, [], opts)
    expect(panel.rows[0]?.percentDailyValue).toBeUndefined()
    expect(panel.rows[0]?.noDailyValue).toBe(true)
    expect(panel.requiredFooter).toContain('Daily Value Not Established')
  })

  it('groups a proprietary blend: total on the parent, members with no amounts, in predominance order', () => {
    const ings: DietaryIngredient[] = [
      { id: 'caf', name: 'Caffeine', amountPerServing: 0, unit: 'mg', blendId: 'energy', sortWeight: 3 },
      { id: 'tau', name: 'Taurine', amountPerServing: 0, unit: 'mg', blendId: 'energy', sortWeight: 2 },
      { id: 'gin', name: 'Ginseng', amountPerServing: 0, unit: 'mg', blendId: 'energy', sortWeight: 1 },
    ]
    const blends: ProprietaryBlend[] = [{ id: 'energy', name: 'Energy Blend', totalAmount: 500, unit: 'mg', percentDV: null }]
    const { panel } = toSupplementPanelData(ings, blends, opts)
    // parent + 3 members
    expect(panel.rows).toHaveLength(4)
    expect(panel.rows[0]).toMatchObject({ amount: '500 mg', indent: 0 })
    expect(panel.rows[0]?.label).toContain('Energy Blend')
    // members: descending sortWeight, no amounts, indented
    expect(panel.rows.slice(1).map((r) => r.label)).toEqual(['Caffeine', 'Taurine', 'Ginseng'])
    expect(panel.rows.slice(1).every((r) => r.amount === '' && r.indent === 1)).toBe(true)
    // The blend line itself has no DV → carries the † / "Daily Value Not Established".
    expect(panel.rows[0]?.noDailyValue).toBe(true)
    expect(panel.requiredFooter).toContain('Daily Value Not Established')
  })

  it('declares the Calories/macros block above the ingredients, with %DV + the 2,000-cal footnote', () => {
    const ings: DietaryIngredient[] = [
      { id: 'mag', name: 'Magnesium (as Magnesium Citrate)', amountPerServing: 250, unit: 'mg', percentDV: 60 },
    ]
    const { panel } = toSupplementPanelData(ings, [], {
      ...opts,
      nutrition: { calories: 20, totalCarbohydrate: 4, totalSugars: 3, addedSugars: 3 },
    })
    // Nutrition rows come first, in FDA order, then the dietary ingredient.
    expect(panel.rows.map((r) => r.id)).toEqual(['calories', 'totalCarbohydrate', 'totalSugars', 'addedSugars', 'mag'])
    expect(panel.rows[1]).toMatchObject({ id: 'totalCarbohydrate', percentDailyValue: 1 }) // 4/275
    expect(panel.rows[3]).toMatchObject({ id: 'addedSugars', percentDailyValue: 6 }) // 3/50
    expect(panel.rows[2]?.percentDailyValue).toBeUndefined() // total sugars: no %DV
    expect(panel.requiredFooter).toContain('2,000 calorie') // carbohydrate declared
  })

  it('omits the nutrition block entirely when nothing is declared', () => {
    const ings: DietaryIngredient[] = [
      { id: 'd', name: 'Vitamin D', amountPerServing: 25, unit: 'mcg', percentDV: 125 },
    ]
    const { panel } = toSupplementPanelData(ings, [], { ...opts, nutrition: {} })
    expect(panel.rows.map((r) => r.id)).toEqual(['d'])
    expect(panel.requiredFooter).toBe('')
  })

  it('separates Other Ingredients (excipients) out of the panel', () => {
    const ings: DietaryIngredient[] = [
      { id: 'b', name: 'Biotin', amountPerServing: 30, unit: 'mcg', percentDV: 100 },
      { id: 'g', name: 'Gelatin', amountPerServing: 0, unit: '', isOtherIngredient: true },
      { id: 'r', name: 'Rice flour', amountPerServing: 0, unit: '', isOtherIngredient: true },
    ]
    const { panel, otherIngredients } = toSupplementPanelData(ings, [], opts)
    expect(panel.rows).toHaveLength(1)
    expect(otherIngredients).toEqual(['Gelatin', 'Rice flour'])
  })
})
