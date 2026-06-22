import { describe, it, expect } from 'vitest'
import {
  panelDataToNutritionPanelData,
  varietyColumnsToAggregateNutritionData,
  panelDataToSupplementPanelData,
  petLabelToAafcoPanelData,
} from './nutritionPanelAdapter'
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

describe('varietyColumnsToAggregateNutritionData', () => {
  const berry: PanelData = { ...PANEL, servingSize: '1 bar (40g)' }
  const out = varietyColumnsToAggregateNutritionData([
    { label: 'Strawberry', panel: berry },
    { label: 'Vanilla', panel: PANEL },
  ])

  it('makes one column per flavor (name + adapted panel body)', () => {
    expect(out.flavors).toHaveLength(2)
    expect(out.flavors[0]!.name).toBe('Strawberry')
    expect(out.flavors[0]!.servingSize).toBe('1 bar (40g)')
    expect(out.flavors[0]!.calories).toBe(120)
    expect(out.flavors[0]!.rows.find((r) => r.label === 'Sodium')!.value).toBe('35mg')
  })

  it('shares the FDA footnote from the first column', () => {
    expect(out.footnote).toBe('* The % Daily Value (DV)…')
  })
})

describe('panelDataToSupplementPanelData', () => {
  const suppPanel: PanelData = {
    ...PANEL,
    servingSize: '2 capsules',
    servingsPerContainer: '30',
    rows: [
      { id: 'vitd', label: 'Vitamin D', amount: 25, unit: 'mcg', percentDailyValue: 125, indent: 0 },
      { id: 'blend', label: 'Adaptogen Blend', amount: 300, unit: 'mg', indent: 0 },
      { id: 'ashwa', label: 'Ashwagandha', amount: 200, unit: 'mg', indent: 1 },
    ],
  }
  const out = panelDataToSupplementPanelData(suppPanel, ['Hypromellose', '  microcrystalline cellulose '])

  it('maps every nutrient to a row with formatted value (no calories lift)', () => {
    expect(out.servingSize).toBe('2 capsules')
    expect(out.servingsPerContainer).toBe(30)
    expect(out.rows).toHaveLength(3)
    expect(out.rows[0]).toMatchObject({ label: 'Vitamin D', value: '25mcg', dvPercent: 125 })
  })

  it('keeps null %DV (botanicals/blends render "†") and sub-row indent', () => {
    expect(out.rows[1]!.dvPercent).toBeNull()
    expect(out.rows[2]!.indent).toBe(1)
  })

  it('formats trimmed other-ingredients into the below-box line', () => {
    expect(out.otherIngredients).toBe('Other ingredients: Hypromellose, microcrystalline cellulose.')
  })
})

describe('petLabelToAafcoPanelData', () => {
  const out = petLabelToAafcoPanelData({
    gaRows: [
      { label: 'Crude Protein (min)', value: '26.0%' },
      { label: 'Moisture (max)', value: '10.0%' },
    ],
    ingredients: 'Deboned chicken, brown rice, peas.',
    adequacyStatement: 'Formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance.',
    feedingDirections: 'Feed 1 cup per 30 lbs daily.',
  })

  it('splits the min/max qualifier out of the GA label', () => {
    expect(out.analysis[0]).toEqual({ label: 'Crude Protein', qualifier: 'min', value: '26.0%' })
    expect(out.analysis[1]).toEqual({ label: 'Moisture', qualifier: 'max', value: '10.0%' })
  })

  it('carries ingredients + feeding + adequacy', () => {
    expect(out.ingredients).toBe('Deboned chicken, brown rice, peas.')
    expect(out.feedingDirections).toBe('Feed 1 cup per 30 lbs daily.')
    expect(out.nutritionalAdequacy).toMatch(/AAFCO Dog Food/)
  })
})
