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
export * from './supplement-facts'
export * from './domain-labels'
export * from './marketplace-recompose'

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

// ---------------------------------------------------------------------------
// Configured-SKU selection (Product Configurator — docs/PRODUCT_CONFIGURATOR_
// CONSTRAINTS.md §12b). A label-affecting option value applies one ingredient
// operation to the base recipe; the engine recomputes Facts + allergens from the
// resolved list. Additive on top of publicSelection — does NOT touch
// calculateLabel. Allergens propagate for free (calculateLabel derives them from
// the ingredient list).
// ---------------------------------------------------------------------------

export type OverlayOpKind = 'SWAP' | 'ADD' | 'REMOVE'

/** One resolved overlay operation against the base recipe.
 *  SWAP   → replace base slot `slotId` with `ingredient`.
 *  ADD    → append `ingredient`.
 *  REMOVE → drop base slot `slotId`. */
export interface OptionOverlay {
  op: OverlayOpKind
  /** SWAP/REMOVE target = the base row id (the bound slot). */
  slotId?: string
  /** SWAP replacement / ADD new ingredient (already resolved to nutrients). */
  ingredient?: IngredientInput
}

/**
 * Resolve the ingredient list for ONE configured SKU. Starts from the public
 * (base) recipe, then applies the flavor overlay, then the selected option
 * overlays. Precedence on a shared slotId = application order, so options (passed
 * last) win over flavor over base. Feed the result straight to calculateLabel.
 */
export function resolveConfiguredSelection(
  rows: RecipeRow[],
  flavorOverlay: OptionOverlay[] = [],
  optionOverlays: OptionOverlay[] = [],
): IngredientInput[] {
  let list: IngredientInput[] = publicSelection(rows).map((i) => ({ ...i }))
  for (const ov of [...flavorOverlay, ...optionOverlays]) {
    if (ov.op === 'REMOVE' && ov.slotId) {
      list = list.filter((i) => i.id !== ov.slotId)
    } else if (ov.op === 'SWAP' && ov.slotId && ov.ingredient) {
      // Keep the SLOT id so later overlays (and stacking flavor→option) stay
      // addressable; only the slot's CONTENTS (name/nutrients/qty) change.
      const filled = { ...ov.ingredient, id: ov.slotId }
      const idx = list.findIndex((i) => i.id === ov.slotId)
      if (idx >= 0) list[idx] = filled
      else list.push(filled)
    } else if (ov.op === 'ADD' && ov.ingredient) {
      list.push({ ...ov.ingredient })
    }
  }
  return list
}

/**
 * Stable, order-independent fingerprint of a recipe's ingredient list. Hash it
 * with `stableHash()` (from @ilaunchify/ui) to stamp recipe-derived label
 * objects, so the die-line submit gate can detect staleness with a cheap string
 * compare when the recipe changes. docs/HANDOFF-TO-CODE-dieline-phase-b.md.
 */
export function recipeFingerprint(ingredients: IngredientInput[]): string {
  return ingredients
    .map((i) => {
      const panel = (i.per100g ?? {}) as Record<string, unknown>
      const nutr = Object.keys(panel)
        .sort()
        .map((k) => `${k}=${panel[k]}`)
        .join(',')
      return `${i.id}|${i.name}|${i.quantity}|${i.unit}|${nutr}`
    })
    .sort()
    .join(';')
}
