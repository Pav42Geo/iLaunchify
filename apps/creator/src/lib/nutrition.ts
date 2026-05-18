// Pure functions for nutrient summation. Lives in the app for the
// live-preview render path. The Python compliance service has the
// authoritative rounding + rule evaluation; this file just sums for preview.

export interface NutrientProfilePer100g {
  calories?: number
  totalFat?: number
  saturatedFat?: number
  transFat?: number
  cholesterol?: number
  sodium?: number
  totalCarbohydrate?: number
  dietaryFiber?: number
  totalSugars?: number
  addedSugars?: number
  protein?: number
  vitaminD?: number
  calcium?: number
  iron?: number
  potassium?: number
}

export interface RecipeIngredientInput {
  weightG: number
  nutritionPer100g: NutrientProfilePer100g
}

export function sumNutrients(
  ingredients: RecipeIngredientInput[],
  servingSizeG: number,
): NutrientProfilePer100g {
  const totalWeightG = ingredients.reduce((sum, ing) => sum + ing.weightG, 0)
  if (totalWeightG <= 0 || servingSizeG <= 0) return {}

  const result: NutrientProfilePer100g = {}
  for (const ing of ingredients) {
    const fraction = ing.weightG / 100   // ingredient weight ÷ 100g (since nutrition is per-100g)
    for (const key of Object.keys(ing.nutritionPer100g) as Array<keyof NutrientProfilePer100g>) {
      const val = ing.nutritionPer100g[key] ?? 0
      result[key] = (result[key] ?? 0) + val * fraction
    }
  }

  // result currently holds totals for the FULL recipe (all ingredients combined)
  // Scale to per-serving: serving_size_g / total_weight_g
  const servingFraction = servingSizeG / totalWeightG
  for (const key of Object.keys(result) as Array<keyof NutrientProfilePer100g>) {
    result[key] = Math.round((result[key]! * servingFraction) * 100) / 100
  }

  return result
}

// V1 DV table — must match us-fda-food-2026.01.json
const DAILY_VALUES: Record<keyof NutrientProfilePer100g, { value: number; unit: string } | null> = {
  calories: null,
  totalFat:          { value: 78,    unit: 'g' },
  saturatedFat:      { value: 20,    unit: 'g' },
  transFat:          null,
  cholesterol:       { value: 300,   unit: 'mg' },
  sodium:            { value: 2300,  unit: 'mg' },
  totalCarbohydrate: { value: 275,   unit: 'g' },
  dietaryFiber:      { value: 28,    unit: 'g' },
  totalSugars:       null,
  addedSugars:       { value: 50,    unit: 'g' },
  protein:           { value: 50,    unit: 'g' },
  vitaminD:          { value: 20,    unit: 'mcg' },
  calcium:           { value: 1300,  unit: 'mg' },
  iron:              { value: 18,    unit: 'mg' },
  potassium:         { value: 4700,  unit: 'mg' },
}

export function percentDailyValue(nutrient: keyof NutrientProfilePer100g, amount: number): number | null {
  const dv = DAILY_VALUES[nutrient]
  if (!dv || amount <= 0) return null
  return Math.round((amount / dv.value) * 100)
}
