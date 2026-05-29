'use client'

// REBUILD R3 — Customize right-rail on the marketplace product detail
// page.
//
// Layout: the detail page now uses a 3-column hero (gallery / configurator
// / customize). This rail is the third column: sticky to the viewport so
// it stays visible while the creator scrolls through the configurator +
// tabs, with two stacked cards:
//
//   1. Ingredient chip card — wraps the existing IngredientsList. Lets
//      the creator swap base ingredients via the slot model and add
//      optional add-ons. State is purely client-side (ephemeral) — it
//      only commits when the creator clicks Start Launching, at which
//      point R5's createProductFromMarketplaceSelection materialises the
//      Product. R3 ships with informational price delta only.
//
//   2. Live Nutrition Facts — pinned NutritionFactsRenderer showing the
//      base recipe's nutrition. V1 doesn't yet recompute on ingredient
//      swaps (that requires the compliance microservice, which lives in
//      packages/compliance-client). V1.1 will hook into a debounced
//      recompute action; for now we show a small "Updates after launch"
//      caveat under the panel.
//
// The price delta from ingredient swaps flows into a footer so the
// creator can see the impact alongside the LaunchCtaCluster price.

import * as React from 'react'
import {
  IngredientsList,
  NutritionFactsRenderer,
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
  // Ingredient swap state — `{ baseIngredientId → replacementId }`.
  const [replacements, setReplacements] = React.useState<Record<string, string>>({})
  // Optional add-on selection.
  const [addOnIds, setAddOnIds] = React.useState<string[]>([])

  // Running price delta vs. base recipe. Informational only in V1.
  const replacementDelta = React.useMemo(() => {
    let sum = 0
    for (const [ingredientId, replacementId] of Object.entries(replacements)) {
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
      {/* --- Ingredients card ---------------------------------------- */}
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <header className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-pink-700">
            Customize
          </p>
          <h3 className="mt-1 font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
            Ingredients &amp; recipe
          </h3>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-500">
            Swap any base ingredient for a curated alternative, or layer
            in add-ons. Changes are saved when you Start Launching.
          </p>
        </header>

        {/* Cap the ingredient card's body so taller slot lists don't push
            the live Nutrition Facts panel below the fold. Internal scroll
            keeps it self-contained; the rail itself stays sticky as a unit. */}
        <div className="max-h-[42vh] overflow-y-auto pr-1">
          <IngredientsList
            base={ingredients}
            addOns={ingredientAddOns}
            replacements={replacements}
            selectedAddOnIds={addOnIds}
            onReplace={(id, replacementId) =>
              setReplacements((prev) => {
                const next = { ...prev }
                if (replacementId) next[id] = replacementId
                else delete next[id]
                return next
              })
            }
            onAddOnToggle={(id, on) =>
              setAddOnIds((prev) =>
                on ? [...prev, id] : prev.filter((x) => x !== id),
              )
            }
          />
        </div>

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
