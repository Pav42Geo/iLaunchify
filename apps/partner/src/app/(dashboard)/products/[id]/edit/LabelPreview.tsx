'use client'

// Live label preview — the spec's signature sticky-rail element
// (docs/MANUFACTURER_PRODUCT_BUILDER.md §4.1).
//
// HONESTY RULE (operational-trust memo): nutrition VALUES are never computed
// client-side — that math (per-serving summing, FDA rounding, %DV) belongs to
// the compliance service and a wrong number here would be worse than none.
// Until #131 wires recipe → compliance → label, values render as em-dashes
// under a "pending" notice. Everything else on the panel is REAL today:
//   - Nutrition vs Supplement Facts title  ← labelingType
//   - Serving size / servings per container ← selected variant
//   - Ingredient statement (weight desc)    ← slots
//   - CONTAINS line                         ← slot allergens + manual overrides
//   - Cross-contamination statement         ← template field
//
// When #131 lands, this component receives a computed NutritionProfile and
// the dashes become numbers — the layout doesn't change.

import { useMemo, useState } from 'react'

export interface LabelPreviewSlot {
  name: string
  weightG: number
  allergens: string[]
}

export interface LabelPreviewVariant {
  id: string
  flavor: string | null
  containerFormat: string
  servingsPerContainer: number
  servingSizeG: number
  servingSizeDesc: string | null
}

interface Props {
  labelingType: string
  slots: LabelPreviewSlot[]
  variants: LabelPreviewVariant[]
  allergenOverrides: Array<{ allergen: string; action: 'ADD' | 'REMOVE'; reason: string }>
  crossContamination: string | null
  nutrientOverrideCount: number
}

// FOOD panel rows (FDA 21 CFR 101.9 order). Values stay "—" until #131.
const FOOD_ROWS: Array<{ label: string; indent?: 1 | 2; bold?: boolean; italic?: boolean }> = [
  { label: 'Total Fat', bold: true },
  { label: 'Saturated Fat', indent: 1 },
  { label: 'Trans Fat', indent: 1, italic: true },
  { label: 'Cholesterol', bold: true },
  { label: 'Sodium', bold: true },
  { label: 'Total Carbohydrate', bold: true },
  { label: 'Dietary Fiber', indent: 1 },
  { label: 'Total Sugars', indent: 1 },
  { label: 'Incl. Added Sugars', indent: 2 },
  { label: 'Protein', bold: true },
]

const MICROS = ['Vitamin D', 'Calcium', 'Iron', 'Potassium']

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

export function LabelPreview({
  labelingType,
  slots,
  variants,
  allergenOverrides,
  crossContamination,
  nutrientOverrideCount,
}: Props) {
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null)
  const variant = variants.find((v) => v.id === variantId) ?? variants[0] ?? null

  const isSupplement = labelingType === 'DIETARY_SUPPLEMENT'
  const title = isSupplement ? 'Supplement Facts' : 'Nutrition Facts'

  // Ingredient statement — descending weight, the FDA ordering rule.
  const ingredientStatement = useMemo(() => {
    return [...slots]
      .sort((a, b) => b.weightG - a.weightG)
      .map((s) => s.name)
      .join(', ')
  }, [slots])

  // Effective allergens — union of slot flags, then manual ADD/REMOVE.
  const containsList = useMemo(() => {
    const set = new Set(slots.flatMap((s) => s.allergens))
    for (const o of allergenOverrides) {
      if (o.action === 'ADD') set.add(o.allergen)
      else set.delete(o.allergen)
    }
    return Array.from(set)
  }, [slots, allergenOverrides])

  if (slots.length === 0 && variants.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-xs text-zinc-500">
        Add an ingredient and a variant — the label builds itself as you go.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {/* Pending-values notice — outside the label so the panel stays authentic */}
      <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[10.5px] leading-snug text-amber-800">
        Values compute at compliance check (#131)
        {nutrientOverrideCount > 0 &&
          ` · ${nutrientOverrideCount} manual override${nutrientOverrideCount === 1 ? '' : 's'} will apply`}
        . Layout, serving info, ingredients &amp; allergens are live.
      </p>

      {/* Variant switcher — per flavor × per size, per spec §4a.3 */}
      {variants.length > 1 && (
        <select
          value={variant?.id ?? ''}
          onChange={(e) => setVariantId(e.target.value)}
          className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
          aria-label="Preview variant"
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {[v.flavor, v.containerFormat].filter(Boolean).join(' · ') || 'Variant'}
            </option>
          ))}
        </select>
      )}

      {/* The panel — classic FDA chrome: black rules, dense, sans */}
      <div className="select-none border-2 border-black bg-white p-2 font-sans text-black">
        <p className="text-[22px] font-extrabold leading-none tracking-tight">{title}</p>
        <div className="mt-1 border-b border-black pb-1 text-[10.5px] leading-tight">
          {variant ? (
            <>
              <p>{variant.servingsPerContainer} servings per container</p>
              <p className="flex justify-between font-bold">
                <span>Serving size</span>
                <span>
                  {variant.servingSizeDesc
                    ? `${variant.servingSizeDesc} (${variant.servingSizeG}g)`
                    : `${variant.servingSizeG}g`}
                </span>
              </p>
            </>
          ) : (
            <p className="italic text-zinc-500">Add a variant to set serving size</p>
          )}
        </div>

        {/* Calories band */}
        <div className="border-b-[6px] border-black py-0.5">
          <p className="text-[9px] font-bold">Amount per serving</p>
          <p className="flex items-end justify-between leading-none">
            <span className="text-[16px] font-extrabold">Calories</span>
            <span className="text-[22px] font-extrabold tabular-nums">—</span>
          </p>
        </div>

        <p className="border-b border-black py-0.5 text-right text-[8.5px] font-bold">
          % Daily Value*
        </p>

        {FOOD_ROWS.map((r) => (
          <p
            key={r.label}
            className={`flex justify-between border-b border-black py-[2px] text-[10px] leading-tight ${
              r.indent === 2 ? 'pl-6' : r.indent === 1 ? 'pl-3' : ''
            }`}
          >
            <span className={`${r.bold ? 'font-bold' : ''} ${r.italic ? 'italic' : ''}`}>
              {r.label} <span className="font-normal">—</span>
            </span>
            <span className="font-bold tabular-nums">—%</span>
          </p>
        ))}

        <div className="border-b-[4px] border-black">
          {MICROS.map((m) => (
            <p
              key={m}
              className="flex justify-between border-b border-zinc-400 py-[2px] text-[10px] leading-tight last:border-b-0"
            >
              <span>{m} —</span>
              <span className="tabular-nums">—%</span>
            </p>
          ))}
        </div>

        <p className="pt-1 text-[7.5px] leading-snug">
          * The % Daily Value (DV) tells you how much a nutrient in a serving of
          food contributes to a daily diet. 2,000 calories a day is used for
          general nutrition advice.
        </p>
      </div>

      {/* Ingredient statement + allergens — real data, label-adjacent copy */}
      {ingredientStatement && (
        <p className="text-[10px] leading-snug text-zinc-800">
          <span className="font-bold uppercase">Ingredients:</span> {ingredientStatement}.
        </p>
      )}
      {containsList.length > 0 && (
        <p className="text-[10px] font-bold uppercase leading-snug text-zinc-900">
          Contains: {containsList.map(titleCase).join(', ')}.
        </p>
      )}
      {crossContamination && (
        <p className="text-[10px] italic leading-snug text-zinc-600">{crossContamination}</p>
      )}
    </div>
  )
}
