// Adapter: calculateLabel() result → PanelData for the @ilaunchify/ui
// NutritionFactsRenderer. Keeps the renderer dumb — all math lives in the engine.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import type { LabelResult } from './engine'
import { dailyValuesFor, type Nutrients, type NutritionAudience } from './nutrients'
import {
  roundCalories, roundFat, roundGramMacro, roundCholSodium, roundMicro, roundDV,
} from './rounding'

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

// ---------------------------------------------------------------------------
// Shared row-building core. Both the per-serving panel (`toPanelData`) and the
// per-container panel (`perContainerPanel`) lay out the SAME row set with the
// SAME ids/labels/indents/footer — only the amount + %DV NUMBERS differ. The
// builder takes a "nutrient source" that returns a pre-rounded amount and an
// already-computed %DV per nutrient key, so the two panels stay in lockstep:
// add/remove a row in one place and both panels change together.
// ---------------------------------------------------------------------------

/** A label-ready value: FDA-rounded display amount + integer %DV (computed from
 *  the EXACT, unrounded value, per 21 CFR 101.9(c)). */
interface NutrientView {
  amount: number
  dv: number
}

/** Resolves label-ready values for one nutrient basis (per serving OR per
 *  container). `calories` is a single rounded integer; every other key returns
 *  an amount + %DV view. */
interface NutrientSource {
  calories: number
  view: (key: keyof Nutrients) => NutrientView
}

function buildRows(src: NutrientSource, audience: NutritionAudience, showVoluntaryFats: boolean): NutrientRow[] {
  const dv = dailyValuesFor(audience)
  const isInfant = audience === 'INFANT_0_12'
  /** %DV to display: the computed value when a DV exists for this audience, else undefined. */
  const pct = (key: keyof Nutrients, computed: number): number | undefined =>
    dv[key] != null ? computed : undefined

  const totalFat = src.view('totalFat')
  const rows: NutrientRow[] = [
    { id: 'calories', label: 'Calories', amount: src.calories, indent: 0 },
    { id: 'totalFat', label: 'Total Fat', amount: totalFat.amount, unit: 'g', percentDailyValue: pct('totalFat', totalFat.dv), indent: 0 },
  ]
  // Infants 0–12 mo: saturated fat, trans fat and cholesterol are not declared
  // (no DV established; fat is not restricted for infants). They appear for
  // GENERAL and CHILD_1_3.
  if (!isInfant) {
    const sat = src.view('saturatedFat')
    const trans = src.view('transFat')
    rows.push(
      { id: 'saturatedFat', label: 'Saturated Fat', amount: sat.amount, unit: 'g', percentDailyValue: pct('saturatedFat', sat.dv), indent: 1 },
      { id: 'transFat', label: 'Trans Fat', amount: trans.amount, unit: 'g', indent: 1 },
    )
  }
  if (showVoluntaryFats) {
    const poly = src.view('polyunsaturatedFat')
    const mono = src.view('monounsaturatedFat')
    if (poly.amount > 0)
      rows.push({ id: 'polyFat', label: 'Polyunsaturated Fat', amount: poly.amount, unit: 'g', indent: 1 })
    if (mono.amount > 0)
      rows.push({ id: 'monoFat', label: 'Monounsaturated Fat', amount: mono.amount, unit: 'g', indent: 1 })
  }
  if (!isInfant) {
    const chol = src.view('cholesterol')
    rows.push({ id: 'cholesterol', label: 'Cholesterol', amount: chol.amount, unit: 'mg', percentDailyValue: pct('cholesterol', chol.dv), indent: 0 })
  }
  const sodium = src.view('sodium')
  const carb = src.view('totalCarbohydrate')
  const fiber = src.view('dietaryFiber')
  const sugars = src.view('totalSugars')
  const added = src.view('addedSugars')
  rows.push(
    { id: 'sodium', label: 'Sodium', amount: sodium.amount, unit: 'mg', percentDailyValue: pct('sodium', sodium.dv), indent: 0 },
    { id: 'totalCarbohydrate', label: 'Total Carbohydrate', amount: carb.amount, unit: 'g', percentDailyValue: pct('totalCarbohydrate', carb.dv), indent: 0 },
    { id: 'dietaryFiber', label: 'Dietary Fiber', amount: fiber.amount, unit: 'g', percentDailyValue: pct('dietaryFiber', fiber.dv), indent: 1 },
    { id: 'totalSugars', label: 'Total Sugars', amount: sugars.amount, unit: 'g', indent: 1 },
    { id: 'addedSugars', label: 'Includes Added Sugars', amount: added.amount, unit: 'g', percentDailyValue: pct('addedSugars', added.dv), indent: 2 },
  )
  const sugarAlcohol = src.view('sugarAlcohol')
  if (sugarAlcohol.amount > 0)
    rows.push({ id: 'sugarAlcohol', label: 'Sugar Alcohol', amount: sugarAlcohol.amount, unit: 'g', indent: 1 })
  const protein = src.view('protein')
  const vitD = src.view('vitaminD')
  const calcium = src.view('calcium')
  const iron = src.view('iron')
  const potassium = src.view('potassium')
  rows.push(
    // Protein %DV is voluntary for general food (only required with a protein
    // claim) but MANDATORY for infant/toddler foods (21 CFR 101.9(c)(7)(i)).
    { id: 'protein', label: 'Protein', amount: protein.amount, unit: 'g', percentDailyValue: audience === 'GENERAL' ? undefined : pct('protein', protein.dv), indent: 0 },
    { id: 'vitaminD', label: 'Vitamin D', amount: vitD.amount, unit: 'mcg', percentDailyValue: pct('vitaminD', vitD.dv), indent: 0 },
    { id: 'calcium', label: 'Calcium', amount: calcium.amount, unit: 'mg', percentDailyValue: pct('calcium', calcium.dv), indent: 0 },
    { id: 'iron', label: 'Iron', amount: iron.amount, unit: 'mg', percentDailyValue: pct('iron', iron.dv), indent: 0 },
    { id: 'potassium', label: 'Potassium', amount: potassium.amount, unit: 'mg', percentDailyValue: pct('potassium', potassium.dv), indent: 0 },
  )
  return rows
}

