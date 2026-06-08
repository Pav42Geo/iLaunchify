// Adapter: calculateLabel() result → PanelData for the @ilaunchify/ui
// NutritionFactsRenderer. Keeps the renderer dumb — all math lives in the engine.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import type { LabelResult } from './engine'

export interface PanelOptions {
  /** Descriptive serving, e.g. "1 cup" or "4". Combined with grams. */
  suggestedServing?: string
  /** 'STANDARD' (Nutrition Facts) | 'SUPPLEMENT_FACTS' | 'TABULAR' | 'LINEAR'. */
  format?: PanelData['format']
  /** Voluntary rows: include poly/mono fat + sugar alcohol when present. */
  showVoluntaryFats?: boolean
}

const FOOTER =
  '* The % Daily Value (DV) tells you how much a nutrient in a serving of food ' +
  'contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.'

export function toPanelData(result: LabelResult, opts: PanelOptions = {}): PanelData {
  const ps = result.perServing
  const g = result.geometry
  const serving = opts.suggestedServing
    ? `${opts.suggestedServing} (${Math.round(g.servingSizeG)}g)`
    : `${Math.round(g.servingSizeG)}g`

  const rows: NutrientRow[] = [
    { id: 'calories', label: 'Calories', amount: ps.calories, indent: 0 },
    { id: 'totalFat', label: 'Total Fat', amount: ps.totalFat.amount, unit: 'g', percentDailyValue: ps.totalFat.dv, indent: 0 },
    { id: 'saturatedFat', label: 'Saturated Fat', amount: ps.saturatedFat.amount, unit: 'g', percentDailyValue: ps.saturatedFat.dv, indent: 1 },
    { id: 'transFat', label: 'Trans Fat', amount: ps.transFat.amount, unit: 'g', indent: 1 },
  ]
  if (opts.showVoluntaryFats) {
    if (ps.polyunsaturatedFat.amount > 0)
      rows.push({ id: 'polyFat', label: 'Polyunsaturated Fat', amount: ps.polyunsaturatedFat.amount, unit: 'g', indent: 1 })
    if (ps.monounsaturatedFat.amount > 0)
      rows.push({ id: 'monoFat', label: 'Monounsaturated Fat', amount: ps.monounsaturatedFat.amount, unit: 'g', indent: 1 })
  }
  rows.push(
    { id: 'cholesterol', label: 'Cholesterol', amount: ps.cholesterol.amount, unit: 'mg', percentDailyValue: ps.cholesterol.dv, indent: 0 },
    { id: 'sodium', label: 'Sodium', amount: ps.sodium.amount, unit: 'mg', percentDailyValue: ps.sodium.dv, indent: 0 },
    { id: 'totalCarbohydrate', label: 'Total Carbohydrate', amount: ps.totalCarbohydrate.amount, unit: 'g', percentDailyValue: ps.totalCarbohydrate.dv, indent: 0 },
    { id: 'dietaryFiber', label: 'Dietary Fiber', amount: ps.dietaryFiber.amount, unit: 'g', percentDailyValue: ps.dietaryFiber.dv, indent: 1 },
    { id: 'totalSugars', label: 'Total Sugars', amount: ps.totalSugars.amount, unit: 'g', indent: 1 },
    { id: 'addedSugars', label: 'Includes Added Sugars', amount: ps.addedSugars.amount, unit: 'g', percentDailyValue: ps.addedSugars.dv, indent: 2 },
  )
  if (ps.sugarAlcohol.amount > 0)
    rows.push({ id: 'sugarAlcohol', label: 'Sugar Alcohol', amount: ps.sugarAlcohol.amount, unit: 'g', indent: 1 })
  rows.push(
    // Protein %DV is voluntary on US labels (only required with a protein claim) — omitted.
    { id: 'protein', label: 'Protein', amount: ps.protein.amount, unit: 'g', indent: 0 },
    { id: 'vitaminD', label: 'Vitamin D', amount: ps.vitaminD.amount, unit: 'mcg', percentDailyValue: ps.vitaminD.dv, indent: 0 },
    { id: 'calcium', label: 'Calcium', amount: ps.calcium.amount, unit: 'mg', percentDailyValue: ps.calcium.dv, indent: 0 },
    { id: 'iron', label: 'Iron', amount: ps.iron.amount, unit: 'mg', percentDailyValue: ps.iron.dv, indent: 0 },
    { id: 'potassium', label: 'Potassium', amount: ps.potassium.amount, unit: 'mg', percentDailyValue: ps.potassium.dv, indent: 0 },
  )

  return {
    format: opts.format ?? 'STANDARD',
    rows,
    servingSize: serving,
    servingsPerContainer: g.servingsPerContainerLabel,
    requiredFooter: FOOTER,
    requiredWarnings: [],
  }
}
