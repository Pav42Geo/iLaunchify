// Nutrient vocabulary + FDA Daily Values.
// Extended set (mirrors ReciPal's breakdown) — the standard panel renders a
// subset, but the engine carries everything so the Nutrition Breakdown view and
// voluntary-nutrient declarations have real data.

export interface Nutrients {
  calories: number          // kcal (0 = compute via Atwater)
  protein: number           // g
  totalFat: number          // g
  saturatedFat: number      // g
  transFat: number          // g
  polyunsaturatedFat: number // g (voluntary)
  monounsaturatedFat: number // g (voluntary)
  cholesterol: number       // mg
  sodium: number            // mg
  totalCarbohydrate: number // g (incl. fiber + sugars)
  dietaryFiber: number      // g
  totalSugars: number       // g
  addedSugars: number       // g
  sugarAlcohol: number      // g (voluntary)
  // micros
  vitaminD: number          // mcg
  calcium: number           // mg
  iron: number              // mg
  potassium: number         // mg
  vitaminA: number          // mcg RAE
  vitaminC: number          // mg
  vitaminE: number          // mg
  vitaminK: number          // mcg
  thiamin: number           // mg
  riboflavin: number        // mg
  niacin: number            // mg
  vitaminB6: number         // mg
  folate: number            // mcg DFE
  vitaminB12: number        // mcg
  biotin: number            // mcg
  pantothenicAcid: number   // mg
  choline: number           // mg
  phosphorus: number        // mg
  iodine: number            // mcg
  magnesium: number         // mg
  zinc: number              // mg
  selenium: number          // mcg
  copper: number            // mg
  manganese: number         // mg
  chromium: number          // mcg
  molybdenum: number        // mcg
  chloride: number          // mg
  omega3: number            // g (voluntary)
  alcohol: number           // g (for Atwater)
}

export const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  'calories', 'protein', 'totalFat', 'saturatedFat', 'transFat', 'polyunsaturatedFat',
  'monounsaturatedFat', 'cholesterol', 'sodium', 'totalCarbohydrate', 'dietaryFiber',
  'totalSugars', 'addedSugars', 'sugarAlcohol', 'vitaminD', 'calcium', 'iron', 'potassium',
  'vitaminA', 'vitaminC', 'vitaminE', 'vitaminK', 'thiamin', 'riboflavin', 'niacin',
  'vitaminB6', 'folate', 'vitaminB12', 'biotin', 'pantothenicAcid', 'choline', 'phosphorus',
  'iodine', 'magnesium', 'zinc', 'selenium', 'copper', 'manganese', 'chromium', 'molybdenum',
  'chloride', 'omega3', 'alcohol',
]

export function zeroNutrients(): Nutrients {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as unknown as Nutrients
}

export function fillNutrients(p: Partial<Nutrients>): Nutrients {
  return { ...zeroNutrients(), ...p }
}

/** 2016 FDA Daily Values (21 CFR 101.9, adults & children ≥ 4). Nutrients with a DV. */
export const DAILY_VALUES: Partial<Record<keyof Nutrients, number>> = {
  totalFat: 78, saturatedFat: 20, cholesterol: 300, sodium: 2300,
  totalCarbohydrate: 275, dietaryFiber: 28, addedSugars: 50, protein: 50,
  vitaminD: 20, calcium: 1300, iron: 18, potassium: 4700,
  vitaminA: 900, vitaminC: 90, vitaminE: 15, vitaminK: 120, thiamin: 1.2,
  riboflavin: 1.3, niacin: 16, vitaminB6: 1.7, folate: 400, vitaminB12: 2.4,
  biotin: 30, pantothenicAcid: 5, choline: 550, phosphorus: 1250, iodine: 150,
  magnesium: 420, zinc: 11, selenium: 55, copper: 0.9, manganese: 2.3,
  chromium: 35, molybdenum: 45, chloride: 2300,
}
