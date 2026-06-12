import { describe, it, expect } from 'vitest'
import { toSupplementPanelData, type DietaryIngredient, type ProprietaryBlend } from './supplement-facts'

describe('toSupplementPanelData', () => {
  const opts = { servingSize: '2 capsules', servingsPerContainer: 30 }

  it('renders standalone dietary ingredients with %DV and the right footnote', () => {
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
    expect(panel.requiredFooter).toContain('2,000 calorie')
    expect(otherIngredients).toEqual([])
  })

  it('marks ingredients without an established DV (omits %DV, adds the † footnote)', () => {
    const ings: DietaryIngredient[] = [
      { id: 'l', name: 'L-Theanine', amountPerServing: 200, unit: 'mg', percentDV: null },
    ]
    const { panel } = toSupplementPanelData(ings, [], opts)
    expect(panel.rows[0]?.percentDailyValue).toBeUndefined()
    expect(panel.requiredFooter).toContain('Daily Value (DV) not established')
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
    expect(panel.requiredFooter).toContain('proprietary blend')
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
