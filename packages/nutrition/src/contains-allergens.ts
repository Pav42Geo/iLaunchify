// Live "Contains" allergen resolution for the marketplace Customize rail.
//
// A swap replaces its slot's base ingredient — so the swapped-in alternate's
// allergens REPLACE the base's (e.g. Coconut → Citrus removes the tree-nut
// flag). A ticked optional add-on ADDS its allergens (e.g. Whey adds Milk).
// This is the single, tested source of truth for the rail's "Contains" line.
//
// Operates on already-display-mapped allergen labels (FALCPA Big-9), so it is a
// pure string-set operation — no FDA tables needed here.

export interface ContainsIngredient {
  /** Stable row id; selection keys reference this. */
  id: string
  allergens?: string[]
  replacements?: { id: string; allergens?: string[] }[]
}

export interface ContainsAddOn {
  id: string
  allergens?: string[]
}

export interface ContainsSelection {
  /** ingredient id → chosen replacement id ('__default'/absent = base). */
  replacements?: Record<string, string>
  /** ticked optional add-on ids. */
  addOnIds?: string[]
}

/**
 * Resolve the "Contains" allergen set for the current composition: each row
 * contributes its base allergens, or — when swapped — the chosen replacement's
 * allergens instead; each ticked add-on contributes its own. Returns a sorted,
 * de-duplicated list.
 */
export function composeContainsAllergens(
  ingredients: ContainsIngredient[],
  addOns: ContainsAddOn[] = [],
  selection: ContainsSelection = {},
): string[] {
  const reps = selection.replacements ?? {}
  const chosen = selection.addOnIds ?? []
  const set = new Set<string>()

  for (const ing of ingredients) {
    const pickId = reps[ing.id]
    const picked =
      pickId && pickId !== '__default' ? ing.replacements?.find((r) => r.id === pickId) : undefined
    const src = picked ? picked.allergens : ing.allergens
    for (const a of src ?? []) set.add(a)
  }

  for (const id of chosen) {
    const ao = addOns.find((a) => a.id === id)
    for (const a of ao?.allergens ?? []) set.add(a)
  }

  return [...set].sort((a, b) => a.localeCompare(b))
}
