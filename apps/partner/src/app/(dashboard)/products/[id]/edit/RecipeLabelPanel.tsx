'use client'

// Live FDA label panel — computed by @ilaunchify/nutrition (the real engine),
// not the structural placeholder. Drops into the editor's right rail.
//
// PUBLIC vs PREVIEW (locked rule):
//   • Public  = the marketplace label = BASE ingredients only (default recipe).
//   • Preview = internal manufacturer view = base + active replaceable swaps +
//     ticked optionals. A creator's order recalculates its own final label.
//
// Geometry: each variant declares servingsPerContainer (N) + servingSizeG (S).
// Per-serving nutrients depend only on composition + S (independent of batch
// scale), and "servings per container" displays N. Moisture loss is a preview
// control (water leaves, nutrients are conserved → values concentrate).

import { useMemo, useState } from 'react'
import {
  calculateLabel,
  publicSelection,
  previewSelection,
  toPanelData,
  formatNetWeight,
  type RecipeRow,
} from '@ilaunchify/nutrition'
import type { Nutrients } from '@ilaunchify/nutrition'
import { NutritionFactsRenderer } from '@ilaunchify/ui'

// ---- Props (shapes the editor loader will pass) ----------------------------

export interface LabelIngredient {
  id: string
  name: string
  weightG: number
  /** From Ingredient.nutritionPer100g (JSON). Keys match the engine's Nutrients. */
  per100g: Record<string, number>
  densityGPerMl?: number | null
  /** 'base' slots vs 'optional' pool. */
  category: 'base' | 'optional'
  /** Replaceable alternates point at their base slot via parentId. */
  parentId?: string | null
  /** Replaceable: active swap. Optional: ticked into the preview. */
  selected?: boolean
  /** Trim/peel loss — removes mass AND nutrients. */
  trimWastePct?: number
}

export interface LabelVariant {
  id: string
  /** e.g. "12oz can · Vanilla" — for the selector. */
  label: string
  servingsPerContainer: number
  servingSizeG: number
  servingSizeDesc?: string | null
}

interface RecipeLabelPanelProps {
  labelingType: string
  ingredients: LabelIngredient[]
  variants: LabelVariant[]
  /** Optional: base price (cents) for a compact cost-per-serving readout. */
  priceFloorCents?: number
}

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

export function RecipeLabelPanel({
  labelingType,
  ingredients,
  variants,
  priceFloorCents,
}: RecipeLabelPanelProps) {
  const [mode, setMode] = useState<'public' | 'preview'>('public')
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '')
  const [moisturePct, setMoisturePct] = useState(0)

  const variant = variants.find((v) => v.id === variantId) ?? variants[0]
  const isSupplement = labelingType === 'DIETARY_SUPPLEMENT'

  const rows = useMemo(() => toRecipeRows(ingredients), [ingredients])

  const result = useMemo(() => {
    if (!variant) return null
    const selected = mode === 'public' ? publicSelection(rows) : previewSelection(rows)
    if (selected.length === 0) return null
    return calculateLabel(selected, {
      basis: 'serving',
      servingSizeG: variant.servingSizeG > 0 ? variant.servingSizeG : 100,
      servingsPerPackage: Math.max(1, variant.servingsPerContainer),
      moistureLossPct: moisturePct,
    })
  }, [rows, mode, variant, moisturePct])

  const panel = useMemo(() => {
    if (!result || !variant) return null
    return toPanelData(result, {
      suggestedServing: variant.servingSizeDesc ?? undefined,
      format: isSupplement ? 'SUPPLEMENT_FACTS' : 'STANDARD',
    })
  }, [result, variant, isSupplement])

  const hasBase = ingredients.some((i) => i.category === 'base' && !i.parentId)

  return (
    <div className="space-y-3">
      {/* Public / Preview toggle */}
      <div className="flex items-center gap-1 rounded-full border border-ink-200 bg-white p-0.5">
        {(['public', 'preview'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              'flex-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
              (mode === m ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900')
            }
          >
            {m === 'public' ? 'Public label' : 'Internal preview'}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-ink-400">
        {mode === 'public'
          ? 'Marketplace label — base ingredients only.'
          : 'Internal — base + active swaps + ticked optionals. Not the public label.'}
      </p>

      {/* Variant selector (geometry source) */}
      {variants.length > 1 && (
        <select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className="block w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          aria-label="Label variant"
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      )}

      {/* The label */}
      {panel ? (
        <NutritionFactsRenderer data={panel} widthPx={null} />
      ) : (
        <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50 px-3 py-6 text-center text-[11.5px] text-ink-500">
          {!hasBase
            ? 'Add at least one base ingredient to see the label.'
            : !variant
              ? 'Add a variant (container size) to compute servings.'
              : 'Nothing to show for this view yet.'}
        </div>
      )}

      {/* Net weight — front-of-pack, NOT part of the Facts panel (21 CFR) */}
      {result && variant && (
        <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Net weight (front of pack)
          </p>
          <p className="mt-0.5 font-display text-[15px] font-bold text-ink-900">
            Net Wt {formatNetWeight(result.geometry.netWeightG)}
          </p>
          <p className="mt-0.5 text-[10.5px] text-ink-500">
            {result.geometry.servingsPerContainerLabel} serving
            {variant.servingsPerContainer === 1 ? '' : 's'} per container ·{' '}
            {Math.round(variant.servingSizeG)} g each
          </p>
        </div>
      )}

      {/* Moisture-loss preview control */}
      <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between">
          <label htmlFor="moisture" className="text-[10.5px] font-medium text-ink-700">
            Cook / moisture loss
          </label>
          <span className="text-[11px] font-semibold text-pink-700">{moisturePct}%</span>
        </div>
        <input
          id="moisture"
          type="range"
          min={0}
          max={80}
          step={1}
          value={moisturePct}
          onChange={(e) => setMoisturePct(parseInt(e.target.value, 10))}
          className="mt-1.5 w-full accent-pink-600"
        />
        <p className="mt-0.5 text-[9.5px] leading-snug text-ink-400">
          Water leaves, nutrients stay — per-serving values concentrate. Preview only.
        </p>
      </div>

      {/* Compact cost-per-serving readout (optional) */}
      {priceFloorCents != null && priceFloorCents > 0 && variant && (
        <div className="rounded-lg border border-ink-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Cost summary
          </p>
          <div className="mt-1 flex items-baseline justify-between text-[12px]">
            <span className="text-ink-600">Per container</span>
            <span className="font-semibold text-ink-900">
              ${(priceFloorCents / 100).toFixed(2)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between text-[12px]">
            <span className="text-ink-600">Per serving</span>
            <span className="font-semibold text-ink-900">
              $
              {(
                priceFloorCents /
                100 /
                Math.max(1, variant.servingsPerContainer)
              ).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
