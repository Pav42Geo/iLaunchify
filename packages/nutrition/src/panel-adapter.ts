// Adapter: calculateLabel() result → PanelData for the @ilaunchify/ui
// NutritionFactsRenderer. Keeps the renderer dumb — all math lives in the engine.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import type { LabelResult } from './engine'
import { dailyValuesFor, type NutritionAudience } from './nutrients'

export interface PanelOptions {
  /** Descriptive serving, e.g. "1 cup" or "4". Combined with grams. */
  suggestedServing?: string
  /** 'STANDARD' (Nutrition Facts) | 'SUPPLEMENT_FACTS' | 'TABULAR' | 'LINEAR'. */
  format?: PanelData['format']
  /** Voluntary rows: include poly/mono fat + sugar alcohol when present. */
  showVoluntaryFats?: boolean
  /** Override the audience (defaults to the one the engine computed with). */
  audience?: NutritionAudience
}

const FOOTER =
  '* The % Daily Value (DV) tells you how much a nutrient in a serving of food ' +
  'contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.'

// Infant/toddler panels omit the "2,000 calories a day" general-advice sentence —
// that reference basis applies only to adults & children ≥ 4 (21 CFR 101.9(j)(5)).
const FOOTER_CHILD =
  '* The % Daily Value (DV) tells you how much a nutrient in a serving of food ' +
  'contributes to a daily diet.'

export function toPanelData(result: LabelResult, opts: PanelOptions = {}): PanelData {
  const ps = result.perServing
  const g = result.geometry
  const serving = opts.suggestedServing
    ? `${opts.suggestedServing} (${Math.round(g.servingSizeG)}g)`
    : `${Math.round(g.servingSizeG)}g`

  // Audience-aware %DV (21 CFR 101.9(j)(5)). A nutrient's %DV is shown only when
  // FDA has established a Daily Value for that age group; absent → column omitted.
  const audience: NutritionAudience = opts.audience ?? result.audience ?? 'GENERAL'
  const dv = dailyValuesFor(audience)
  const isInfant = audience === 'INFANT_0_12'
  /** %DV to display: the engine-computed value when a DV exists for this audience, else undefined. */
  const pct = (key: keyof typeof dv, computed: number): number | undefined =>
    dv[key] != null ? computed : undefined

  const rows: NutrientRow[] = [
    { id: 'calories', label: 'Calories', amount: ps.calories, indent: 0 },
    { id: 'totalFat', label: 'Total Fat', amount: ps.totalFat.amount, unit: 'g', percentDailyValue: pct('totalFat', ps.totalFat.dv), indent: 0 },
  ]
  // Infants 0–12 mo: saturated fat, trans fat and cholesterol are not declared
  // (no DV established; fat is not restricted for infants). They appear for
  // GENERAL and CHILD_1_3.
  if (!isInfant) {
    rows.push(
      { id: 'saturatedFat', label: 'Saturated Fat', amount: ps.saturatedFat.amount, unit: 'g', percentDailyValue: pct('saturatedFat', ps.saturatedFat.dv), indent: 1 },
      { id: 'transFat', label: 'Trans Fat', amount: ps.transFat.amount, unit: 'g', indent: 1 },
    )
  }
  if (opts.showVoluntaryFats) {
    if (ps.polyunsaturatedFat.amount > 0)
      rows.push({ id: 'polyFat', label: 'Polyunsaturated Fat', amount: ps.polyunsaturatedFat.amount, unit: 'g', indent: 1 })
    if (ps.monounsaturatedFat.amount > 0)
      rows.push({ id: 'monoFat', label: 'Monounsaturated Fat', amount: ps.monounsaturatedFat.amount, unit: 'g', indent: 1 })
  }
  if (!isInfant) {
    rows.push({ id: 'cholesterol', label: 'Cholesterol', amount: ps.cholesterol.amount, unit: 'mg', percentDailyValue: pct('cholesterol', ps.cholesterol.dv), indent: 0 })
  }
  rows.push(
    { id: 'sodium', label: 'Sodium', amount: ps.sodium.amount, unit: 'mg', percentDailyValue: pct('sodium', ps.sodium.dv), indent: 0 },
    { id: 'totalCarbohydrate', label: 'Total Carbohydrate', amount: ps.totalCarbohydrate.amount, unit: 'g', percentDailyValue: pct('totalCarbohydrate', ps.totalCarbohydrate.dv), indent: 0 },
    { id: 'dietaryFiber', label: 'Dietary Fiber', amount: ps.dietaryFiber.amount, unit: 'g', percentDailyValue: pct('dietaryFiber', ps.dietaryFiber.dv), indent: 1 },
    { id: 'totalSugars', label: 'Total Sugars', amount: ps.totalSugars.amount, unit: 'g', indent: 1 },
    { id: 'addedSugars', label: 'Includes Added Sugars', amount: ps.addedSugars.amount, unit: 'g', percentDailyValue: pct('addedSugars', ps.addedSugars.dv), indent: 2 },
  )
  if (ps.sugarAlcohol.amount > 0)
    rows.push({ id: 'sugarAlcohol', label: 'Sugar Alcohol', amount: ps.sugarAlcohol.amount, unit: 'g', indent: 1 })
  rows.push(
    // Protein %DV is voluntary for general food (only required with a protein
    // claim) but MANDATORY for infant/toddler foods (21 CFR 101.9(c)(7)(i)).
    { id: 'protein', label: 'Protein', amount: ps.protein.amount, unit: 'g', percentDailyValue: audience === 'GENERAL' ? undefined : pct('protein', ps.protein.dv), indent: 0 },
    { id: 'vitaminD', label: 'Vitamin D', amount: ps.vitaminD.amount, unit: 'mcg', percentDailyValue: pct('vitaminD', ps.vitaminD.dv), indent: 0 },
    { id: 'calcium', label: 'Calcium', amount: ps.calcium.amount, unit: 'mg', percentDailyValue: pct('calcium', ps.calcium.dv), indent: 0 },
    { id: 'iron', label: 'Iron', amount: ps.iron.amount, unit: 'mg', percentDailyValue: pct('iron', ps.iron.dv), indent: 0 },
    { id: 'potassium', label: 'Potassium', amount: ps.potassium.amount, unit: 'mg', percentDailyValue: pct('potassium', ps.potassium.dv), indent: 0 },
  )

  return {
    format: opts.format ?? 'STANDARD',
    rows,
    servingSize: serving,
    servingsPerContainer: g.servingsPerContainerLabel,
    requiredFooter: audience === 'GENERAL' ? FOOTER : FOOTER_CHILD,
    requiredWarnings: [],
  }
}
