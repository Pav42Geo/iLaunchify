// @ilaunchify/nutrition — accurate, FDA-aligned recipe/label calculation engine.
//
// Replaces the legacy EnhancedRecipeBuilder math. Single source of truth used by
// the partner recipe builder (live label), the creator's order-time recalculation,
// and the compliance scan. See docs/prototypes/recipe-builder-demo.html for the
// interactive reference and docs/prototypes/nutrition-engine.ts for the rationale.

export * from './nutrients'
export * from './units'
export * from './rounding'
export * from './engine'
export * from './panel-adapter'

// ---------------------------------------------------------------------------
// Public-vs-preview selection helpers.
//
// PUBLIC marketplace label = base ingredients only (the default recipe).
// PREVIEW (internal) = base + active replaceable swaps + ticked optional adds —
//   shown to the manufacturer only; a creator's order recalculates its own label.
// ---------------------------------------------------------------------------

import type { IngredientInput } from './engine'

export interface RecipeRow extends IngredientInput {
  category: 'base' | 'optional'
  /** Replaceable alternates point to their base via parentId. */
  parentId?: string | null
  /** Replaceable: active swap. Optional: ticked into the preview. */
  selected?: boolean
}

/** The default recipe shown to consumers: base parents only. */
export function publicSelection(rows: RecipeRow[]): IngredientInput[] {
  return rows.filter((r) => r.category === 'base' && !r.parentId)
}

/** The manufacturer's current internal preview: active base (incl. swapped
 *  replaceable) + ticked optionals. */
export function previewSelection(rows: RecipeRow[]): IngredientInput[] {
  const bases = rows.filter((r) => r.category === 'base' && !r.parentId)
  const out: IngredientInput[] = []
  for (const b of bases) {
    const activeChild = rows.find((c) => c.parentId === b.id && c.selected)
    out.push(activeChild ?? b) // swapped replaceable overrides its parent
  }
  for (const o of rows.filter((r) => r.category === 'optional' && r.selected)) out.push(o)
  return out
}
