// Accurate Nutrition Facts engine — single source of truth for the recipe builder.
//
// Model (consistent by construction):
//   batch nutrients = Σ ingredient (per100g × usable grams / 100)   [conserved]
//   yield = raw mass × (1 − moistureLoss)        [moisture removes water only]
//   total servings = yield/servingSize (by-serving) OR spp×packages (by-package)
//   per serving = batch nutrient ÷ total servings
//
// The ReciPal two-mode setup ("by serving size" vs "by package size") both
// resolve to the same total-servings basis, so per-serving values and
// servings-per-container can never disagree.

import { Nutrients, DAILY_VALUES, NUTRIENT_KEYS, zeroNutrients, fillNutrients, dailyValuesFor, type NutritionAudience } from './nutrients'
import { toGrams } from './units'
import {
  roundCalories, roundFat, roundGramMacro, roundCholSodium, roundMicro, roundDV,
  roundServingsPerContainer, formatServingsPerContainer,
} from './rounding'

export interface IngredientInput {
  id: string
  name: string
  per100g: Partial<Nutrients>
  quantity: number
  unit: string
  /** Trim loss (peeling/deboning) — removes mass AND nutrients. 0–100. */
  trimWastePct?: number
  densityGPerMl?: number
  gramsPerPiece?: number
}

export type LabelBasis = 'serving' | 'package'

export interface GeometryInput {
  basis: LabelBasis
  /** Moisture/cook yield loss for the batch — water only, nutrients conserved. 0–100. */
  moistureLossPct?: number
  /** Servings in EACH package. Non-round → "about N" on the panel. */
  servingsPerPackage: number
  // basis === 'serving'
  servingSizeG?: number
  // basis === 'package'
  packageSizeG?: number
  numPackages?: number
}

export interface Geometry {
  servingSizeG: number
  servingsPerContainer: number
  /** Panel display, with the "about N" rule applied. */
  servingsPerContainerLabel: string
  netWeightG: number
  packagesMade: number
  totalServings: number
  yieldG: number
  rawMassG: number
}

/** Calories: prefer measured kcal; else Atwater general factors. */
function kcalPer100g(n: Nutrients): number {
  if (n.calories > 0) return n.calories
  const digestibleCarb = Math.max(0, n.totalCarbohydrate - n.dietaryFiber)
  return 4 * n.protein + 4 * digestibleCarb + 2 * n.dietaryFiber + 9 * n.totalFat + 7 * n.alcohol
}

/** Sum ingredient contributions into a batch total + raw mass (after trim waste). */
export function sumBatch(ingredients: IngredientInput[]): { batch: Nutrients; rawMassG: number } {
  const batch = zeroNutrients()
  let rawMassG = 0
  for (const ing of ingredients) {
    const grams = toGrams(ing.quantity, ing.unit, ing)
    const usable = grams * (1 - (ing.trimWastePct ?? 0) / 100)
    if (usable <= 0) continue
    rawMassG += usable
    const n = fillNutrients(ing.per100g)
    const factor = usable / 100
    batch.calories += kcalPer100g(n) * factor
    for (const k of NUTRIENT_KEYS) {
      if (k === 'calories') continue
      batch[k] += (n[k] ?? 0) * factor
    }
  }
  return { batch, rawMassG }
}

/** Resolve the ReciPal package/serving geometry from the raw recipe mass. */
export function resolveGeometry(rawMassG: number, input: GeometryInput): Geometry {
  const yieldG = rawMassG * (1 - (input.moistureLossPct ?? 0) / 100)
  const spp = input.servingsPerPackage > 0 ? input.servingsPerPackage : 1
  let servingSizeG: number, totalServings: number, netWeightG: number, packagesMade: number
  if (input.basis === 'serving') {
    servingSizeG = input.servingSizeG ?? 100
    totalServings = servingSizeG > 0 ? yieldG / servingSizeG : 0
    netWeightG = servingSizeG * spp
    packagesMade = netWeightG > 0 ? yieldG / netWeightG : 0
  } else {
    const packageSizeG = input.packageSizeG ?? 0
    const numPackages = input.numPackages && input.numPackages > 0 ? input.numPackages : 1
    servingSizeG = spp > 0 ? packageSizeG / spp : packageSizeG
    totalServings = spp * numPackages
    netWeightG = packageSizeG
    packagesMade = numPackages
  }
  return {
    servingSizeG,
    servingsPerContainer: roundServingsPerContainer(spp),
    servingsPerContainerLabel: formatServingsPerContainer(spp),
    netWeightG,
    packagesMade,
    totalServings,
    yieldG,
    rawMassG,
  }
}

