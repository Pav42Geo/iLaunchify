import { describe, it, expect } from 'vitest'
import { panelDataToNutritionPanelData } from './nutritionPanelAdapter'
import type { PanelData } from '@ilaunchify/types'

// Mirrors the real buildRows() output shape (packages/nutrition/panel-adapter.ts):
// calories is a row (id 'calories', no unit/DV); addedSugars is a row (id
// 'addedSugars', label "Includes Added Sugars", indent 2); majors are indent 0.
const PANEL: PanelData = {
  format: 'STANDARD',
  servingSize: '1 scoop (32g)',
  servingsPerContainer: '30',
  requiredFooter: '* The % Daily Value (DV)…',
  requiredWarnings: [],
  rows: [
    { id: 'calories', label: 'Calories', amount: 120, indent: 0 },
    { id: 'totalFat', label: 'Total Fat', amount: 1, unit: 'g', percentDailyValue: 1, indent: 0 },
    { id: 'saturatedFat', label: 'Saturated Fat', amount: 0, unit: 'g', percentDailyValue: 0, indent: 1 },
    { id: 'sodium', label: 'Sodium', amount: 35, unit: 'mg', percentDailyValue: 2, indent: 0 },
    { id: 'totalSugars', label: 'Total Sugars', amount: 0, unit: 'g', indent: 1 },
    { id: 'addedSugars', label: 'Includes Added Sugars', amount: 0, unit: 'g', percentDailyValue: 0, indent: 2 },
    { id: 'protein', label: 'Protein', amount: 24, unit: 'g', indent: 0 },
    { id: 'vitaminD', label: 'Vitamin D', amount: 0, unit: 'mcg', percentDailyValue: 0, indent: 0 },
  ],
}

describe('panelDataToNutritionPanelData', () => {
  const out = panelDataToNutritionPanelData(PANEL)

  it('lifts Calories out of rows into the calories field', () => {
    expect(out.calories).toBe(120)
    expect(out.rows.some((r) => /calories/i.test(r.label))).toBe(false)
  })

  it('lifts Added Sugars into addedSugarG (not a row)', () => {
    expect(out.addedSugarG).toBe(0)
    expect(out.rows.some((r) => /added sugars/i.test(r.label))).toBe(false)
  })

  it('bolds only the FDA majors (not sub-items or vitamins)', () => {
    const byLabel = Object.fromEntries(out.rows.map((r) => [r.label, r]))
    expect(byLabel['Total Fat']!.bold).toBe(true)
    expect(byLabel['Sodium']!.bold).toBe(true)
    expect(byLabel['Protein']!.bold).toBe(true)
    expect(byLabel['Saturated Fat']!.bold).toBeUndefined()
    expect(byLabel['Vitamin D']!.bold).toBeUndefined() // indent 0 but NOT bold
  })

  it('formats the value cell + maps DV + indent', () => {
    const byLabel = Object.fromEntries(out.rows.map((r) => [r.label, r]))
    expect(byLabel['Total Fat']!.value).toBe('1g')
    expect(byLabel['Sodium']!.value).toBe('35mg')
    expect(byLabel['Total Fat']!.dvPercent).toBe(1)
    expect(byLabel['Total Sugars']!.dvPercent).toBe(null) // no DV → null
    expect(byLabel['Saturated Fat']!.indent).toBe(1)
  })

  it('carries serving + footnote through', () => {
    expect(out.servingSize).toBe('1 scoop (32g)')
    expect(out.servingsPerContainer).toBe('30')
    expect(out.footnote).toBe('* The % Daily Value (DV)…')
  })
})
