// @ilaunchify/nutrition — per-flavor recipe → RecipeRow[] mapper.
//
// docs/PER_FLAVOR_RECIPES.md §3/§7 slice 1. A FlavorPreset owns a FULL
// independent recipe (its own FlavorRecipeSlot[] + replacements + optionals).
// This PURE function turns that recipe into the same `RecipeRow[]` shape the
// template recipe step feeds `calculateLabel` (see RecipeBuilderStep.tsx
// `recipeRows`/`previewEngineRows` and `publicSelection`/`previewSelection`):
//   - one `category: 'base'` parent row per slot (`parentId` undefined),
//   - one `category: 'base'` child row per replacement (`parentId` = slot id,
//     `selected` = chosen swap), so `previewSelection` swaps it in,
//   - one `category: 'optional'` row per optional (`selected` = ticked in).
//
// Nutrition data is INJECTED (`resolveIngredientData`) so this stays pure — no
// prisma, no network. The weight type mirrors the Decimal columns; callers pass
// plain numbers (grams), matching `weightG` once read off the Prisma row
// (`Number(row.weightG)`). Quantities are grams; unit is always 'g'.

import type { Nutrients } from './nutrients'
import type { RecipeRow } from './index'

/** Resolved nutrition + display data for one ingredient, injected by the caller
 *  (loader reads it from the Ingredient row; tests pass a literal map). */
export interface ResolvedIngredientData {
  /** Display name (labelDeclarationName ?? internalName ?? name). */
  name: string
  /** Per-100g nutrient profile (Ingredient.nutritionPer100g). */
  per100g: Partial<Nutrients>
  /** For volume↔mass conversion if a non-gram weight is ever introduced. */
  densityGPerMl?: number | null
  /** Big-9 + extended allergen flags, surfaced for the Contains line. */
  allergens?: string[]
}

/** A per-flavor base slot (mirrors a Prisma FlavorRecipeSlot row, weights as
 *  plain grams — `Number(row.weightG)`). `replacements` are this slot's swap
 *  options; `chosenReplacementId` (if set) is the active swap. */
export interface FlavorRecipeSlotInput {
  id: string
  baseIngredientId: string
  /** Grams in this flavor's recipe (from Decimal `weightG`). */
  weightG: number
  displayOrder?: number
  allowReplacement?: boolean
  /** Optional UI label override (FlavorRecipeSlot.label). */
  label?: string | null
  replacements?: FlavorRecipeReplacementInput[]
  /** The active replacement for this slot, if the manufacturer swapped one in. */
  chosenReplacementId?: string | null
}

/** A per-flavor slot replacement (mirrors FlavorRecipeReplacement). */
export interface FlavorRecipeReplacementInput {
  id: string
  ingredientId: string
  /** Optional weight override (Decimal `weightGOverride`); falls back to the
   *  slot's weight when null. */
  weightGOverride?: number | null
  displayOrder?: number
}

/** A per-flavor optional ingredient (mirrors FlavorRecipeOptional). */
export interface FlavorRecipeOptionalInput {
  id: string
  ingredientId: string
  /** Grams added when toggled on (Decimal `weightG`). */
  weightG: number
  displayOrder?: number
  /** Whether this optional is ticked into the current preview. */
  selected?: boolean
}

export interface FlavorRecipeRowsOptions {
  /** Inject nutrition/display data per ingredient id. Returns undefined for an
   *  unknown id → an empty-nutrient row (matches the builder's `?? {}` fallback). */
  resolveIngredientData: (ingredientId: string) => ResolvedIngredientData | undefined
}

const EMPTY: ResolvedIngredientData = { name: '', per100g: {} }

/**
 * Map ONE flavor's independent recipe (slots + replacements + optionals) to the
 * `RecipeRow[]` the nutrition engine consumes. Pure: all nutrition data comes
 * from `resolveIngredientData`. Feed the result to `publicSelection` (consumer
 * label) or `previewSelection` (internal, swaps + ticked optionals), then to
 * `calculateLabel` — exactly like the template recipe path.
 *
 * Row shape matches RecipeBuilderStep.tsx's `recipeRows`/`previewEngineRows`:
 *   { id, name, per100g, quantity (grams), unit: 'g', category, selected, parentId? }.
 */
export function flavorRecipeRows(
  slots: FlavorRecipeSlotInput[],
  optionals: FlavorRecipeOptionalInput[],
  { resolveIngredientData }: FlavorRecipeRowsOptions,
): RecipeRow[] {
  const rows: RecipeRow[] = []

  const orderedSlots = [...slots].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  )

  for (const slot of orderedSlots) {
    const baseData = resolveIngredientData(slot.baseIngredientId) ?? EMPTY
    // Base parent row (parentId undefined). publicSelection keeps these.
    rows.push({
      id: slot.id,
      name: slot.label || baseData.name || '',
      per100g: baseData.per100g ?? {},
      quantity: slot.weightG,
      unit: 'g',
      category: 'base',
      // The parent base is "selected" only when no replacement is swapped in,
      // mirroring how previewSelection prefers an active child over its parent.
      selected: slot.chosenReplacementId == null,
    })

    // Replaceable children — point to the parent via parentId. previewSelection
    // swaps in the one with `selected: true`; publicSelection ignores them.
    const orderedReplacements = [...(slot.replacements ?? [])].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
    )
    for (const rep of orderedReplacements) {
      const repData = resolveIngredientData(rep.ingredientId) ?? EMPTY
      rows.push({
        id: rep.id,
        parentId: slot.id,
        name: repData.name || '',
        per100g: repData.per100g ?? {},
        quantity: rep.weightGOverride ?? slot.weightG,
        unit: 'g',
        category: 'base',
        selected: slot.chosenReplacementId === rep.id,
      })
    }
  }

  const orderedOptionals = [...optionals].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  )
  for (const opt of orderedOptionals) {
    const optData = resolveIngredientData(opt.ingredientId) ?? EMPTY
    rows.push({
      id: opt.id,
      name: optData.name || '',
      per100g: optData.per100g ?? {},
      quantity: opt.weightG,
      unit: 'g',
      category: 'optional',
      selected: opt.selected ?? false,
    })
  }

  return rows
}
