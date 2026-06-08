/**
 * iLaunchify — Nutrition Facts calculation engine (accurate, FDA-aligned)
 * ----------------------------------------------------------------------
 * Reference implementation that replaces the legacy EnhancedRecipeBuilder math.
 *
 * WHY THE LEGACY NUMBERS WERE WRONG
 *   1. Per-serving values were scaled by (servingSize / totalRecipeGrams) while
 *      servings-per-container used a *separately typed* package size. When those
 *      two disagree (they almost always do), every per-serving value and %DV is
 *      internally inconsistent.
 *   2. "Waste" was applied twice (per-ingredient + a global %) and BOTH reduced
 *      nutrient totals. Trim loss (peeling) does remove nutrients; but
 *      moisture/cook yield loss removes only water — nutrients are conserved and
 *      simply concentrated. Treating them the same throws off density.
 *   3. Volume→gram used fixed factors (1 cup = 240 g) for every ingredient.
 *      Oil (~0.92 g/ml), flour (~0.53 g/ml) and water (1.0) differ enormously.
 *   4. Calories were summed ad-hoc. We prefer measured kcal, Atwater as fallback.
 *
 * THE MODEL (single source of truth)
 *   nutrients are summed from ingredients → a batch total (conserved).
 *   net product mass = raw formulation mass × (1 − yieldLoss).
 *   density_x = totalNutrient_x / netMass.            ← grams of final product
 *   perServing_x = density_x × servingSizeGrams.       ← always consistent
 *   servingsPerContainer = round(netWeightGrams / servingSizeGrams).
 *
 * Everything downstream (per-serving, %DV, servings/container, net weight) is
 * derived from ONE net mass + ONE nutrient total, so it can never disagree.
 */

// ---------------------------------------------------------------------------
// Nutrient vocabulary (per 100 g of the ingredient as purchased)
// ---------------------------------------------------------------------------
export interface Nutrients {
  calories?: number      // kcal (optional — Atwater fallback if absent)
  protein: number        // g
  totalFat: number       // g
  saturatedFat: number   // g
  transFat: number       // g
  cholesterol: number    // mg
  sodium: number         // mg
  totalCarbohydrate: number // g (INCLUDES fiber + sugars)
  dietaryFiber: number   // g
  totalSugars: number    // g
  addedSugars: number    // g
  vitaminD: number       // mcg
  calcium: number        // mg
  iron: number           // mg
  potassium: number      // mg
  alcohol?: number       // g (for Atwater)
}

const ZERO: Nutrients = {
  calories: 0, protein: 0, totalFat: 0, saturatedFat: 0, transFat: 0,
  cholesterol: 0, sodium: 0, totalCarbohydrate: 0, dietaryFiber: 0,
  totalSugars: 0, addedSugars: 0, vitaminD: 0, calcium: 0, iron: 0,
  potassium: 0, alcohol: 0,
}

export type FoodForm = 'solid' | 'liquid' | 'count'

export interface IngredientInput {
  id: string
  name: string
  per100g: Partial<Nutrients> // measured nutrition per 100 g
  quantity: number
  unit: string                // 'g','kg','oz','lb','ml','l','fl_oz','cup','tbsp','tsp','each'...
  /** Trim loss only (peeling, deboning). Removes mass AND its nutrients. 0–100. */
  trimWastePct?: number
  /** g/ml — required for accurate volume→mass. Default 1.0 (water-like). */
  densityGPerMl?: number
  /** For countable units ('each'/'piece'): grams per piece. */
  gramsPerPiece?: number
  isActive?: boolean          // inactive replaceable/optional excluded
}

export interface RecipeInput {
  ingredients: IngredientInput[]
  /** Moisture / cook yield loss for the whole batch. Removes water only —
   *  nutrients conserved, density rises. 0–100. Default 0. */
  yieldLossPct?: number
  /** Net weight of one container, in grams. If omitted, uses computed net mass
   *  (i.e. the recipe makes exactly one container). */
  netWeightG?: number
  /** Serving size in grams (the RACC-aligned amount). */
  servingSizeG: number
}

// ---------------------------------------------------------------------------
// 2016 FDA Daily Values (21 CFR 101.9, adults & children ≥ 4)
// ---------------------------------------------------------------------------
export const DAILY_VALUES = {
  totalFat: 78, saturatedFat: 20, cholesterol: 300, sodium: 2300,
  totalCarbohydrate: 275, dietaryFiber: 28, addedSugars: 50, protein: 50,
  vitaminD: 20, calcium: 1300, iron: 18, potassium: 4700,
} as const

