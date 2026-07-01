'use client'

// RecipeNutritionStudio — the 3-column "recipe studio" layout for the
// marketplace product-detail "Recipe & nutrition" tab.
//
// This is a LAYOUT component: it owns the SAME single live-recompute state
// CustomizeRail does (per-ingredient swaps + optional add-on toggles → a
// server-recomputed Nutrition Facts panel + live FALCPA "Contains" set + a
// running price delta) and arranges it as three columns:
//
//   LEFT RAIL   — "Recipe": base ingredients as swappable rows, then an
//                 "Optional ingredients" group (add-ons + price deltas).
//   MIDDLE      — "Label preview": the live regulated Facts panel rendered
//                 large, with a "Preview full label" action (opens a modal).
//   RIGHT RAIL  — a stack of cards: Recipe summary · Ingredients (live
//                 statement) · Allergens (live "Contains") · Net weight.
//
// One state drives all three columns, so a swap/add-on updates the middle
// label AND the right-rail ingredients/allergens/summary in real time. The
// recompute logic is identical to CustomizeRail (lifted, not changed):
// recomputeMarketplacePanel + composeContainsAllergens, debounced 300ms.
//
// CustomizeRail is left intact; this component is the Recipe-tab studio shell.

import * as React from 'react'
import { ChevronDown, Check, X } from 'lucide-react'
import {
  NutritionFactsRenderer,
  Badge,
  type IngredientRow,
  type IngredientAddOn,
} from '@ilaunchify/ui'
import type { PanelData } from '@ilaunchify/types'
import { composeContainsAllergens } from '@ilaunchify/nutrition'
import { recomputeMarketplacePanel } from '@/lib/recipe-recompute-actions'

/** A flavor's recipe view for the per-flavor tabs (Slice 4). */
export interface FlavorView {
  id: string
  name: string
  swatchHex?: string | null
  ingredients: IngredientRow[]
  addOns?: IngredientAddOn[]
  nutrition?: PanelData | null
  /** Manufacturer-declared flavor — show the typed statement + a declared note
   *  instead of the computed swap UI. */
  declared?: boolean
  declaredIngredientStatement?: string
}

export interface RecipeNutritionStudioProps {
  /** Template slug — used to recompute the Nutrition panel server-side on swap. */
  slug?: string
  ingredients: IngredientRow[]
  ingredientAddOns?: IngredientAddOn[]
  nutrition?: PanelData
  /** Static net-content / unit-weight line (variant netContent / packing spec). */
  netWeight?: string
  /** Static servings-per-container line, when known. */
  servings?: string
  /** Intro copy shown above the studio. */
  about?: string
  /** Per-flavor recipe tabs. When present (multi-flavor product), a tab bar lets
   *  buyers switch flavors; the recipe + Nutrition Facts swap to that flavor and
   *  live recompute routes to its FlavorPreset. Empty/absent = single-recipe. */
  flavors?: FlavorView[]
}

