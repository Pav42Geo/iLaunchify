'use client'

import { useMemo } from 'react'
import { NutritionFactsRenderer } from '@ilaunchify/ui'
import { Card, CardContent, CardHeader, CardTitle } from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'
import { sumNutrients, percentDailyValue, type NutrientProfilePer100g } from '@/lib/nutrition'
import type { BuilderIngredient } from '@/stores/recipe-builder-store'

interface NutritionPreviewProps {
  ingredients: BuilderIngredient[]
  servingSizeG: number
  servingsPerContainer: number
  servingSizeDesc: string
  productCategory: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT'
}

export function NutritionPreview({
  ingredients,
  servingSizeG,
  servingsPerContainer,
  servingSizeDesc,
  productCategory,
}: NutritionPreviewProps) {
  const panelData = useMemo<PanelData | null>(() => {
    if (ingredients.length === 0 || servingSizeG <= 0) return null

    const profile = sumNutrients(
      ingredients.map((i) => ({
        weightG: i.weightG,
        nutritionPer100g: i.nutritionPer100g as NutrientProfilePer100g,
      })),
      servingSizeG,
    )

    const isSupplement = productCategory === 'SUPPLEMENT'

    return {
      format: isSupplement ? 'SUPPLEMENT_FACTS' : 'STANDARD',
      servingSize: servingSizeDesc,
      servingsPerContainer: String(servingsPerContainer || '—'),
      rows: buildRows(profile, isSupplement),
      requiredFooter: '* % Daily Value based on a 2,000 calorie diet.',
      requiredWarnings: requiredWarnings(profile),
    }
  }, [ingredients, servingSizeG, servingsPerContainer, servingSizeDesc, productCategory])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Live preview</CardTitle>
        <p className="text-xs text-zinc-500">
          Preview only. Final values + compliance check run on save in the Python service.
        </p>
      </CardHeader>
      <CardContent>
        {panelData ? (
          <NutritionFactsRenderer data={panelData} widthPx={280} />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-md border-2 border-dashed border-zinc-300 text-sm text-zinc-500">
            Add ingredients and a serving size to preview the label.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function buildRows(profile: NutrientProfilePer100g, isSupplement: boolean) {
  // V1 nutrient order matches us-fda-food-2026.01.json mandatory list
  const order: Array<[keyof NutrientProfilePer100g, string, string | null, number]> = [
    ['calories', 'Calories', null, 0],
    ['totalFat', 'Total Fat', 'g', 0],
    ['saturatedFat', 'Saturated Fat', 'g', 1],
    ['transFat', 'Trans Fat', 'g', 1],
    ['cholesterol', 'Cholesterol', 'mg', 0],
    ['sodium', 'Sodium', 'mg', 0],
    ['totalCarbohydrate', 'Total Carbohydrate', 'g', 0],
    ['dietaryFiber', 'Dietary Fiber', 'g', 1],
    ['totalSugars', 'Total Sugars', 'g', 1],
    ['addedSugars', 'Includes Added Sugars', 'g', 2],
    ['protein', 'Protein', 'g', 0],
    ['vitaminD', 'Vitamin D', 'mcg', 0],
    ['calcium', 'Calcium', 'mg', 0],
    ['iron', 'Iron', 'mg', 0],
    ['potassium', 'Potassium', 'mg', 0],
  ]

  return order
    .filter(([key]) => !isSupplement || profile[key] !== undefined)
    .map(([key, label, unit, indent]) => {
      const amount = profile[key] ?? 0
      const pct = percentDailyValue(key, amount)
      return {
        id: key,
        label,
        amount: amount === 0 && key !== 'calories' ? 0 : Math.round(amount * 10) / 10,
        unit: unit ?? undefined,
        percentDailyValue: pct ?? undefined,
        indent,
      }
    })
}

function requiredWarnings(profile: NutrientProfilePer100g): string[] {
  const warnings: string[] = []
  // Iron warning per 21 CFR 101.17(e) — supplements ≥ 30 mg iron per serving
  if ((profile.iron ?? 0) >= 30) {
    warnings.push(
      'WARNING: Accidental overdose of iron-containing products is a leading cause of fatal poisoning in children under 6. Keep out of reach of children.',
    )
  }
  return warnings
}
