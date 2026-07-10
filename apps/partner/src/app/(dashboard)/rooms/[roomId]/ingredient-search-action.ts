'use server'

// Room recipe editor → catalog match search. Thin adapter over the partner
// product editor's searchIngredients action (which owns auth, visibility
// scoping — USDA + LIBRARY + this partner's PRIVATE rows — and rate limits),
// mapped to the shell's IngredientPick shape.

import { searchIngredients } from '../../products/[id]/edit/ingredient-actions'
import type { IngredientPick } from '@ilaunchify/ui'

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
