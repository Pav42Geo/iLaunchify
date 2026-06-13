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

export interface SupplementPanelOptions {
  /** Serving form, e.g. "1 capsule", "2 gummies", "1 scoop (5 g)". */
  servingSize: string
  servingsPerContainer: string | number
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

  const rows: NutrientRow[] = []
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
