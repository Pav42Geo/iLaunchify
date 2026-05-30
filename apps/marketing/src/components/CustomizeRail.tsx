'use client'

// REBUILD R3 — Customize right-rail on the marketplace product detail
// page. Compact one-row-per-ingredient list (no bulky cards).
//
// Visual rules (per Pavel):
//   - Each base ingredient is ONE row in a single list (not a card).
//   - Non-replaceable ingredients render as static text — no "Locked"
//     chip. Locked is the default visual state.
//   - Replaceable ingredients render with a ▼ chevron; click expands
//     an inline picker of {default, alternatives} with selection
//     highlight + price delta per option.
//   - No max-height scroll on the ingredients list — it flows
//     naturally.
//
// Title copy:
//   - "Build Your Recipe" when the product is Private Label
//     (has replaceable or optional add-on ingredients).
//   - "Recipe Ingredients" when the product is White Label
//     (only base ingredients, nothing swappable).
//
// State is purely client-side until Start Launching commits.

import * as React from 'react'
import { ChevronDown, Check } from 'lucide-react'
import {
  NutritionFactsRenderer,
  Badge,
  type IngredientRow,
  type IngredientAddOn,
} from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'

export interface CustomizeRailProps {
  ingredients: IngredientRow[]
  ingredientAddOns?: IngredientAddOn[]
  nutrition?: PanelData
}

export function CustomizeRail({
  ingredients,
  ingredientAddOns = [],
  nutrition,
}: CustomizeRailProps) {
  // Per-ingredient swap state. Key = base ingredient id, value = picked
  // option id ('__default' means on the default).
  const [replacements, setReplacements] = React.useState<Record<string, string>>({})
  // Optional add-on selection.
  const [addOnIds, setAddOnIds] = React.useState<string[]>([])
  // Which row's picker is open (only one at a time).
  const [openRowId, setOpenRowId] = React.useState<string | null>(null)

  // Private Label = at least one slot can be swapped or an add-on
  // exists. White Label = pure base recipe, nothing to customise.
  const isPrivateLabel =
    ingredients.some((i) => (i.replacements?.length ?? 0) > 0) ||
    ingredientAddOns.length > 0
  const title = isPrivateLabel ? 'Build Your Recipe' : 'Recipe Ingredients'

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
      {/* --- Ingredients (compact list, no per-row cards) ------------ */}
      <div className="rounded-xl border border-ink-200 bg-white p-3">
        <header className="mb-3">
          <h3 className="font-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
            {title}
          </h3>
        </header>

        <ul className="divide-y divide-ink-100 border-y border-ink-100">
          {ingredients.map((ing) => {
            const swappable = (ing.replacements?.length ?? 0) > 0
            const currentId = replacements[ing.id] ?? '__default'
            const isOpen = openRowId === ing.id

            // Compose the option list (default first, then alternates).
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
            const current = options.find((o) => o.id === currentId) ?? options[0]

            return (
              <li key={ing.id} className="py-2">
                <button
                  type="button"
                  disabled={!swappable}
                  onClick={() => setOpenRowId(isOpen ? null : ing.id)}
                  aria-haspopup={swappable ? 'listbox' : undefined}
                  aria-expanded={swappable ? isOpen : undefined}
                  className={
                    'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ' +
                    (swappable
                      ? 'cursor-pointer hover:bg-ink-50'
                      : 'cursor-default')
                  }
                >
                  <span className="min-w-0 flex-1 truncate text-ink-900">
                    {current?.name ?? ing.name}
                    {currentId !== '__default' && (
                      <span className="ml-1.5 text-[11px] font-semibold text-pink-700">
                        (swapped)
                      </span>
                    )}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2 text-[11.5px] text-ink-500 tabular-nums">
                    {ing.percent.toFixed(1)}%
                    {swappable && (
                      <ChevronDown
                        className={
                          'h-3.5 w-3.5 text-ink-500 transition-transform ' +
                          (isOpen ? 'rotate-180' : '')
                        }
                      />
                    )}
                  </span>
                </button>

                {swappable && isOpen && (
                  <ul
                    role="listbox"
                    className="mt-1.5 overflow-hidden rounded-md border border-ink-200 bg-white"
                  >
                    {options.map((opt, idx) => {
                      const isDefault = idx === 0
                      const isCurrent = opt.id === currentId
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isCurrent}
                            onClick={() => {
                              setReplacements((prev) => ({
                                ...prev,
                                [ing.id]: opt.id,
                              }))
                              setOpenRowId(null)
                            }}
                            className={
                              'flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors ' +
                              (isCurrent
                                ? 'bg-pink-50 text-pink-900'
                                : 'bg-white text-ink-800 hover:bg-ink-50')
                            }
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">
                                {opt.name}
                                {isDefault && (
                                  <span className="ml-1 text-[10.5px] font-normal text-ink-500">
                                    (default)
                                  </span>
                                )}
                              </span>
                              {isCurrent && (
                                <Check className="h-3 w-3 flex-shrink-0 text-pink-700" />
                              )}
                            </span>
                            {opt.priceDelta !== 0 && (
                              <span
                                className={
                                  'flex-shrink-0 text-[11px] font-semibold tabular-nums ' +
                                  (opt.priceDelta > 0
                                    ? 'text-ink-700'
                                    : 'text-emerald-700')
                                }
                              >
                                {opt.priceDelta > 0 ? '+' : ''}$
                                {Math.abs(opt.priceDelta).toFixed(2)}
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {(current?.allergens ?? []).length > 0 && !isOpen && (
                  <div className="mt-1 flex flex-wrap gap-1 px-2">
                    {current!.allergens!.map((a) => (
                      <Badge key={a} variant="warning">
                        {a}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* Add-ons (Private Label only) */}
        {ingredientAddOns.length > 0 && (
          <section className="mt-4">
            <header className="mb-1.5 flex items-baseline justify-between">
              <h4 className="text-[12.5px] font-semibold text-ink-900">
                Optional add-ons
              </h4>
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                {addOnIds.length} on
              </span>
            </header>
            <ul className="divide-y divide-ink-100 border-y border-ink-100">
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
                        'flex w-full items-center justify-between gap-3 px-2 py-2 text-left text-[13px] transition-colors ' +
                        (on ? 'bg-pink-50' : 'hover:bg-ink-50')
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-sm border ' +
                            (on
                              ? 'border-pink-500 bg-pink-500'
                              : 'border-ink-300 bg-white')
                          }
                        >
                          {on && <Check className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <span className="min-w-0 truncate text-ink-900">
                          {ao.name}
                          {ao.description && (
                            <span className="ml-1.5 text-[11.5px] text-ink-500">
                              · {ao.description}
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className={
                          'flex-shrink-0 text-[11.5px] font-semibold tabular-nums ' +
                          (ao.priceDelta > 0 ? 'text-ink-700' : 'text-emerald-700')
                        }
                      >
                        {ao.priceDelta > 0 ? '+' : ''}${Math.abs(ao.priceDelta).toFixed(2)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {hasChanges && (
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
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
        <div className="rounded-xl border border-ink-200 bg-white p-3">
          <header className="mb-3">
            <h3 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
              Nutrition Facts
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-ink-500">
              Updates as you customize. Final values come from the
              compliance check.
            </p>
          </header>
          <div className="overflow-hidden rounded-md">
            {/* Readable NFR width — column auto-grows to fit. */}
            <NutritionFactsRenderer data={nutrition} widthPx={240} />
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
