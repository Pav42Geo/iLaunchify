'use client'

import * as React from 'react'
import { cn } from '../lib/utils'
import { Badge } from '../primitives/badge'

/**
 * IngredientsList — displays a ProductTemplate's base recipe ingredients with
 * optional swap/add affordances.
 *
 * Each row renders an ingredient with its percentage and allergen tags. Some
 * ingredients are slot-replaceable (the template defines a slot with
 * alternates); swapping opens a small inline picker. Optional add-ons are
 * listed below the base recipe and the creator can toggle them — each shows
 * its price delta.
 *
 * Aligned with the slot-based recipe schema per
 * [[ilaunchify-ingredient-sourcing]] and the recipe-builder work.
 */

export interface IngredientReplacement {
  id: string
  name: string
  /** Optional price delta vs. the default ingredient. */
  priceDelta?: number
  allergens?: string[]
}

export interface IngredientRow {
  id: string
  /** Display name on the label (labelDeclarationName from the two-name model). */
  name: string
  /** Percentage of recipe (0-100). */
  percent: number
  /** Allergens this ingredient triggers (e.g., "Soy", "Nuts"). */
  allergens?: string[]
  /** If non-empty, the ingredient is in a swap-able slot. */
  replacements?: IngredientReplacement[]
}

export interface IngredientAddOn {
  id: string
  name: string
  description?: string
  priceDelta: number
  allergens?: string[]
}

export interface IngredientsListProps {
  /** The base recipe — admin-curated, ordered by descending percent. */
  base: IngredientRow[]
  /** Optional add-ons the creator can toggle. */
  addOns?: IngredientAddOn[]
  /** Pre-selected add-on IDs (controlled). */
  selectedAddOnIds?: string[]
  onAddOnToggle?: (id: string, next: boolean) => void
  /** Pre-selected replacements: `{ ingredientId: replacementId }`. */
  replacements?: Record<string, string>
  onReplace?: (ingredientId: string, replacementId: string | null) => void
  className?: string
}

export function IngredientsList({
  base,
  addOns = [],
  selectedAddOnIds = [],
  onAddOnToggle,
  replacements = {},
  onReplace,
  className,
}: IngredientsListProps) {
  const [openSwap, setOpenSwap] = React.useState<string | null>(null)

  return (
    <div className={cn('flex flex-col gap-7', className)}>
      <section>
        <header className="flex items-baseline justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-ink-900">Base recipe</h3>
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-500 font-semibold">
            {base.length} ingredients
          </span>
        </header>
        <ul className="border border-ink-200 rounded-lg bg-white divide-y divide-ink-100">
          {base.map((ing) => {
            const replacementId = replacements[ing.id] ?? null
            const replacement = replacementId
              ? ing.replacements?.find((r) => r.id === replacementId)
              : null
            const swappable = (ing.replacements?.length ?? 0) > 0
            const isOpen = openSwap === ing.id
            return (
              <li key={ing.id} className="p-3.5">
                <div className="flex items-start gap-3">
                  <div className="text-[13px] font-mono tabular-nums text-ink-500 w-12 pt-px">
                    {ing.percent.toFixed(1)}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-ink-900 font-medium">
                      {replacement ? replacement.name : ing.name}
                      {replacement && (
                        <span className="ml-2 text-[11px] text-pink-700 font-semibold">
                          (swapped)
                        </span>
                      )}
                    </div>
                    {(replacement?.allergens ?? ing.allergens ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(replacement?.allergens ?? ing.allergens ?? []).map((a) => (
                          <Badge key={a} variant="warning">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {swappable && (
                    <button
                      type="button"
                      onClick={() => setOpenSwap(isOpen ? null : ing.id)}
                      className="text-[12px] font-semibold text-pink-700 hover:text-pink-600 transition-colors flex-shrink-0"
                    >
                      {isOpen ? 'Cancel' : replacement ? 'Change' : 'Swap'}
                    </button>
                  )}
                </div>

                {isOpen && ing.replacements && (
                  <div className="mt-3 pl-15 pt-3 border-t border-ink-100">
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-500 font-semibold mb-2">
                      Choose a replacement
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { id: '__default', name: `${ing.name} (default)`, priceDelta: 0, allergens: ing.allergens },
                        ...ing.replacements,
                      ].map((r) => {
                        const isCurrent =
                          r.id === '__default' ? replacementId === null : replacementId === r.id
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              onReplace?.(
                                ing.id,
                                r.id === '__default' ? null : r.id,
                              )
                              setOpenSwap(null)
                            }}
                            className={cn(
                              'flex items-center justify-between text-left p-2.5 rounded-md border transition-colors',
                              isCurrent
                                ? 'border-pink-500 bg-pink-50'
                                : 'border-ink-200 bg-white hover:border-ink-400',
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[13px] text-ink-900 font-medium">{r.name}</span>
                              {(r.allergens ?? []).slice(0, 2).map((a) => (
                                <Badge key={a} variant="warning">
                                  {a}
                                </Badge>
                              ))}
                            </div>
                            {r.priceDelta !== undefined && r.priceDelta !== 0 && (
                              <span className="text-[12px] font-semibold text-ink-700 flex-shrink-0 ml-2">
                                {r.priceDelta > 0 ? '+' : ''}${r.priceDelta.toFixed(2)}/unit
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {addOns.length > 0 && (
        <section>
          <header className="flex items-baseline justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-ink-900">Optional add-ons</h3>
            <span className="text-[11px] uppercase tracking-[0.06em] text-ink-500 font-semibold">
              {selectedAddOnIds.length} selected
            </span>
          </header>
          <ul className="grid sm:grid-cols-2 gap-2.5">
            {addOns.map((ao) => {
              const isSelected = selectedAddOnIds.includes(ao.id)
              return (
                <li key={ao.id}>
                  <button
                    type="button"
                    onClick={() => onAddOnToggle?.(ao.id, !isSelected)}
                    className={cn(
                      'w-full text-left p-3.5 rounded-lg border transition-[border-color,background-color] duration-base ease-out-quart',
                      isSelected
                        ? 'border-pink-500 bg-pink-50'
                        : 'border-ink-200 bg-white hover:border-ink-400',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-ink-900 mb-1">
                          {ao.name}
                        </div>
                        {ao.description && (
                          <div className="text-[12px] text-ink-600 leading-[1.4]">
                            {ao.description}
                          </div>
                        )}
                        {(ao.allergens ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {ao.allergens!.map((a) => (
                              <Badge key={a} variant="warning">
                                {a}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-[13px] font-bold text-ink-900">
                          +${ao.priceDelta.toFixed(2)}
                        </span>
                        <span
                          className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                            isSelected
                              ? 'bg-pink-500 border-pink-500'
                              : 'border-ink-300',
                          )}
                        >
                          {isSelected && (
                            <span className="text-white text-[11px] font-bold leading-none">
                              ✓
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
