'use server'

// Room recipe editor → catalog match search. Thin adapter over the partner
// product editor's searchIngredients action (which owns auth, visibility
// scoping — USDA + LIBRARY + this partner's PRIVATE rows — and rate limits),
// mapped to the shell's IngredientPick shape.

import {
  searchIngredients,
  createPartnerPrivateIngredient,
} from '../../products/[id]/edit/ingredient-actions'
import type { IngredientPick, IngredientCreateInput } from '@ilaunchify/ui'

export async function roomSearchIngredients(query: string): Promise<IngredientPick[]> {
  const res = await searchIngredients({ query, limit: 12 })
  if (!res.ok) return []
  return res.data.results.map((r) => ({
    id: r.id,
    name: r.internalName,
    declarationName: r.labelDeclarationName,
    source: r.source,
    allergenFlags: r.allergenFlags,
  }))
}

/**
 * Create a partner-private catalog ingredient from the room's match picker.
 * Reuses the product editor's action — banned-list gate, SELF_ATTESTED
 * verification status and audit write all inherited.
 */
export async function roomCreateIngredient(
  input: IngredientCreateInput,
): Promise<{ ok: true; ingredient: IngredientPick } | { ok: false; error: string }> {
  const res = await createPartnerPrivateIngredient({
    internalName: input.internalName,
    labelDeclarationName: input.labelDeclarationName,
    allergenFlags: input.allergenFlags,
    bioengineeredStatus: 'NOT_APPLICABLE',
    densityGPerML: input.densityGPerML,
    complianceNotes: null,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const r = res.data.ingredient
  return {
    ok: true,
    ingredient: {
      id: r.id,
      name: r.internalName,
      declarationName: r.labelDeclarationName,
      source: r.source,
      allergenFlags: r.allergenFlags,
    },
  }
}