export function RecipeNutritionStudio({
  slug,
  ingredients: baseIngredients,
  ingredientAddOns: baseAddOns = [],
  nutrition: baseNutrition,
  netWeight,
  servings,
  about,
  flavors,
}: RecipeNutritionStudioProps) {
  // Per-flavor tabs (Slice 4). null = the shared base recipe (current behavior).
  const [activeFlavorId, setActiveFlavorId] = React.useState<string | null>(null)
  const activeFlavor = flavors?.find((f) => f.id === activeFlavorId) ?? null
  // The working recipe/panel/add-ons follow the active flavor (or the base).
  const ingredients = activeFlavor?.ingredients ?? baseIngredients
  const ingredientAddOns = activeFlavor?.addOns ?? baseAddOns
  const nutrition = activeFlavor?.nutrition ?? baseNutrition
  // ---- live state (lifted verbatim from CustomizeRail) ----------------------
  // Per-ingredient swap state. Key = base ingredient id, value = picked option
  // id ('__default' means on the default).
  const [replacements, setReplacements] = React.useState<Record<string, string>>({})
  // Optional add-on selection.
  const [addOnIds, setAddOnIds] = React.useState<string[]>([])
  // Which row's picker is open (only one at a time).
  const [openRowId, setOpenRowId] = React.useState<string | null>(null)
  // Live Nutrition panel recomputed server-side for the current swaps. null =
  // show the base `nutrition` prop (no swaps yet, or recompute unavailable).
  const [livePanel, setLivePanel] = React.useState<PanelData | null>(null)
  const [recomputing, setRecomputing] = React.useState(false)
  // "Preview full label" modal.
  const [previewOpen, setPreviewOpen] = React.useState(false)

  const isPrivateLabel =
    ingredients.some((i) => (i.replacements?.length ?? 0) > 0) ||
    ingredientAddOns.length > 0

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
      if (ao?.priceDelta) sum += ao.priceDelta
    }
    return sum
  }, [addOnIds, ingredientAddOns])

  const totalDelta = replacementDelta + addOnDelta

  // Live allergen "Contains" set — recomputed from the CURRENT composition via
  // the shared, unit-tested composeContainsAllergens.
  const baseAllergens = React.useMemo(
    () => new Set(composeContainsAllergens(ingredients, ingredientAddOns, {})),
    [ingredients, ingredientAddOns],
  )
  const liveAllergens = React.useMemo(
    () => composeContainsAllergens(ingredients, ingredientAddOns, { replacements, addOnIds }),
    [ingredients, ingredientAddOns, replacements, addOnIds],
  )

  const addedAllergens = liveAllergens.filter((a) => !baseAllergens.has(a))
  const removedAllergens = [...baseAllergens]
    .filter((a) => !liveAllergens.includes(a))
    .sort((a, b) => a.localeCompare(b))
  const allergensChanged = addedAllergens.length > 0 || removedAllergens.length > 0

  // Live Nutrition Facts recompute. Any composition change — a slot swap OR an
  // optional add-on toggle — recomputes the panel server-side.
  const activeSwaps = React.useMemo(
    () => Object.entries(replacements).filter(([, v]) => v && v !== '__default'),
    [replacements],
  )
  const sortedAddOnIds = React.useMemo(() => [...addOnIds].sort(), [addOnIds])
  const hasCustomization = activeSwaps.length > 0 || sortedAddOnIds.length > 0
  // Stable key so the effect only fires when the actual selection changes.
  const selectionKey =
    activeSwaps
      .map(([k, v]) => `${k}:${v}`)
      .sort()
      .join('|') + '#' + sortedAddOnIds.join(',')

  React.useEffect(() => {
    if (!slug) return
    if (!hasCustomization) {
      setLivePanel(null)
      setRecomputing(false)
      return
    }
    let cancelled = false
    setRecomputing(true)
    const picks = Object.fromEntries(activeSwaps)
    const t = setTimeout(() => {
      recomputeMarketplacePanel(slug, { replacements: picks, addOnIds: sortedAddOnIds, flavorPresetId: activeFlavorId ?? undefined })
        .then((panel) => {
          if (!cancelled) setLivePanel(panel)
        })
        .catch(() => {
          if (!cancelled) setLivePanel(null)
        })
        .finally(() => {
          if (!cancelled) setRecomputing(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // selectionKey captures swaps + add-ons; slug is stable per page; activeFlavorId
    // re-routes the recompute to the selected flavor's recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, slug, activeFlavorId])

  // Switch flavor tab — reset the customization so the panel shows that flavor's
  // base recipe; the buyer can then swap/toggle within it.
  function selectFlavor(id: string | null) {
    setActiveFlavorId(id)
    setReplacements({})
    setAddOnIds([])
    setOpenRowId(null)
    setLivePanel(null)
  }

  const shownPanel = livePanel ?? nutrition

  // Live ingredient statement (label-declaration order = current composition).
  // A swapped slot shows its replacement name; ticked add-ons append at the end.
  const ingredientStatement = React.useMemo(() => {
    const parts: string[] = []
    for (const ing of ingredients) {
      const pickId = replacements[ing.id] ?? '__default'
      if (pickId === '__default') {
        parts.push(ing.name)
      } else {
        const rep = ing.replacements?.find((r) => r.id === pickId)
        parts.push(rep?.name ?? ing.name)
      }
    }
    for (const id of addOnIds) {
      const ao = ingredientAddOns.find((a) => a.id === id)
      if (ao) parts.push(ao.name)
    }
    return parts
  }, [ingredients, ingredientAddOns, replacements, addOnIds])

  const swapCount = activeSwaps.length
  const baseCount = ingredients.length
  const addOnCount = addOnIds.length
  const statementChanged = swapCount > 0 || addOnCount > 0

  const cardCx =
    'rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-3'
  const cardLabelCx =
    'text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700'

  return (
    <div className="space-y-6">
      {about && (
        <div>
          <h3 className="mb-2 font-display text-ui-title">About this recipe</h3>
          <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
            {about}
          </p>
        </div>
      )}

      {/* 3-column studio. left flexible · middle label · right rail.
          Stacks to one column under lg in source order:
          Recipe → Label preview → summary/ingredients/allergens/net weight. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(300px,380px)_minmax(300px,360px)] lg:items-start">
        {/* ===== LEFT RAIL — Recipe ====================================== */}
        <div className={cardCx}>
          {/* Per-flavor tabs (Slice 4) — each flavor carries its own recipe + Facts. */}
          {flavors && flavors.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Flavor recipe">
              <button
                type="button"
                role="tab"
                aria-selected={activeFlavorId === null}
                onClick={() => selectFlavor(null)}
                className={
                  'rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ' +
                  (activeFlavorId === null ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-300 bg-white text-ink-700 hover:border-ink-500')
                }
              >
                Base
              </button>
              {flavors.map((f) => {
                const on = activeFlavorId === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => selectFlavor(f.id)}
                    className={
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ' +
                      (on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-300 bg-white text-ink-700 hover:border-ink-500')
                    }
                  >
                    {f.swatchHex && <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ backgroundColor: f.swatchHex }} />}
                    {f.name}
                  </button>
                )
              })}
            </div>
          )}
          <header className="mb-3">
            <h3 className="font-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
              {activeFlavor ? `${activeFlavor.name} recipe` : isPrivateLabel ? 'Build Your Recipe' : 'Recipe'}
            </h3>
          </header>

          <ul className="divide-y divide-ink-100 border-y border-ink-100">
            {ingredients.map((ing) => {
              const swappable = (ing.replacements?.length ?? 0) > 0
              const currentId = replacements[ing.id] ?? '__default'
              const isOpen = openRowId === ing.id

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
                      'group flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ' +
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
                        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-pink-700 transition-colors group-hover:text-pink-600">
                          Swap
                          <ChevronDown
                            className={
                              'h-3.5 w-3.5 transition-transform ' +
                              (isOpen ? 'rotate-180' : '')
                            }
                          />
                        </span>
                      )}
                    </span>
                  </button>

                  {swappable && isOpen && (
                    <ul
                      role="listbox"
                      className="mt-1.5 overflow-hidden rounded-md border border-[var(--card-border)] bg-[var(--bg-surface)]"
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
                                  : 'bg-[var(--bg-surface)] text-ink-800 hover:bg-ink-50')
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
                                      : 'text-success-700')
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

          {/* Optional ingredients group — beneath the base recipe. */}
          {ingredientAddOns.length > 0 && (
            <section className="mt-4">
              <header className="mb-1.5 flex items-baseline justify-between">
                <h4 className="text-[12.5px] font-semibold text-ink-900">
                  Optional ingredients
                </h4>
                <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
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
                                : 'border-ink-300 bg-[var(--bg-surface)]')
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
                        {ao.priceDelta !== undefined && (
                          <span
                            className={
                              'flex-shrink-0 text-[11.5px] font-semibold tabular-nums ' +
                              (ao.priceDelta > 0 ? 'text-ink-700' : 'text-success-700')
                            }
                          >
                            {ao.priceDelta > 0 ? '+' : ''}${Math.abs(ao.priceDelta).toFixed(2)}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>

        {/* ===== MIDDLE — Label preview (focal point) ==================== */}
        <div className={cardCx}>
          <header className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink-900">
                Label preview
              </h3>
              <p className="mt-1 text-[12px] leading-snug text-ink-500">
                {recomputing
                  ? 'Recalculating for your selections…'
                  : livePanel
                    ? 'Updated for your selections. Final values come from the compliance check.'
                    : 'Computed from the recipe. Final values come from the compliance check.'}
              </p>
            </div>
            {livePanel && !recomputing && <Badge variant="pink">Updated</Badge>}
          </header>

          {shownPanel ? (
            <>
              <div
                className={
                  'flex justify-center overflow-hidden rounded-md transition-opacity ' +
                  (recomputing ? 'opacity-50' : 'opacity-100')
                }
              >
                <NutritionFactsRenderer data={shownPanel} widthPx={320} />
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="mt-3 w-full rounded-md border border-[var(--card-border)] bg-[var(--bg-surface)] px-3 py-2 text-[12.5px] font-semibold text-ink-800 transition-colors hover:border-[var(--card-border-hover)] hover:text-pink-700"
              >
                Preview full label
              </button>
            </>
          ) : (
            <p className="text-[12px] text-ink-500">
              No regulated panel for this product.
            </p>
          )}
        </div>

        {/* ===== RIGHT RAIL — summary · ingredients · allergens · net ==== */}
        <div className="space-y-4">
          {/* 1 — Recipe summary (counts + economics) */}
          <div className={cardCx}>
            <div className={cardLabelCx + ' mb-2.5'}>Recipe summary</div>
            <dl className="space-y-2 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-500">Base ingredients</dt>
                <dd className="font-semibold tabular-nums text-ink-900">{baseCount}</dd>
              </div>
              {ingredients.some((i) => (i.replacements?.length ?? 0) > 0) && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-500">Swaps applied</dt>
                  <dd className="font-semibold tabular-nums text-ink-900">{swapCount}</dd>
                </div>
              )}
              {ingredientAddOns.length > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-500">Optional selected</dt>
                  <dd className="font-semibold tabular-nums text-ink-900">{addOnCount}</dd>
                </div>
              )}
              {servings && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-500">Servings / unit</dt>
                  <dd className="font-semibold tabular-nums text-ink-900">{servings}</dd>
                </div>
              )}
              {(isPrivateLabel || totalDelta !== 0) && (
                <div className="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-2.5">
                  <dt className="font-semibold text-ink-700">Recipe delta vs. base</dt>
                  <dd
                    className={
                      'font-bold tabular-nums ' +
                      (totalDelta > 0
                        ? 'text-pink-700'
                        : totalDelta < 0
                          ? 'text-success-700'
                          : 'text-ink-500')
                    }
                  >
                    {totalDelta > 0 ? '+' : ''}${Math.abs(totalDelta).toFixed(2)} / unit
                  </dd>
                </div>
              )}
            </dl>

            {statementChanged && (
              <button
                type="button"
                onClick={() => {
                  setReplacements({})
                  setAddOnIds([])
                }}
                className="mt-3 text-[12px] font-semibold text-pink-700 transition-colors hover:text-pink-600"
              >
                Reset to base recipe
              </button>
            )}
          </div>

          {/* 2 — Ingredients (live label-declaration statement). A DECLARED flavor
              shows the manufacturer's typed statement verbatim (no swap UI). */}
          {activeFlavor?.declared ? (
            (activeFlavor.declaredIngredientStatement ?? '').trim().length > 0 && (
              <div className={cardCx}>
                <header className="mb-2 flex items-center justify-between gap-2">
                  <div className={cardLabelCx}>Ingredients</div>
                </header>
                <p className="text-[12.5px] leading-relaxed text-ink-700">
                  {activeFlavor.declaredIngredientStatement!.trim().replace(/\.*$/, '')}.
                </p>
                <p className="mt-2 text-[11px] leading-snug text-ink-400">
                  Declared by the manufacturer for {activeFlavor.name}.
                </p>
              </div>
            )
          ) : ingredientStatement.length > 0 && (
            <div className={cardCx}>
              <header className="mb-2 flex items-center justify-between gap-2">
                <div className={cardLabelCx}>Ingredients</div>
                {statementChanged && <Badge variant="pink">Updated</Badge>}
              </header>
              <p className="text-[12.5px] leading-relaxed text-ink-700">
                {ingredientStatement.join(', ')}.
              </p>
              <p className="mt-2 text-[11px] leading-snug text-ink-400">
                Listed in label-declaration order. Final statement is confirmed at
                the compliance check.
              </p>
            </div>
          )}

          {/* 3 — Allergens (live "Contains") */}
          {(isPrivateLabel || liveAllergens.length > 0) && (
            <div className={cardCx}>
              <header className="mb-2 flex items-center justify-between gap-2">
                <div className={cardLabelCx}>Contains</div>
                {allergensChanged && <Badge variant="warning">Updated</Badge>}
              </header>

              {liveAllergens.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {liveAllergens.map((a) => {
                    const isNew = addedAllergens.includes(a)
                    return (
                      <span
                        key={a}
                        className={
                          'rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                          (isNew
                            ? 'border-pink-400 bg-[var(--bg-surface)] font-semibold text-pink-700'
                            : 'border-[var(--card-border)] bg-ink-50 text-ink-700')
                        }
                      >
                        {a}
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-ink-500">
                  No Big-9 allergens in the current selection.
                </p>
              )}

              {removedAllergens.length > 0 && (
                <p className="mt-2 text-[11px] leading-snug text-ink-500">
                  Removed by your swaps: {removedAllergens.join(', ')}.
                </p>
              )}

              <p className="mt-2 text-[11px] leading-snug text-ink-400">
                Live allergen preview (FALCPA Big-9). The final &ldquo;Contains&rdquo;
                statement is confirmed at the compliance check.
              </p>
            </div>
          )}

          {/* 4 — Net weight (static) */}
          {(netWeight || servings) && (
            <div className={cardCx}>
              <div className={cardLabelCx + ' mb-2.5'}>Net weight</div>
              <dl className="space-y-2 text-[13px]">
                {netWeight && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-500">Net content</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">{netWeight}</dd>
                  </div>
                )}
                {servings && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-500">Servings</dt>
                    <dd className="font-semibold tabular-nums text-ink-900">{servings}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* ===== Preview-full-label modal ================================== */}
      {previewOpen && shownPanel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full label preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative max-h-[90vh] overflow-auto rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close preview"
              className="absolute right-3 top-3 rounded-md p-1 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 pr-8 font-display text-[18px] font-semibold text-ink-900">
              Full label preview
            </div>
            <NutritionFactsRenderer data={shownPanel} widthPx={420} />
          </div>
        </div>
      )}
    </div>
  )
}
