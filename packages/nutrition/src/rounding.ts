// FDA rounding rules (21 CFR 101.9(c)) per nutrient class, plus servings-per-
// container rounding and the "about" display rule.

const roundTo = (v: number, step: number) => Math.round(v / step) * step

export function roundCalories(v: number): number {
  if (v < 5) return 0
  return v <= 50 ? roundTo(v, 5) : roundTo(v, 10)
}

/** Fat (total/sat/trans/poly/mono): <0.5→0, ≤5→nearest 0.5, >5→nearest 1. */
export function roundFat(v: number): number {
  if (v < 0.5) return 0
  return v <= 5 ? roundTo(v, 0.5) : Math.round(v)
}

/** General g-macros (carb/fiber/sugars/protein/sugar alcohol). */
export function roundGramMacro(v: number): number {
  if (v < 0.5) return 0
  return v < 5 ? roundTo(v, 0.5) : Math.round(v)
}

/** Cholesterol & sodium (mg): <5→0, ≤140→nearest 5, >140→nearest 10. */
export function roundCholSodium(v: number): number {
  if (v < 5) return 0
  return v <= 140 ? roundTo(v, 5) : roundTo(v, 10)
}

/** Vitamins/minerals: <0.5→0, ≤2→nearest 0.1, >2→nearest 1. */
export function roundMicro(v: number): number {
  if (v < 0.5) return 0
  return v <= 2 ? roundTo(v, 0.1) : Math.round(v)
}

export function roundDV(v: number): number {
  return Math.round(v)
}

/** Servings per container (21 CFR 101.9(b)(8) spirit). */
export function roundServingsPerContainer(x: number): number {
  if (x < 2) return Math.round(x * 4) / 4 // <2 → nearest 0.25
  if (x <= 5) return Math.round(x * 2) / 2 // 2–5 → nearest 0.5
  return Math.round(x) // >5 → nearest whole
}

/** Display string for the panel. Per 21 CFR 101.9(b)(8), the rounded value is
 *  shown as-is (e.g. "2.5") and prefixed with "about" whenever rounding occurred
 *  — covering both fractional counts ("about 3.5 servings") and rounded wholes
 *  ("about 2 servings"). No "about" when the count is already exact. */
export function formatServingsPerContainer(servings: number): string {
  const r = roundServingsPerContainer(servings)
  const rounded = Math.abs(r - servings) > 1e-9
  return rounded ? `about ${r}` : `${r}`
}

/** Dual front-of-pack net weight string, e.g. "7.1 oz (200 g)". NOT a panel element. */
export function formatNetWeight(grams: number): string {
  return `${(grams / 28.3495).toFixed(1)} oz (${Math.round(grams)} g)`
}