// ---------------------------------------------------------------------------
// Unit → grams. Density-aware for volume; per-piece for countables.
// ---------------------------------------------------------------------------
const MASS_G: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.3495, lb: 453.592 }
const VOL_ML: Record<string, number> = { ml: 1, milliliter: 1, l: 1000, liter: 1000, fl_oz: 29.5735, cup: 240, tbsp: 14.7868, tablespoon: 14.7868, tsp: 4.92892, teaspoon: 4.92892 }
const COUNT = new Set(['each', 'piece', 'pieces', 'count', 'slice', 'unit'])

export function toGrams(qty: number, unit: string, ing: { densityGPerMl?: number; gramsPerPiece?: number }): number {
  const u = unit.toLowerCase().trim()
  if (u in MASS_G) return qty * MASS_G[u]
  if (u in VOL_ML) return qty * VOL_ML[u] * (ing.densityGPerMl ?? 1.0)
  if (COUNT.has(u)) return qty * (ing.gramsPerPiece ?? 50)
  return qty // assume already grams
}

// ---------------------------------------------------------------------------
// Calories: prefer measured kcal; else Atwater general factors.
//   4·protein + 4·(carb − fiber) + 2·fiber + 9·fat + 7·alcohol
// (fiber yields ~2 kcal/g; this matches FDA-accepted general factors closely.)
// ---------------------------------------------------------------------------
function kcalPer100g(n: Nutrients): number {
  if (n.calories && n.calories > 0) return n.calories
  const digestibleCarb = Math.max(0, n.totalCarbohydrate - n.dietaryFiber)
  return 4 * n.protein + 4 * digestibleCarb + 2 * n.dietaryFiber + 9 * n.totalFat + 7 * (n.alcohol ?? 0)
}

// ---------------------------------------------------------------------------
// FDA rounding (21 CFR 101.9(c)) per nutrient.
// ---------------------------------------------------------------------------
const roundTo = (v: number, step: number) => Math.round(v / step) * step
function roundCalories(v: number) { if (v < 5) return 0; return v <= 50 ? roundTo(v, 5) : roundTo(v, 10) }
function roundGramMacro(v: number) { if (v < 0.5) return 0; return v < 5 ? roundTo(v, 0.5) : Math.round(v) } // FDA: <0.5→0, <5→nearest .5, ≥5→nearest 1
function roundFatGram(v: number) { if (v < 0.5) return 0; return v <= 5 ? roundTo(v, 0.5) : Math.round(v) }
function roundCholSodium(v: number) { if (v < 5) return 0; return v <= 140 ? roundTo(v, 5) : roundTo(v, 10) }
function roundMicro(v: number) { return v < 0.5 ? 0 : (v <= 2 ? roundTo(v, 0.1) : Math.round(v)) }
function roundDV(v: number) { return Math.round(v) }