type DvTable = Partial<Record<keyof Nutrients, number>>
interface DvCell { amount: number; dv: number }
const cell = (amount: number, key: keyof Nutrients, dvTable: DvTable = DAILY_VALUES): DvCell => {
  const dvRef = dvTable[key]
  return { amount, dv: dvRef ? roundDV((amount / dvRef) * 100) : 0 }
}

export interface LabelOptions {
  /** Nutrition Facts audience (21 CFR 101.9(j)(5)) — selects the DV table for %DV.
   *  GENERAL (default) keeps the standard ≥4-yr panel. */
  audience?: NutritionAudience
}

export interface LabelResult {
  /** Echoes the audience used so the panel adapter can apply the matching
   *  format (which %DV columns / rows the variant declares). */
  audience: NutritionAudience
  geometry: Geometry
  /** Per-serving, FDA-rounded, label-ready. */
  perServing: {
    calories: number
    totalFat: DvCell
    saturatedFat: DvCell
    transFat: { amount: number }
    polyunsaturatedFat: { amount: number }
    monounsaturatedFat: { amount: number }
    cholesterol: DvCell
    sodium: DvCell
    totalCarbohydrate: DvCell
    dietaryFiber: DvCell
    totalSugars: { amount: number }
    addedSugars: DvCell
    sugarAlcohol: { amount: number }
    protein: DvCell
    vitaminD: DvCell
    calcium: DvCell
    iron: DvCell
    potassium: DvCell
  }
  /** Unrounded per-serving + batch (Nutrition Breakdown / QA — never the label). */
  raw: { batch: Nutrients; perServingExact: Nutrients }
}

export function calculateLabel(ingredients: IngredientInput[], geometryInput: GeometryInput, opts: LabelOptions = {}): LabelResult {
  const audience: NutritionAudience = opts.audience ?? 'GENERAL'
  const dv = dailyValuesFor(audience)
  const { batch, rawMassG } = sumBatch(ingredients)
  const geometry = resolveGeometry(rawMassG, geometryInput)
  const ts = geometry.totalServings
  const ps = (k: keyof Nutrients): number => (ts > 0 ? batch[k] / ts : 0)

  const perServingExact = zeroNutrients()
  for (const k of NUTRIENT_KEYS) perServingExact[k] = ps(k)

  return {
    audience,
    geometry,
    perServing: {
      calories: roundCalories(ps('calories')),
      totalFat: cellRound(ps('totalFat'), 'totalFat', roundFat, dv),
      saturatedFat: cellRound(ps('saturatedFat'), 'saturatedFat', roundFat, dv),
      transFat: { amount: roundFat(ps('transFat')) },
      polyunsaturatedFat: { amount: roundFat(ps('polyunsaturatedFat')) },
      monounsaturatedFat: { amount: roundFat(ps('monounsaturatedFat')) },
      cholesterol: cellRound(ps('cholesterol'), 'cholesterol', roundCholSodium, dv),
      sodium: cellRound(ps('sodium'), 'sodium', roundCholSodium, dv),
      totalCarbohydrate: cellRound(ps('totalCarbohydrate'), 'totalCarbohydrate', roundGramMacro, dv),
      dietaryFiber: cellRound(ps('dietaryFiber'), 'dietaryFiber', roundGramMacro, dv),
      totalSugars: { amount: roundGramMacro(ps('totalSugars')) },
      addedSugars: cellRound(ps('addedSugars'), 'addedSugars', roundGramMacro, dv),
      sugarAlcohol: { amount: roundGramMacro(ps('sugarAlcohol')) },
      protein: cellRound(ps('protein'), 'protein', roundGramMacro, dv),
      vitaminD: cellRound(ps('vitaminD'), 'vitaminD', roundMicro, dv),
      calcium: cellRound(ps('calcium'), 'calcium', roundMicro, dv),
      iron: cellRound(ps('iron'), 'iron', roundMicro, dv),
      potassium: cellRound(ps('potassium'), 'potassium', roundMicro, dv),
    },
    raw: { batch, perServingExact },
  }
}

function cellRound(exact: number, key: keyof Nutrients, round: (v: number) => number, dvTable: DvTable = DAILY_VALUES): DvCell {
  const amount = round(exact)
  // %DV is computed from the EXACT value (FDA), not the rounded display amount.
  const c = cell(exact, key, dvTable)
  return { amount, dv: c.dv }
}
