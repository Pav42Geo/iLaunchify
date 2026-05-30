'use client'

// REBUILD R3 — Customize right-rail on the marketplace product detail
// page. Slot-per-card pattern (matching the creator /customize page).
//
// Each base ingredient renders as an IngredientSlotCard:
//   - Locked slots (no replacements available) show a "Locked" pill
//   - Swappable slots show a dropdown of the default + alternatives,
//     with the currently-selected one highlighted and price delta
//     displayed inline.
//
// Add-ons render as a separate "Optional add-ons" section with
// toggleable cards (price delta + description).
//
// State is purely client-side until Start Launching commits — guests
// can play freely with the live preview, only the CTA hits the auth
// wall. V1.1 will hook the recipe diff into the launch action so the
// canvas opens pre-customised.

import * as React from 'react'
import {
  IngredientSlotCard,
  NutritionFactsRenderer,
  Badge,
  type IngredientRow,
  type IngredientAddOn,
} from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'

export interface CustomizeRailProps {
  /** Base recipe ingredients. */
  ingredients: IngredientRow[]
  /** Optional add-ons the creator can layer on top of the base recipe. */
  ingredientAddOns?: IngredientAddOn[]
  /** Static base-recipe nutrition data. V1.1 swaps for recalculated panel. */
  nutrition?: PanelData
}

export function CustomizeRail({
  ingredients,
  ingredientAddOns = [],
  nutrition,
}: CustomizeRailProps) {
  // Per-ingredient swap state. Key = base ingredient id, value = picked
  // replacement id (or '__default' when on default).
  const [replacements, setReplacements] = React.useState<Record<string, string>>(
    {},
  )
  // Optional add-on selection.
  const [addOnIds, setAddOnIds] = React.useState<string[]>([])

  // Running price delta vs. base. Informational in V1.
  const replacementDelta = React.useMemo(() => {
    let sum = 0
    for (const [ingredientId, replacementId] of Object.entries(replacements)) {
      if (replacementId === '__default') continue
      const ing = ingredients.find((i) => i.id === ingredientId)
      const rep = ing?.replacements?.find((r) => r.id === replacementId)
      if (rep?.priceDelta) sum += rep.priceDelta
    }
    return sum
  }, [replacements, ingredients])

  const addOnDelta = React.useMemo(() => {
    let sum = 0
    for (const id of addOnIds) {
      const ao = ingredientAddOns.find((a) => a.id === id)
      if (ao) sum += ao.priceDelta
    }
    return sum
  }, [addOnIds, ingredientAddOns])

  const totalDelta = replacementDelta + addOnDelta
  const hasChanges = totalDelta !== 0

  return (
    <aside className="lg:sticky lg:top-24 self-start space-y-4">
      {/* --- Ingredients (slot-per-card) ----------------------------- */}
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <header className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-pink-700">
            Customize
          </p>
          <h3 className="mt-1 font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
            Recipe ingredients
          </h3>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-500">
            Locked ingredients stay as-is. Replaceable slots show
            alternatives in the dropdown.
          </p>
        </header>

        {/* Cap the slot list height so taller recipes don't push the
            live Nutrition Facts panel below the fold. */}
        <div className="max-h-[44vh] space-y-2.5 overflow-y-auto pr-1">
          {ingredients.map((ing) => {
            const swappable = (ing.replacements?.length ?? 0) > 0
            // First option = default (the base ingredient itself). Then
            // alternatives. Selected id stored locally.
            const options = [
              {
                id: '__default',
                name: ing.name,
                priceDelta: 0,
                allergens: ing.allergens,
              },
              ...(ing.replacements ?? []).map((r) => ({
                id: r.id,
                name: r.name,
                priceDelta: r.priceDelta ?? 0,
                allergens: r.allergens,
              })),
            ]
            const currentId = replacements[ing.id] ?? '__default'
            return (
              <IngredientSlotCard
                key={ing.id}
                label={ing.name}
                meta={`${ing.percent.toFixed(1)}%`}
                isLocked={!swappable}
                options={options}
                currentOptionId={currentId}
                onChange={(optId) =>
                  setReplacements((prev) => ({ ...prev, [ing.id]: optId }))
                }
              />
            )
          })}
        </div>

        {/* Add-ons */}
        {ingredientAddOns.length > 0 && (
          <section className="mt-5 border-t border-ink-100 pt-4">
            <header className="mb-2 flex items-baseline justify-between">
              <h4 className="text-[12.5px] font-semibold text-ink-900">
                Optional add-ons
              </h4>
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                {addOnIds.length} on
              </span>
            </header>
            <ul className="grid gap-2">
              {ingredientAddOns.map((ao) => {
                const on = addOnIds.includes(ao.id)
                return (
                  <li key={ao.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setAddOnIds((prev) =>
                          on ? prev.filter((x) => x !== ao.id) : [...prev, ao.id],
                        )
                      }
                      className={
                        'w-full rounded-md border px-3 py-2 text-left text-[12.5px] transition-colors ' +
                        (on
                          ? 'border-pink-500 bg-pink-50'
                          : 'border-ink-200 bg-white hover:border-ink-400')
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-ink-900">{ao.name}</div>
                          {ao.description && (
                            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-600">
                              {ao.description}
                            </div>
                          )}
                          {(ao.allergens ?? []).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {ao.allergens!.map((a) => (
                                <Badge key={a} variant="warning">
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <span
                          className={
                            'flex-shrink-0 text-[11.5px] font-semibold tabular-nums ' +
                            (ao.priceDelta > 0
                              ? 'text-ink-700'
                              : 'text-emerald-700')
                          }
                        >
                          {ao.priceDelta > 0 ? '+' : ''}${Math.abs(ao.priceDelta).toFixed(2)}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {hasChanges && (
          <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
            <span className="text-[12px] font-medium text-ink-600">
              Recipe delta vs. base
            </span>
            <span
              className={
                'text-[12.5px] font-semibold tabular-nums ' +
                (totalDelta >= 0 ? 'text-pink-700' : 'text-emerald-700')
              }
            >
              {totalDelta >= 0 ? '+' : ''}
              ${Math.abs(totalDelta).toFixed(2)} / unit
            </span>
          </div>
        )}
      </div>

      {/* --- Live nutrition card ------------------------------------- */}
      {nutrition && (
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <header className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-pink-700">
              Live preview
            </p>
            <h3 className="mt-1 font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
              Nutrition Facts
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-ink-500">
              Updates as you customize. Final values come from the
              compliance check.
            </p>
          </header>
          <div className="overflow-hidden rounded-md">
            <NutritionFactsRenderer data={nutrition} widthPx={300} />
          </div>
          {hasChanges && (
            <p className="mt-2 text-[11px] leading-snug text-ink-500">
              Values shown for the base recipe. We recalculate the panel
              once you Start Launching.
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
