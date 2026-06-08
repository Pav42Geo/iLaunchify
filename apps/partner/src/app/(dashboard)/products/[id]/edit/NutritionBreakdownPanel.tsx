'use client'

// Nutrition Breakdown (QA view) — the UNROUNDED truth behind the FDA panel.
// Shows, per nutrient: exact per-serving value, %DV computed from the exact
// value (not the rounded display), per-100g, and the batch total. This is the
// engineer/compliance view — never the printed label (that's RecipeLabelPanel).
//
// Fed by the same @ilaunchify/nutrition engine. Self-contained: props in →
// table out, so it drops into a "Nutrition Breakdown" tab once the editor
// loader passes nutrient-bearing ingredients.

import { useMemo, useState } from 'react'
import {
  calculateLabel,
  publicSelection,
  previewSelection,
  DAILY_VALUES,
  type RecipeRow,
  type Nutrients,
} from '@ilaunchify/nutrition'
import type { LabelIngredient, LabelVariant } from './RecipeLabelPanel'

// Display order + labels + units for the breakdown table.
const NUTRIENT_DISPLAY: Array<{ key: keyof Nutrients; label: string; unit: string; indent?: boolean }> = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'totalFat', label: 'Total Fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated Fat', unit: 'g', indent: true },
  { key: 'transFat', label: 'Trans Fat', unit: 'g', indent: true },
  { key: 'polyunsaturatedFat', label: 'Polyunsaturated Fat', unit: 'g', indent: true },
  { key: 'monounsaturatedFat', label: 'Monounsaturated Fat', unit: 'g', indent: true },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'totalCarbohydrate', label: 'Total Carbohydrate', unit: 'g' },
  { key: 'dietaryFiber', label: 'Dietary Fiber', unit: 'g', indent: true },
  { key: 'totalSugars', label: 'Total Sugars', unit: 'g', indent: true },
  { key: 'addedSugars', label: 'Added Sugars', unit: 'g', indent: true },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg' },
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
]

function toRecipeRows(ings: LabelIngredient[]): RecipeRow[] {
  return ings.map((i) => ({
    id: i.id,
    name: i.name,
    per100g: (i.per100g ?? {}) as Partial<Nutrients>,
    quantity: i.weightG,
    unit: 'g',
    trimWastePct: i.trimWastePct,
    densityGPerMl: i.densityGPerMl ?? undefined,
    category: i.category,
    parentId: i.parentId ?? null,
    selected: i.selected,
  }))
}

function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  return n.toFixed(dp).replace(/\.?0+$/, '')
}

interface NutritionBreakdownPanelProps {
  ingredients: LabelIngredient[]
  variants: LabelVariant[]
}

export function NutritionBreakdownPanel({ ingredients, variants }: NutritionBreakdownPanelProps) {
  const [mode, setMode] = useState<'public' | 'preview'>('public')
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '')
  const variant = variants.find((v) => v.id === variantId) ?? variants[0]

  const rows = useMemo(() => toRecipeRows(ingredients), [ingredients])

  const result = useMemo(() => {
    if (!variant) return null
    const selected = mode === 'public' ? publicSelection(rows) : previewSelection(rows)
    if (selected.length === 0) return null
    return calculateLabel(selected, {
      basis: 'serving',
      servingSizeG: variant.servingSizeG > 0 ? variant.servingSizeG : 100,
      servingsPerPackage: Math.max(1, variant.servingsPerContainer),
    })
  }, [rows, mode, variant])

  if (!result || !variant) {
    return (
      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50 px-3 py-6 text-center text-[12px] text-ink-500">
        Add base ingredients + a variant to see the full nutrient breakdown.
      </div>
    )
  }

  const { batch, perServingExact } = result.raw
  const yieldG = result.geometry.yieldG

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-ink-200 bg-white p-0.5">
          {(['public', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
                (mode === m ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900')
              }
            >
              {m === 'public' ? 'Public' : 'Preview'}
            </button>
          ))}
        </div>
        {variants.length > 1 && (
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1 text-[12px] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            aria-label="Breakdown variant"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-[10.5px] leading-snug text-ink-400">
        Unrounded values — the source of truth behind the rounded FDA panel. %DV is computed from
        the exact per-serving amount per 21 CFR 101.9. Batch yield: {fmt(yieldG, 0)} g →{' '}
        {fmt(result.geometry.totalServings, 1)} servings.
      </p>

      <div className="overflow-hidden rounded-lg border border-ink-200">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2">Nutrient</th>
              <th className="px-2 py-2 text-right">Per serving</th>
              <th className="px-2 py-2 text-right">%DV</th>
              <th className="px-2 py-2 text-right">Per 100g</th>
              <th className="px-3 py-2 text-right">Batch</th>
            </tr>
          </thead>
          <tbody>
            {NUTRIENT_DISPLAY.map(({ key, label, unit, indent }) => {
              const ps = perServingExact[key] ?? 0
              const total = batch[key] ?? 0
              const per100 = yieldG > 0 ? (total / yieldG) * 100 : 0
              const dvRef = DAILY_VALUES[key]
              const dv = dvRef ? (ps / dvRef) * 100 : null
              const isCalories = key === 'calories'
              return (
                <tr
                  key={key}
                  className={
                    'border-b border-ink-100 last:border-0 ' +
                    (isCalories ? 'bg-pink-50/40 font-semibold text-ink-900' : 'text-ink-700')
                  }
                >
                  <td className={'px-3 py-1.5 ' + (indent ? 'pl-6 text-ink-500' : '')}>{label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmt(ps)} {!isCalories && <span className="text-ink-400">{unit}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-600">
                    {dv != null ? `${fmt(dv, 1)}%` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-500">{fmt(per100)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">{fmt(total, 1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
