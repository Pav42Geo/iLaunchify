// Mandatory food-label statements — pure builders (co-creation room + any
// label surface). Built to spec, spec-anchored tests (regulated-labels rule):
//   • Ingredient statement: 21 CFR 101.4(a) — descending order of predominance
//     by weight, common/usual (declaration) names, comma-separated.
//   • "Contains" statement: FALCPA §403(w) — Big-9 source names in canonical
//     order, rendered ONLY when the composition is fully resolved (a partial
//     allergen statement is a safety hazard, not a convenience).
//
// The creator app's label-actions.ts has an inline copy of this mapping; this
// module is the shareable home so the co-creation room (both apps) and future
// surfaces stop duplicating it.

/** Canonical Ingredient.allergenFlags → FALCPA display names. */
export const FALCPA_ALLERGEN_LABELS: Record<string, string> = {
  milk: 'Milk',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  tree_nuts: 'Tree Nuts',
  peanuts: 'Peanuts',
  wheat: 'Wheat',
  soybeans: 'Soy',
  soy: 'Soy',
  sesame: 'Sesame',
}

/** FALCPA display order (matches the creator label builder). */
export const FALCPA_ALLERGEN_ORDER = [
  'Milk',
  'Eggs',
  'Fish',
  'Shellfish',
  'Tree Nuts',
  'Peanuts',
  'Wheat',
  'Soy',
  'Sesame',
] as const

/**
 * "Contains: …" from raw allergenFlags arrays (one per ingredient).
 * Returns null when no flagged allergens are present.
 */
export function formatFalcpaContains(flagSets: (string[] | null | undefined)[]): string | null {
  const names = new Set<string>()
  for (const flags of flagSets) {
    for (const f of flags ?? []) {
      const label = FALCPA_ALLERGEN_LABELS[String(f).toLowerCase().trim()]
      if (label) names.add(label)
    }
  }
  if (names.size === 0) return null
  return FALCPA_ALLERGEN_ORDER.filter((n) => names.has(n)).join(', ')
}

/**
 * 21 CFR 101.4(a) ingredient statement: descending weight, declaration names.
 * Ties keep input order (stable). Empty input → null.
 */
export function buildIngredientStatement(
  items: { declarationName: string; grams: number }[],
): string | null {
  if (items.length === 0) return null
  const ordered = [...items].sort((a, b) => b.grams - a.grams)
  return ordered
    .map((i) => i.declarationName.trim())
    .filter(Boolean)
    .join(', ')
}