// Servings per container (21 CFR 101.9(b)(8) spirit):
function roundServings(x: number): number {
  if (x < 2) return Math.round(x * 4) / 4   // <2 → nearest 0.25
  if (x <= 5) return Math.round(x * 2) / 2  // 2–5 → nearest 0.5
  return Math.round(x)                       // >5 → nearest whole
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
export interface LabelResult {
  netWeightG: number
  servingSizeG: number
  servingsPerContainer: number
  /** Per-serving, FDA-rounded, label-ready. */
  perServing: {
    calories: number
    totalFat: { amount: number; dv: number }
    saturatedFat: { amount: number; dv: number }
    transFat: { amount: number }
    cholesterol: { amount: number; dv: number }
    sodium: { amount: number; dv: number }
    totalCarbohydrate: { amount: number; dv: number }
    dietaryFiber: { amount: number; dv: number }
    totalSugars: { amount: number }
    addedSugars: { amount: number; dv: number }
    protein: { amount: number; dv: number }
    vitaminD: { amount: number; dv: number }
    calcium: { amount: number; dv: number }
    iron: { amount: number; dv: number }
    potassium: { amount: number; dv: number }
  }
  /** Unrounded per-serving + batch diagnostics (for cost/QA, never the label). */
  raw: { batchNutrients: Nutrients; rawMassG: number; netMassG: number; densityPerG: Nutrients }
}

function fill(p: Partial<Nutrients>): Nutrients {
  return { ...ZERO, ...p, calories: p.calories } as Nutrients
}

export function calculateLabel(recipe: RecipeInput): LabelResult {
  const active = recipe.ingredients.filter((i) => i.isActive !== false)

  // 1) per-ingredient usable mass (trim loss) + nutrient contribution
  const batch: Nutrients = { ...ZERO }
  let rawMassG = 0
  for (const ing of active) {
    const grams = toGrams(ing.quantity, ing.unit, ing)
    const usable = grams * (1 - (ing.trimWastePct ?? 0) / 100)
    if (usable <= 0) continue
    rawMassG += usable
    const n = fill(ing.per100g)
    const factor = usable / 100
    const cal = kcalPer100g(n) * factor
    batch.calories = (batch.calories ?? 0) + cal
    batch.protein += n.protein * factor
    batch.totalFat += n.totalFat * factor
    batch.saturatedFat += n.saturatedFat * factor
    batch.transFat += n.transFat * factor
    batch.cholesterol += n.cholesterol * factor
    batch.sodium += n.sodium * factor
    batch.totalCarbohydrate += n.totalCarbohydrate * factor
    batch.dietaryFiber += n.dietaryFiber * factor
    batch.totalSugars += n.totalSugars * factor
    batch.addedSugars += n.addedSugars * factor
    batch.vitaminD += n.vitaminD * factor
    batch.calcium += n.calcium * factor
    batch.iron += n.iron * factor
    batch.potassium += n.potassium * factor
  }

  // 2) yield loss removes water only — nutrients conserved, density rises
  const netMassG = rawMassG * (1 - (recipe.yieldLossPct ?? 0) / 100)
  const netWeightG = recipe.netWeightG ?? netMassG
  const servingSizeG = recipe.servingSizeG

  // 3) density per gram of final product
  const density: Nutrients = { ...ZERO }
  if (netMassG > 0) {
    for (const k of Object.keys(ZERO) as (keyof Nutrients)[]) {
      density[k] = (batch[k] ?? 0) / netMassG
    }
  }

  // 4) per serving = density × servingSize  (the consistency fix)
  const s = servingSizeG
  const ps = (k: keyof Nutrients) => (density[k] ?? 0) * s
  const dv = (val: number, ref: number) => (ref > 0 ? roundDV((val / ref) * 100) : 0)

  const cal = ps('calories')
  const fat = ps('totalFat'), sat = ps('saturatedFat'), trans = ps('transFat')
  const chol = ps('cholesterol'), sod = ps('sodium')
  const carb = ps('totalCarbohydrate'), fiber = ps('dietaryFiber'), sugars = ps('totalSugars'), added = ps('addedSugars')
  const prot = ps('protein'), vitD = ps('vitaminD'), cal_ = ps('calcium'), iron = ps('iron'), pot = ps('potassium')

  return {
    netWeightG,
    servingSizeG,
    servingsPerContainer: roundServings(netWeightG / servingSizeG),
    perServing: {
      calories: roundCalories(cal),
      totalFat: { amount: roundFatGram(fat), dv: dv(fat, DAILY_VALUES.totalFat) },
      saturatedFat: { amount: roundFatGram(sat), dv: dv(sat, DAILY_VALUES.saturatedFat) },
      transFat: { amount: roundFatGram(trans) },
      cholesterol: { amount: roundCholSodium(chol), dv: dv(chol, DAILY_VALUES.cholesterol) },
      sodium: { amount: roundCholSodium(sod), dv: dv(sod, DAILY_VALUES.sodium) },
      totalCarbohydrate: { amount: roundGramMacro(carb), dv: dv(carb, DAILY_VALUES.totalCarbohydrate) },
      dietaryFiber: { amount: roundGramMacro(fiber), dv: dv(fiber, DAILY_VALUES.dietaryFiber) },
      totalSugars: { amount: roundGramMacro(sugars) },
      addedSugars: { amount: roundGramMacro(added), dv: dv(added, DAILY_VALUES.addedSugars) },
      protein: { amount: roundGramMacro(prot), dv: dv(prot, DAILY_VALUES.protein) },
      vitaminD: { amount: roundMicro(vitD), dv: dv(vitD, DAILY_VALUES.vitaminD) },
      calcium: { amount: roundMicro(cal_), dv: dv(cal_, DAILY_VALUES.calcium) },
      iron: { amount: roundMicro(iron), dv: dv(iron, DAILY_VALUES.iron) },
      potassium: { amount: roundMicro(pot), dv: dv(pot, DAILY_VALUES.potassium) },
    },
    raw: { batchNutrients: batch, rawMassG, netMassG, densityPerG: density },
  }
}

/** Dual net-weight label string, e.g. "3.5 oz (100 g)". */
export function formatNetWeight(grams: number): string {
  const oz = grams / 28.3495
  return `${oz.toFixed(1)} oz (${Math.round(grams)} g)`
}
