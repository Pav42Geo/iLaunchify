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
  /** Print "<" before the amount (trace declaration, e.g. "<1 g"). */
  amountLessThan?: boolean
  /** Print "<" before the %DV (e.g. "<1%"). */
  dvLessThan?: boolean
  /** A footnote symbol attached to THIS row's %DV cell (e.g. "*", "**"). When the
   *  row has no DV it replaces the default symbol; otherwise it is appended. Define
   *  the symbol's meaning via SupplementPanelOptions.customFootnotes. */
  symbol?: string
}

export interface ProprietaryBlend {
  id: string
  name: string // "Energy Blend"
  totalAmount: number
  unit: string
  percentDV?: number | null
  amountLessThan?: boolean
  symbol?: string
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
  /** Per-nutrient "<" trace flags for the nutrition block (e.g. Total Sugars "<0.5 g"). */
  nutritionLessThan?: Partial<Record<keyof SupplementNutrition, boolean>>
  /** Footnote glyph for ingredients with no established DV. Default "†". A brand may
   *  choose "‡", "*", "**" to match house style — engine keeps it consistent. */
  noDvSymbol?: string
  /** Footnote glyph for the "2,000 calorie diet" note appended to calorie-based %DVs.
   *  Default "*". */
  caloriePctSymbol?: string
  /** Extra footnote lines for any custom row symbols, e.g. { symbol: '‡', text: '…' }. */
  customFootnotes?: Array<{ symbol: string; text: string }>
}

export interface SupplementPanelResult {
  panel: PanelData
  /** Rendered BELOW the box: "Other ingredients: gelatin, rice flour, …". */
  otherIngredients: string[]
}

// Calorie-based %DV nutrients (101.36(b)(2)(iii)(D)): their %DV carries the
// "2,000 calorie diet" footnote symbol, and declaring any of them requires that
// footnote. Cholesterol/Sodium have fixed (non-calorie) DVs, so they're excluded.
const CALORIE_BASIS_KEYS = new Set<keyof SupplementNutrition>([
  'totalFat', 'saturatedFat', 'totalCarbohydrate', 'dietaryFiber', 'addedSugars', 'protein',
])

/** Build the FDA-ordered Calories/fat/carb/sugars/protein rows above the dietary
 *  ingredients. %DV uses the standard food Daily Values; calorie-based %DVs carry
 *  `pctSymbol`. Honors per-nutrient "<" trace flags. */
function buildNutritionRows(
  n: SupplementNutrition,
  lessThan: Partial<Record<keyof SupplementNutrition, boolean>>,
  pctSymbol: string,
): { rows: NutrientRow[]; usesCalorieBasis: boolean } {
  const rows: NutrientRow[] = []
  let usesCalorieBasis = false
  const pos = (v?: number): v is number => typeof v === 'number' && v > 0

  const add = (key: keyof SupplementNutrition, label: string, rounded: number, unit: string, indent: number, hasDv: boolean) => {
    const dv = DAILY_VALUES[key as keyof typeof DAILY_VALUES]
    const lt = lessThan[key]
    let percent: number | undefined
    let dvText: string | undefined
    if (hasDv && dv) {
      percent = roundDV((rounded / dv) * 100)
      const sym = CALORIE_BASIS_KEYS.has(key) ? pctSymbol : ''
      if (CALORIE_BASIS_KEYS.has(key)) usesCalorieBasis = true
      dvText = `${lt ? '<' : ''}${percent}%${sym}`
    }
    rows.push({
      id: key, label, amount: fmtAmount(rounded, unit, lt), unit: undefined, indent,
      ...(percent !== undefined ? { percentDailyValue: percent } : {}),
      ...(dvText !== undefined ? { dvText } : {}),
    })
  }

  if (pos(n.calories)) add('calories', 'Calories', roundCalories(n.calories), '', 0, false)
  if (pos(n.totalFat)) {
    add('totalFat', 'Total Fat', roundFat(n.totalFat), 'g', 0, true)
    if (pos(n.saturatedFat)) add('saturatedFat', 'Saturated Fat', roundFat(n.saturatedFat), 'g', 1, true)
    if (pos(n.transFat)) add('transFat', 'Trans Fat', roundFat(n.transFat), 'g', 1, false)
  }
  if (pos(n.cholesterol)) add('cholesterol', 'Cholesterol', roundCholSodium(n.cholesterol), 'mg', 0, true)
  if (pos(n.sodium)) add('sodium', 'Sodium', roundCholSodium(n.sodium), 'mg', 0, true)
  if (pos(n.totalCarbohydrate)) {
    add('totalCarbohydrate', 'Total Carbohydrate', roundGramMacro(n.totalCarbohydrate), 'g', 0, true)
    if (pos(n.dietaryFiber)) add('dietaryFiber', 'Dietary Fiber', roundGramMacro(n.dietaryFiber), 'g', 1, true)
    if (pos(n.totalSugars)) add('totalSugars', 'Total Sugars', roundGramMacro(n.totalSugars), 'g', 1, false)
    if (pos(n.addedSugars)) add('addedSugars', 'Includes Added Sugars', roundGramMacro(n.addedSugars), 'g', 2, true)
  }
  if (pos(n.protein)) add('protein', 'Protein', roundGramMacro(n.protein), 'g', 0, true)
  return { rows, usesCalorieBasis }
}

