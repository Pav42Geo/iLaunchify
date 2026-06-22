// Phase 2b — the type seam. Maps the platform-canonical PanelData
// (@ilaunchify/types, produced by the nutrition engine / buildFoodLabel /
// getVarietyPreviewColumns) to the canvas NutritionPanelData (@ilaunchify/ui)
// that addNutritionFactsPanel renders. PURE + node-tested — no canvas.
//
// FOOD Nutrition Facts only (PanelData.format STANDARD / TABULAR / LINEAR).
// SUPPLEMENT_FACTS uses the supplement panel + its own adapter (Step E).

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import type {
  NutritionPanelData,
  NutritionRow,
  AggregateNutritionData,
  NutritionFlavor,
  SupplementPanelData,
  SupplementRow,
  AafcoPanelData,
  AafcoAnalysisRow,
} from '@ilaunchify/ui'

// The FDA "major" declared nutrients render bold; their sub-items + the bottom
// vitamins do not (confirmed against SAMPLE_NUTRITION_DATA). Match by stable id.
const BOLD_IDS = new Set(['totalFat', 'cholesterol', 'sodium', 'totalCarbohydrate', 'protein'])

/** "1" + "g" → "1g"; numeric Calories ("120") drops the (absent) unit; string
 *  amounts ("less than 1 g") pass through as-authored. */
function formatValue(amount: number | string, unit?: string): string {
  if (typeof amount === 'string') return amount
  return unit ? `${amount}${unit}` : `${amount}`
}

function toNumber(amount: number | string): number {
  return typeof amount === 'number' ? amount : Number.parseFloat(String(amount)) || 0
}

/**
 * PanelData (FOOD) → NutritionPanelData. Lifts Calories out of the rows into the
 * top-level field, lifts "Includes Added Sugars" into `addedSugarG`, formats the
 * amount cell, and bolds the FDA majors. Sub-rows keep their indent.
 */
export function panelDataToNutritionPanelData(panel: PanelData): NutritionPanelData {
  const caloriesRow = panel.rows.find((r) => r.id === 'calories')
  const addedRow = panel.rows.find((r) => r.id === 'addedSugars')

  const rows: NutritionRow[] = panel.rows
    .filter((r: NutrientRow) => r.id !== 'calories' && r.id !== 'addedSugars')
    .map((r: NutrientRow) => ({
      label: r.label,
      value: formatValue(r.amount, r.unit),
      dvPercent: r.percentDailyValue ?? null,
      ...(r.indent === 1 ? { indent: 1 as const } : r.indent === 2 ? { indent: 2 as const } : {}),
      ...(BOLD_IDS.has(r.id) ? { bold: true } : {}),
    }))

  return {
    servingsPerContainer: panel.servingsPerContainer,
    servingSize: panel.servingSize,
    calories: caloriesRow ? toNumber(caloriesRow.amount) : 0,
    rows,
    ...(addedRow ? { addedSugarG: toNumber(addedRow.amount) } : {}),
    footnote: panel.requiredFooter,
  }
}

/**
 * Per-flavor PanelData columns → AggregateNutritionData (the multi-column variety
 * panel). Reuses the single-panel adapter per column; the footnote comes from the
 * first column (all flavors share the FDA footer). Used for AGGREGATE topology.
 */
export function varietyColumnsToAggregateNutritionData(
  columns: Array<{ label: string; panel: PanelData }>,
): AggregateNutritionData {
  const flavors: NutritionFlavor[] = columns.map((c) => {
    const np = panelDataToNutritionPanelData(c.panel)
    return {
      name: c.label,
      servingsPerContainer: np.servingsPerContainer,
      servingSize: np.servingSize,
      calories: np.calories,
      rows: np.rows,
      ...(np.addedSugarG != null ? { addedSugarG: np.addedSugarG } : {}),
    }
  })
  const footnote = columns[0] ? panelDataToNutritionPanelData(columns[0].panel).footnote : ''
  return { flavors, footnote }
}

/**
 * DIETARY_SUPPLEMENT PanelData (from toSupplementPanelData) → SupplementPanelData.
 * Supplement Facts have no Calories/Added-Sugars lift; every nutrient is a row
 * with a pre-formatted amount + %DV (null = "†", no DV established). Sub-rows of a
 * proprietary blend keep their indent. `otherIngredients` becomes the below-box line.
 */
export function panelDataToSupplementPanelData(
  panel: PanelData,
  otherIngredients: string[] = [],
): SupplementPanelData {
  const rows: SupplementRow[] = panel.rows.map((r: NutrientRow) => ({
    label: r.label,
    value: formatValue(r.amount, r.unit),
    dvPercent: r.percentDailyValue ?? null,
    ...(r.indent === 1 ? { indent: 1 as const } : r.indent === 2 ? { indent: 2 as const } : {}),
  }))
  const others = otherIngredients.map((s) => s.trim()).filter(Boolean)
  return {
    servingSize: panel.servingSize,
    servingsPerContainer: panel.servingsPerContainer,
    rows,
    ...(others.length ? { otherIngredients: `Other ingredients: ${others.join(', ')}.` } : {}),
  }
}

/**
 * PET_PRODUCT label (from buildPetLabel) → AafcoPanelData. The guaranteed-analysis
 * rows carry the min/max bound inside the label ("Crude Protein (min)") — split it
 * into the panel's separate `qualifier` column (defaulting to min for any
 * non-min/max bound). Adequacy statement → the AAFCO nutritional-adequacy line.
 */
export function petLabelToAafcoPanelData(d: {
  gaRows: Array<{ label: string; value: string }>
  ingredients: string
  adequacyStatement?: string
  feedingDirections?: string
}): AafcoPanelData {
  const analysis: AafcoAnalysisRow[] = d.gaRows.map((r) => {
    const m = r.label.match(/^(.*?)\s*\((min|max)\)\s*$/i)
    return m
      ? { label: m[1]!.trim(), qualifier: m[2]!.toLowerCase() as 'min' | 'max', value: r.value }
      : { label: r.label.trim(), qualifier: 'min' as const, value: r.value }
  })
  return {
    analysis,
    ingredients: d.ingredients,
    feedingDirections: d.feedingDirections ?? '',
    ...(d.adequacyStatement ? { nutritionalAdequacy: d.adequacyStatement } : {}),
  }
}
