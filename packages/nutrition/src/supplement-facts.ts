// Supplement Facts (21 CFR 101.36) panel builder — Phase 1 of the domain work.
//
// Supplements do NOT use the per-100g food math. Each dietary ingredient declares
// an AMOUNT PER SERVING directly (+ %DV when an RDI/DRV exists). The model differs
// from Nutrition Facts in three ways this adapter handles:
//   1. Ingredients WITHOUT an established Daily Value are allowed, marked "†".
//   2. PROPRIETARY BLENDS show the blend's total weight, then member ingredients
//      in descending order WITHOUT per-component amounts.
//   3. "Other ingredients" (excipients: capsule shell, fillers) are declared in a
//      line BELOW the box, not inside the Supplement Facts panel.
//
// Output feeds the same @ilaunchify/ui NutritionFactsRenderer (format
// SUPPLEMENT_FACTS) the food path uses. docs/PRODUCT_DOMAINS_ARCHITECTURE.md.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import { DAILY_VALUES } from './nutrients'
import { roundCalories, roundFat, roundGramMacro, roundCholSodium, roundDV } from './rounding'

/** One dietary ingredient declared per serving. */
export interface DietaryIngredient {
  id: string
  /** Label name incl. source/plant part, e.g. "Vitamin C (as ascorbic acid)". */
  name: string
  amountPerServing: number
  unit: string // 'mg' | 'mcg' | 'g' | 'mcg DFE' | 'mg NE' | 'IU' …
  /** %DV when an RDI/DRV exists; null/undefined ⇒ "Daily Value not established" (†). */
  percentDV?: number | null
  /** Member of a proprietary blend (its amount is hidden; only the blend total shows). */
  blendId?: string | null
  /** Excipient — declared in the "Other ingredients" line below the box, not in the panel. */
  isOtherIngredient?: boolean
  /** Descending-order weight within a blend (higher = listed first). */
  sortWeight?: number
}

export interface ProprietaryBlend {
  id: string
  name: string // "Energy Blend"
  totalAmount: number
  unit: string
  percentDV?: number | null
}

/**
 * Mandatory-when-present "nutrition information" for a Supplement Facts panel
 * (21 CFR 101.36(b)(2)): Calories, fats, cholesterol, sodium, carbs, sugars and
 * protein declared above the dietary ingredients, with %DV from the standard food
 * Daily Values. All optional — a row only appears when a value > 0 is given.
 * Declaring fat / sat fat / carb / fiber / protein triggers the 2,000-cal footnote.
 */
export interface SupplementNutrition {
  calories?: number
  totalFat?: number
  saturatedFat?: number
  transFat?: number
  cholesterol?: number
  sodium?: number
  totalCarbohydrate?: number
  dietaryFiber?: number
  totalSugars?: number
  addedSugars?: number
  protein?: number
}

export interface SupplementPanelOptions {
  /** Serving form, e.g. "1 capsule", "2 gummies", "1 scoop (5 g)". */
  servingSize: string
  servingsPerContainer: string | number
  /** Optional Calories/fat/carb/sugars/protein block declared above the ingredients. */
  nutrition?: SupplementNutrition
}

/** Build the FDA-ordered Calories/fat/carb/sugars/protein rows shown above the
 *  dietary ingredients. %DV uses the standard food Daily Values (21 CFR 101.9). */
function buildNutritionRows(n: SupplementNutrition): NutrientRow[] {
  const rows: NutrientRow[] = []
  const pct = (amt: number, key: keyof typeof DAILY_VALUES): number | undefined => {
    const dv = DAILY_VALUES[key]
    return dv ? roundDV((amt / dv) * 100) : undefined
  }
  const pos = (v?: number): v is number => typeof v === 'number' && v > 0

  if (pos(n.calories)) rows.push({ id: 'calories', label: 'Calories', amount: roundCalories(n.calories), indent: 0 })
  if (pos(n.totalFat)) {
    rows.push({ id: 'totalFat', label: 'Total Fat', amount: roundFat(n.totalFat), unit: 'g', percentDailyValue: pct(n.totalFat, 'totalFat'), indent: 0 })
    if (pos(n.saturatedFat)) rows.push({ id: 'saturatedFat', label: 'Saturated Fat', amount: roundFat(n.saturatedFat), unit: 'g', percentDailyValue: pct(n.saturatedFat, 'saturatedFat'), indent: 1 })
    if (pos(n.transFat)) rows.push({ id: 'transFat', label: 'Trans Fat', amount: roundFat(n.transFat), unit: 'g', indent: 1 })
  }
  if (pos(n.cholesterol)) rows.push({ id: 'cholesterol', label: 'Cholesterol', amount: roundCholSodium(n.cholesterol), unit: 'mg', percentDailyValue: pct(n.cholesterol, 'cholesterol'), indent: 0 })
  if (pos(n.sodium)) rows.push({ id: 'sodium', label: 'Sodium', amount: roundCholSodium(n.sodium), unit: 'mg', percentDailyValue: pct(n.sodium, 'sodium'), indent: 0 })
  if (pos(n.totalCarbohydrate)) {
    rows.push({ id: 'totalCarbohydrate', label: 'Total Carbohydrate', amount: roundGramMacro(n.totalCarbohydrate), unit: 'g', percentDailyValue: pct(n.totalCarbohydrate, 'totalCarbohydrate'), indent: 0 })
    if (pos(n.dietaryFiber)) rows.push({ id: 'dietaryFiber', label: 'Dietary Fiber', amount: roundGramMacro(n.dietaryFiber), unit: 'g', percentDailyValue: pct(n.dietaryFiber, 'dietaryFiber'), indent: 1 })
    if (pos(n.totalSugars)) rows.push({ id: 'totalSugars', label: 'Total Sugars', amount: roundGramMacro(n.totalSugars), unit: 'g', indent: 1 })
    if (pos(n.addedSugars)) rows.push({ id: 'addedSugars', label: 'Includes Added Sugars', amount: roundGramMacro(n.addedSugars), unit: 'g', percentDailyValue: pct(n.addedSugars, 'addedSugars'), indent: 2 })
  }
  if (pos(n.protein)) rows.push({ id: 'protein', label: 'Protein', amount: roundGramMacro(n.protein), unit: 'g', percentDailyValue: pct(n.protein, 'protein'), indent: 0 })
  return rows
}

