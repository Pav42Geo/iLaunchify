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

const FOOTER_DV = '† Daily Value (DV) not established.'
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
  let anyDV = false

  // Standalone (non-blend) ingredients first, in given order.
  for (const ing of panelIngredients.filter((i) => !i.blendId)) {
    const hasDV = ing.percentDV != null
    hasDV ? (anyDV = true) : (anyNoDV = true)
    rows.push({
      id: ing.id,
      label: ing.name,
      amount: `${formatAmount(ing.amountPerServing)} ${ing.unit}`.trim(),
      ...(hasDV ? { percentDailyValue: ing.percentDV as number } : {}),
      indent: 0,
    })
  }

  // Each proprietary blend: a parent total row, then members (no amounts), in
  // descending sortWeight (predominance) order.
  for (const blend of blends) {
    const members = panelIngredients
      .filter((i) => i.blendId === blend.id)
      .sort((a, b) => (b.sortWeight ?? 0) - (a.sortWeight ?? 0))
    if (members.length === 0) continue
    const hasDV = blend.percentDV != null
    hasDV ? (anyDV = true) : (anyNoDV = true)
    rows.push({
      id: blend.id,
      label: `${blend.name} ‡`,
      amount: `${formatAmount(blend.totalAmount)} ${blend.unit}`.trim(),
      ...(hasDV ? { percentDailyValue: blend.percentDV as number } : {}),
      indent: 0,
    })
    for (const m of members) {
      rows.push({ id: m.id, label: m.name, amount: '', indent: 1 })
    }
  }

  const footerParts: string[] = []
  if (anyDV) footerParts.push(FOOTER_PCT)
  if (anyNoDV) footerParts.push(FOOTER_DV)
  if (blends.length > 0) footerParts.push('‡ Amount of the proprietary blend; individual amounts are not disclosed.')

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
