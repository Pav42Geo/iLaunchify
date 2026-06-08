// Unit → grams. Density-aware for volume; per-piece for countables.

const MASS_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1, mg: 0.001, kg: 1000, oz: 28.3495, lb: 453.592,
}
const VOL_ML: Record<string, number> = {
  ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, fl_oz: 29.5735,
  floz: 29.5735, cup: 240, tbsp: 14.7868, tablespoon: 14.7868, tsp: 4.92892, teaspoon: 4.92892,
}
const COUNT = new Set(['each', 'piece', 'pieces', 'count', 'slice', 'unit'])

export interface UnitContext {
  /** g/ml — required for accurate volume→mass. Default 1.0 (water-like). */
  densityGPerMl?: number
  /** For countable units ('each'/'piece'): grams per piece. */
  gramsPerPiece?: number
}

export function toGrams(quantity: number, unit: string, ctx: UnitContext = {}): number {
  const u = unit.toLowerCase().trim()
  if (u in MASS_G) return quantity * (MASS_G[u] as number)
  if (u in VOL_ML) return quantity * (VOL_ML[u] as number) * (ctx.densityGPerMl ?? 1.0)
  if (COUNT.has(u)) return quantity * (ctx.gramsPerPiece ?? 50)
  return quantity // assume already grams
}

export const AVAILABLE_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'cup', 'tbsp', 'tsp', 'each'] as const
