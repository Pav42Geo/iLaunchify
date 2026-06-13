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

// ---------------------------------------------------------------------------
// Age-group Daily Values (21 CFR 101.9(j)(5)) — Nutrition Facts panel variants.
// Values are the codified 2016-rule RDI table (c)(8)(iv) + DRV table (c)(9),
// verified against eCFR 21 CFR 101.9. A key being ABSENT means FDA has not
// established a DV for that nutrient/age — so NO %DV is shown (the renderer omits
// the column), per the regulation's "N/A" cells.
// ---------------------------------------------------------------------------

/** Audience selecting the Nutrition Facts DV table + %DV columns. */
export type NutritionAudience = 'GENERAL' | 'CHILD_1_3' | 'INFANT_0_12'

/** Children 1 through 3 years — 1,000-cal DRV basis. Every macronutrient has a DV. */
export const DAILY_VALUES_CHILD_1_3: Partial<Record<keyof Nutrients, number>> = {
  totalFat: 39, saturatedFat: 10, cholesterol: 300, sodium: 1500,
  totalCarbohydrate: 150, dietaryFiber: 14, addedSugars: 25, protein: 13,
  vitaminD: 15, calcium: 700, iron: 7, potassium: 3000,
  vitaminA: 300, vitaminC: 15, vitaminE: 6, vitaminK: 30, thiamin: 0.5,
  riboflavin: 0.5, niacin: 6, vitaminB6: 0.5, folate: 150, vitaminB12: 0.9,
  biotin: 8, pantothenicAcid: 2, choline: 200, phosphorus: 460, iodine: 90,
  magnesium: 80, zinc: 3, selenium: 20, copper: 0.3, manganese: 1.2,
  chromium: 11, molybdenum: 17, chloride: 1500,
}

/** Infants through 12 months — infant RDIs. NOTE: saturated fat, cholesterol,
 *  sodium, dietary fiber and added sugars have NO established DV (omitted →
 *  no %DV); protein uses the infant RDI (11 g), not a DRV. */
export const DAILY_VALUES_INFANT_0_12: Partial<Record<keyof Nutrients, number>> = {
  totalFat: 30, totalCarbohydrate: 95, protein: 11,
  vitaminD: 10, calcium: 260, iron: 11, potassium: 700,
  vitaminA: 500, vitaminC: 50, vitaminE: 5, vitaminK: 2.5, thiamin: 0.3,
  riboflavin: 0.4, niacin: 4, vitaminB6: 0.3, folate: 80, vitaminB12: 0.5,
  biotin: 6, pantothenicAcid: 1.8, choline: 150, phosphorus: 275, iodine: 130,
  magnesium: 75, zinc: 3, selenium: 20, copper: 0.2, manganese: 0.6,
  chromium: 5.5, molybdenum: 3, chloride: 570,
}

/** Resolve the Daily Value table for an audience (defaults to GENERAL ≥4 yrs). */
export function dailyValuesFor(audience: NutritionAudience = 'GENERAL'): Partial<Record<keyof Nutrients, number>> {
  if (audience === 'CHILD_1_3') return DAILY_VALUES_CHILD_1_3
  if (audience === 'INFANT_0_12') return DAILY_VALUES_INFANT_0_12
  return DAILY_VALUES
}