export interface SupplementPanelResult {
  panel: PanelData
  /** Rendered BELOW the box: "Other ingredients: gelatin, rice flour, …". */
  otherIngredients: string[]
}

// FDA wording (21 CFR 101.36(b)(2)(iii)(F) / (b)(3)). The "†" symbol sits in the
// % Daily Value column for ingredients without an established DV.
const FOOTER_DV = '† Daily Value Not Established.'
// The "Percent Daily Values are based on a 2,000 calorie diet" footnote is ONLY
// required when total fat, saturated fat, total carbohydrate, dietary fiber, or
// protein are declared (101.36(b)(2)(iii)(D)) — never for a vitamins/minerals
// or herbal supplement. The current model declares none of those, so it is omitted.
const MACRO_DV_KEYS = new Set(['totalFat', 'saturatedFat', 'totalCarbohydrate', 'dietaryFiber', 'protein'])
const FOOTER_PCT = '* Percent Daily Values are based on a 2,000 calorie diet.'

/** Build a Supplement Facts PanelData from dietary ingredients + blends. */
export function toSupplementPanelData(
  ingredients: DietaryIngredient[],
  blends: ProprietaryBlend[],
  opts: SupplementPanelOptions,
): SupplementPanelResult {
  const panelIngredients = ingredients.filter((i) => !i.isOtherIngredient)
  const otherIngredients = ingredients.filter((i) => i.isOtherIngredient).map((i) => i.name)

  // FDA "nutrition information" (Calories / fats / carbs / sugars / protein) is
  // declared ABOVE the dietary ingredients when present.
  const rows: NutrientRow[] = opts.nutrition ? buildNutritionRows(opts.nutrition) : []
  let anyNoDV = false

  // Standalone (non-blend) ingredients first, in given order. Ingredients without
  // an established DV get a "†" in the % Daily Value column (noDailyValue).
  for (const ing of panelIngredients.filter((i) => !i.blendId)) {
    const hasDV = ing.percentDV != null
    if (!hasDV) anyNoDV = true
    rows.push({
      id: ing.id,
      label: ing.name,
      amount: `${formatAmount(ing.amountPerServing)} ${ing.unit}`.trim(),
      ...(hasDV ? { percentDailyValue: ing.percentDV as number } : { noDailyValue: true }),
      indent: 0,
    })
  }

  // Each proprietary blend: name + total weight on one line, then members (no
  // amounts) in descending predominance order. The blend line carries the "†"
  // (it has no DV); DV-bearing ingredients must be declared separately, not hidden
  // in a blend (21 CFR 101.36(c)).
  for (const blend of blends) {
    const members = panelIngredients
      .filter((i) => i.blendId === blend.id)
      .sort((a, b) => (b.sortWeight ?? 0) - (a.sortWeight ?? 0))
    if (members.length === 0) continue
    const hasDV = blend.percentDV != null
    if (!hasDV) anyNoDV = true
    rows.push({
      id: blend.id,
      label: blend.name,
      amount: `${formatAmount(blend.totalAmount)} ${blend.unit}`.trim(),
      ...(hasDV ? { percentDailyValue: blend.percentDV as number } : { noDailyValue: true }),
      indent: 0,
    })
    for (const m of members) {
      rows.push({ id: m.id, label: m.name, amount: '', indent: 1 })
    }
  }

  const footerParts: string[] = []
  // 2,000-cal footnote only when a calorie-based DRV nutrient is actually declared.
  const hasMacroDV = rows.some((r) => MACRO_DV_KEYS.has(r.id) && r.percentDailyValue != null)
  if (hasMacroDV) footerParts.push(FOOTER_PCT)
  if (anyNoDV) footerParts.push(FOOTER_DV)

  const panel: PanelData = {
    format: 'SUPPLEMENT_FACTS',
    rows,
    servingSize: opts.servingSize,
    servingsPerContainer: String(opts.servingsPerContainer),
    requiredFooter: footerParts.join(' '),
    requiredWarnings: [],
  }
  return { panel, otherIngredients }
}

/** Trim trailing zeros: 100.0 → "100", 2.50 → "2.5". */
function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1000) / 1000)
}