/** Build a Supplement Facts PanelData from dietary ingredients + blends. */
export function toSupplementPanelData(
  ingredients: DietaryIngredient[],
  blends: ProprietaryBlend[],
  opts: SupplementPanelOptions,
): SupplementPanelResult {
  const noDvSymbol = opts.noDvSymbol || '†'
  const pctSymbol = opts.caloriePctSymbol || '*'
  const panelIngredients = ingredients.filter((i) => !i.isOtherIngredient)
  const otherIngredients = ingredients.filter((i) => i.isOtherIngredient).map((i) => cleanLabel(i.name))

  // FDA "nutrition information" (Calories / fats / carbs / sugars / protein) above
  // the dietary ingredients.
  const nut = opts.nutrition
    ? buildNutritionRows(opts.nutrition, opts.nutritionLessThan ?? {}, pctSymbol)
    : { rows: [] as NutrientRow[], usesCalorieBasis: false }
  const rows: NutrientRow[] = [...nut.rows]
  let usesDefaultNoDv = false

  // The %DV cell for a dietary ingredient / blend: a percentage (with optional "<"
  // and appended symbol), or the no-DV footnote glyph.
  const dvCellFor = (hasDV: boolean, percent: number | null | undefined, lt?: boolean, sym?: string): string => {
    // The row's footnote symbol prints IN FRONT of the % Daily Value, with a thin
    // space so it doesn't crowd the number (e.g. "* 60%").
    if (hasDV) return `${sym ? sym + ' ' : ''}${lt ? '<' : ''}${percent}%`
    if (!sym) usesDefaultNoDv = true
    return sym || noDvSymbol
  }

  for (const ing of panelIngredients.filter((i) => !i.blendId)) {
    const hasDV = ing.percentDV != null
    rows.push({
      id: ing.id,
      label: cleanLabel(ing.name),
      amount: fmtAmount(ing.amountPerServing, ing.unit, ing.amountLessThan),
      dvText: dvCellFor(hasDV, ing.percentDV, ing.dvLessThan, ing.symbol),
      ...(hasDV ? { percentDailyValue: ing.percentDV as number } : { noDailyValue: true }),
      indent: 0,
    })
  }

  // Each proprietary blend: name + total weight on one line, then members (no
  // amounts) in descending predominance order. The blend line carries the no-DV
  // glyph; DV-bearing ingredients must be declared separately (21 CFR 101.36(c)).
  for (const blend of blends) {
    const members = panelIngredients
      .filter((i) => i.blendId === blend.id)
      .sort((a, b) => (b.sortWeight ?? 0) - (a.sortWeight ?? 0))
    if (members.length === 0) continue
    const hasDV = blend.percentDV != null
    rows.push({
      id: blend.id,
      label: cleanLabel(blend.name),
      amount: fmtAmount(blend.totalAmount, blend.unit, blend.amountLessThan),
      dvText: dvCellFor(hasDV, blend.percentDV, false, blend.symbol),
      ...(hasDV ? { percentDailyValue: blend.percentDV as number } : { noDailyValue: true }),
      indent: 0,
    })
    for (const m of members) {
      rows.push({ id: m.id, label: cleanLabel(m.name), amount: '', dvText: '', indent: 1 })
    }
  }

  // Footnotes, in the conventional order: calorie note, no-DV note, then any
  // custom-symbol notes the manufacturer defined.
  const footerParts: string[] = []
  if (nut.usesCalorieBasis) footerParts.push(`${pctSymbol} Percent Daily Values are based on a 2,000 calorie diet.`)
  if (usesDefaultNoDv) footerParts.push(`${noDvSymbol} Daily Value Not Established.`)
  for (const cf of opts.customFootnotes ?? []) {
    const sym = cf.symbol.trim()
    const text = cf.text.trim()
    if (sym && text) footerParts.push(`${sym} ${text}`)
  }

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

/** A declared amount string ("<1 g" / "5 g"), or '' when zero/blank so unfilled
 *  rows don't print a misleading "0 mg". */
function fmtAmount(value: number, unit: string, lessThan?: boolean): string {
  if (!(value > 0)) return ''
  return `${lessThan ? '<' : ''}${formatAmount(value)} ${unit}`.trim()
}

/** Tidy an ingredient/blend name for the panel: drop DSLD template braces
 *  ("{Magnesium}" → "Magnesium") and collapse whitespace. */
function cleanLabel(s: string): string {
  return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}
