// Marketplace recipe recomposition — resolve a base recipe + a creator's
// current customization (slot swaps + optional add-ons) into the flat
// ingredient list calculateLabel consumes.
//
// This is the SINGLE pure function behind the marketplace Customize rail's live
// Nutrition Facts recompute. It mirrors previewSelection's rule — active base
// (a swap replaces its slot's base) + ticked optional add-ons — and adds the two
// things the slot/replacement schema needs that previewSelection's flat model
// doesn't carry:
//   1. weightGOverride — a replacement can declare a different weight than the
//      slot's base (e.g. 0.2 g stevia replaces 12 g sugar). MUST be honored or
//      both the swapped ingredient's mass and the batch total are wrong.
//   2. optional add-ons with their own weightG — when ticked they contribute
//      their full nutrition (whey adds protein, MCT adds fat, …).
//
// Pure + deterministic (no I/O), so it is unit-tested with exact expected
// label values — see marketplace-recompose.test.ts.

import type { IngredientInput } from './engine'
import type { Nutrients } from './nutrients'

export interface RecomposeIngredient {
  name?: string
  per100g: Partial<Nutrients>
  densityGPerMl?: number
}

export interface RecomposeReplacement {
  id: string
  /** Grams when this alternate is chosen; falls back to the slot weight. */
  weightGOverride?: number | null
  ingredient: RecomposeIngredient
}

export interface RecomposeSlot {
  weightG: number
  base: RecomposeIngredient
  replacements?: RecomposeReplacement[]
}

export interface RecomposeOptional {
  id: string
  weightG: number
  ingredient: RecomposeIngredient
}

export interface RecomposeSelection {
  /** Key `slot-${index}` → chosen replacement id ('__default'/absent = base). */
  replacements?: Record<string, string>
  /** Ticked optional add-on ids. */
  addOnIds?: string[]
}

/**
 * Resolve `slots` (base recipe, in display order) + `optionals` (add-on pool)
 * under `selection` into the ingredient list calculateLabel consumes. Slot keys
 * follow the `slot-${index}` convention used across the rail, recipe-detail, and
 * the recompute action so the same selection map drives all three.
 */
export function composeMarketplaceRows(
  slots: RecomposeSlot[],
  optionals: RecomposeOptional[] = [],
  selection: RecomposeSelection = {},
): IngredientInput[] {
  const reps = selection.replacements ?? {}
  const chosen = new Set(selection.addOnIds ?? [])
  const rows: IngredientInput[] = []

  slots.forEach((slot, i) => {
    const pickId = reps[`slot-${i}`]
    const pick =
      pickId && pickId !== '__default'
        ? slot.replacements?.find((r) => r.id === pickId)
        : undefined
    const ing = pick ? pick.ingredient : slot.base
    // A swap may declare its own weight; otherwise it inherits the slot weight.
    const grams =
      pick && pick.weightGOverride != null ? Number(pick.weightGOverride) : Number(slot.weightG)
    rows.push({
      id: `b${i}`,
      name: ing.name ?? `slot-${i}`,
      per100g: ing.per100g,
      quantity: Number.isFinite(grams) ? grams : 0,
      unit: 'g',
      densityGPerMl: ing.densityGPerMl,
    })
  })

  for (const o of optionals) {
    if (!chosen.has(o.id)) continue
    rows.push({
      id: `o-${o.id}`,
      name: o.ingredient.name ?? o.id,
      per100g: o.ingredient.per100g,
      quantity: Number(o.weightG) || 0,
      unit: 'g',
      densityGPerMl: o.ingredient.densityGPerMl,
    })
  }

  return rows
}