// FDA rounding function per nutrient key (21 CFR 101.9(c)). Used to round the
// per-container exact amounts the same way the engine rounds per-serving ones.
const ROUNDER: Partial<Record<keyof Nutrients, (v: number) => number>> = {
  totalFat: roundFat,
  saturatedFat: roundFat,
  transFat: roundFat,
  polyunsaturatedFat: roundFat,
  monounsaturatedFat: roundFat,
  cholesterol: roundCholSodium,
  sodium: roundCholSodium,
  totalCarbohydrate: roundGramMacro,
  dietaryFiber: roundGramMacro,
  totalSugars: roundGramMacro,
  addedSugars: roundGramMacro,
  sugarAlcohol: roundGramMacro,
  protein: roundGramMacro,
  vitaminD: roundMicro,
  calcium: roundMicro,
  iron: roundMicro,
  potassium: roundMicro,
}

export function toPanelData(result: LabelResult, opts: PanelOptions = {}): PanelData {
  const ps = result.perServing
  const g = result.geometry
  const serving = opts.suggestedServing
    ? `${opts.suggestedServing} (${Math.round(g.servingSizeG)}g)`
    : `${Math.round(g.servingSizeG)}g`

  // Audience-aware %DV (21 CFR 101.9(j)(5)). A nutrient's %DV is shown only when
  // FDA has established a Daily Value for that age group; absent → column omitted.
  const audience: NutritionAudience = opts.audience ?? result.audience ?? 'GENERAL'

  // Per-serving source: the engine already rounded amounts and computed %DV.
  const perServingMap: Partial<Record<keyof Nutrients, NutrientView>> = {
    totalFat: ps.totalFat,
    saturatedFat: ps.saturatedFat,
    transFat: { amount: ps.transFat.amount, dv: 0 },
    polyunsaturatedFat: { amount: ps.polyunsaturatedFat.amount, dv: 0 },
    monounsaturatedFat: { amount: ps.monounsaturatedFat.amount, dv: 0 },
    cholesterol: ps.cholesterol,
    sodium: ps.sodium,
    totalCarbohydrate: ps.totalCarbohydrate,
    dietaryFiber: ps.dietaryFiber,
    totalSugars: { amount: ps.totalSugars.amount, dv: 0 },
    addedSugars: ps.addedSugars,
    sugarAlcohol: { amount: ps.sugarAlcohol.amount, dv: 0 },
    protein: ps.protein,
    vitaminD: ps.vitaminD,
    calcium: ps.calcium,
    iron: ps.iron,
    potassium: ps.potassium,
  }
  const src: NutrientSource = {
    calories: ps.calories,
    view: (key) => perServingMap[key] ?? { amount: 0, dv: 0 },
  }

  return {
    format: opts.format ?? 'STANDARD',
    rows: buildRows(src, audience, opts.showVoluntaryFats ?? false),
    servingSize: serving,
    servingsPerContainer: g.servingsPerContainerLabel,
    requiredFooter: audience === 'GENERAL' ? FOOTER : FOOTER_CHILD,
    requiredWarnings: [],
  }
}

// ---------------------------------------------------------------------------
// Per-container panel (21 CFR 101.9(e), dual-column "per serving | per
// container" format). Same row structure/labels/footer as toPanelData, but
// every amount is the WHOLE-CONTAINER quantity:
//
//   per-container exact = batch[k] / max(1, packagesMade)
//
// Each exact amount is rounded with the SAME FDA rounding fn the engine uses
// per-serving, and %DV is recomputed from the exact (unrounded) value against
// the SAME audience DV table. By routing through the shared buildRows + the
// engine's rounding fns, this stays in lockstep with toPanelData.
// ---------------------------------------------------------------------------

export function perContainerPanel(
  result: LabelResult,
  opts: { audience?: NutritionAudience; suggestedServing?: string } = {},
): PanelData {
  const g = result.geometry
  const batch = result.raw.batch
  const packages = Math.max(1, g.packagesMade)

  const audience: NutritionAudience = opts.audience ?? result.audience ?? 'GENERAL'
  const dvTable = dailyValuesFor(audience)

  /** Per-container EXACT value for a nutrient key. */
  const exact = (key: keyof Nutrients): number => (batch[key] ?? 0) / packages

  const view = (key: keyof Nutrients): NutrientView => {
    const ex = exact(key)
    const round = ROUNDER[key]
    const amount = round ? round(ex) : ex
    const dvRef = dvTable[key]
    // %DV from the EXACT value, not the rounded display amount (FDA rule).
    const dv = dvRef ? roundDV((ex / dvRef) * 100) : 0
    return { amount, dv }
  }

  const src: NutrientSource = {
    calories: roundCalories(exact('calories')),
    view,
  }

  // Serving size string mirrors toPanelData (still the single-serving size).
  const serving = opts.suggestedServing
    ? `${opts.suggestedServing} (${Math.round(g.servingSizeG)}g)`
    : `${Math.round(g.servingSizeG)}g`

  return {
    format: 'STANDARD',
    rows: buildRows(src, audience, false),
    servingSize: serving,
    servingsPerContainer: g.servingsPerContainerLabel,
    requiredFooter: audience === 'GENERAL' ? FOOTER : FOOTER_CHILD,
    requiredWarnings: [],
  }
}
