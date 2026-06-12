// Cosmetic ingredient declaration (21 CFR 701.3) — Phase 2.
//
// Cosmetics have NO Nutrition/Supplement Facts box. The "label" is an INCI
// ingredient list in this required order:
//   1. Ingredients present at > 1% — in descending order of predominance.
//   2. Ingredients present at ≤ 1% — in any order.
//   3. Color additives — last, in any order.
// Fragrance / flavor may be declared simply as "Fragrance" / "Flavor".
// Pure + framework-free so it's unit-testable. docs/PRODUCT_DOMAINS_ARCHITECTURE.md.

export interface CosmeticIngredient {
  id: string
  /** INCI name, e.g. "Aqua (Water)", "Glycerin", "Sodium Hyaluronate". */
  inciName: string
  /** Concentration % w/w. Drives the >1% vs ≤1% ordering bands. */
  pct: number
  isColorAdditive?: boolean
  isFragrance?: boolean
  isFlavor?: boolean
}

export interface InciDeclaration {
  ordered: { id: string; name: string }[]
  /** Full label line, e.g. "Ingredients: Aqua, Glycerin, …, CI 77891 (+/-)." */
  text: string
}

function displayName(i: CosmeticIngredient): string {
  if (i.isFragrance) return 'Fragrance'
  if (i.isFlavor) return 'Flavor'
  return i.inciName.trim()
}

/** Build the ordered INCI declaration per 21 CFR 701.3. Stable within each band. */
export function toInciDeclaration(items: CosmeticIngredient[]): InciDeclaration {
  const named = items.filter((i) => i.inciName.trim() || i.isFragrance || i.isFlavor)
  const colors = named.filter((i) => i.isColorAdditive)
  const nonColor = named.filter((i) => !i.isColorAdditive)

  // >1% band, descending predominance (stable for ties).
  const above = nonColor
    .filter((i) => i.pct > 1)
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => b.i.pct - a.i.pct || a.idx - b.idx)
    .map((x) => x.i)
  // ≤1% band — any order (keep input order).
  const below = nonColor.filter((i) => i.pct <= 1)

  const ordered = [...above, ...below, ...colors].map((i) => ({ id: i.id, name: displayName(i) }))
  const names = ordered.map((o) => o.name).filter(Boolean)
  return { ordered, text: names.length ? `Ingredients: ${names.join(', ')}.` : '' }
}
