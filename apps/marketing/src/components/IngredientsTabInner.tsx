'use client'

import * as React from 'react'
import { IngredientsList } from '@ilaunchify/ui'
import { findTemplateDetail } from '@/lib/template-detail'

/**
 * IngredientsTabInner — the client-side stateful wrapper for the
 * "Ingredients" tab on the ProductTemplate detail page.
 *
 * Renders <IngredientsList> with two pieces of local state:
 *   - `replacements`  : `{ ingredientId → replacementId }`
 *   - `addOnIds`      : selected add-on IDs
 *
 * Computes a running price delta (vs. base recipe) and surfaces it as a
 * sticky summary at the bottom. The delta is informational only — the actual
 * landed cost still comes from the configurator, which will pick this state
 * up via shared store / URL params in V1.1.
 *
 * Aligned with the slot-based recipe schema per
 * [[ilaunchify-ingredient-sourcing]] and [[ilaunchify-flavors-as-presets]].
 */
export interface IngredientsTabInnerProps {
  slug: string
}

export function IngredientsTabInner({ slug }: IngredientsTabInnerProps) {
  const detail = findTemplateDetail(slug)

  const [replacements, setReplacements] = React.useState<Record<string, string>>({})
  const [addOnIds, setAddOnIds] = React.useState<string[]>([])

  // Running price delta (informational — separate from configurator).
  const replacementDelta = React.useMemo(() => {
    let sum = 0
    for (const [ingredientId, replacementId] of Object.entries(replacements)) {
      const ing = detail.ingredients.find((i) => i.id === ingredientId)
      const rep = ing?.replacements?.find((r) => r.id === replacementId)
      if (rep?.priceDelta) sum += rep.priceDelta
    }
    return sum
  }, [replacements, detail.ingredients])

  const addOnDelta = React.useMemo(() => {
    let sum = 0
    for (const id of addOnIds) {
      const ao = detail.ingredientAddOns.find((a) => a.id === id)
      if (ao) sum += ao.priceDelta
    }
    return sum
  }, [addOnIds, detail.ingredientAddOns])

  const totalDelta = +(replacementDelta + addOnDelta).toFixed(2)
  const hasChanges =
    Object.keys(replacements).length > 0 || addOnIds.length > 0

  // Derived allergens (post-swap + post-add-on)
  const allergens = React.useMemo(() => {
    const set = new Set<string>()
    for (const ing of detail.ingredients) {
      const replacementId = replacements[ing.id]
      const rep = replacementId
        ? ing.replacements?.find((r) => r.id === replacementId)
        : null
      const active = rep ?? ing
      for (const a of active.allergens ?? []) set.add(a)
    }
    for (const id of addOnIds) {
      const ao = detail.ingredientAddOns.find((a) => a.id === id)
      for (const a of ao?.allergens ?? []) set.add(a)
    }
    return Array.from(set)
  }, [detail, replacements, addOnIds])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-start">
      <div>
        <IngredientsList
          base={detail.ingredients}
          addOns={detail.ingredientAddOns}
          selectedAddOnIds={addOnIds}
          onAddOnToggle={(id, next) =>
            setAddOnIds((prev) =>
              next ? [...prev, id] : prev.filter((x) => x !== id),
            )
          }
          replacements={replacements}
          onReplace={(ingredientId, replacementId) =>
            setReplacements((prev) => {
              const next = { ...prev }
              if (replacementId === null) delete next[ingredientId]
              else next[ingredientId] = replacementId
              return next
            })
          }
        />
      </div>

      <aside className="lg:sticky lg:top-24 flex flex-col gap-4">
        <div className="border border-ink-200 rounded-xl bg-cream p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2.5">
            Recipe summary
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-500">Replacements</dt>
              <dd className="text-ink-900 font-semibold tabular-nums">
                {Object.keys(replacements).length}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-500">Add-ons selected</dt>
              <dd className="text-ink-900 font-semibold tabular-nums">
                {addOnIds.length}
              </dd>
            </div>
            <div className="border-t border-ink-200 pt-2.5 flex items-baseline justify-between gap-3">
              <dt className="text-ink-700 font-semibold">Cost change</dt>
              <dd
                className={
                  'font-bold tabular-nums ' +
                  (totalDelta > 0
                    ? 'text-pink-700'
                    : totalDelta < 0
                      ? 'text-success-500'
                      : 'text-ink-500')
                }
              >
                {totalDelta > 0 ? '+' : ''}${totalDelta.toFixed(2)} / unit
              </dd>
            </div>
          </dl>

          {hasChanges && (
            <button
              type="button"
              onClick={() => {
                setReplacements({})
                setAddOnIds([])
              }}
              className="mt-4 text-[12px] font-semibold text-pink-700 hover:text-pink-600 transition-colors"
            >
              Reset to base recipe
            </button>
          )}
        </div>

        <div className="border border-ink-200 rounded-xl bg-white p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-2.5">
            Allergens (live)
          </div>
          {allergens.length === 0 ? (
            <div className="text-[13px] text-ink-500 italic">
              No major allergens in current recipe.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allergens.map((a) => (
                <span
                  key={a}
                  className="text-[11px] font-semibold text-warning-500 bg-warning-50 px-2 py-0.5 rounded-pill"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
          <div className="text-[11px] text-ink-500 mt-3 leading-relaxed">
            Updates instantly as you swap ingredients or toggle add-ons. The
            final label is recomputed by the compliance service before
            production.
          </div>
        </div>
      </aside>
    </div>
  )
}
