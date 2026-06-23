'use client'

// IngredientPicker — unified search across USDA + Curated Library + this
// partner's PARTNER_PRIVATE rows. Picks an existing Ingredient.id; falls
// through to AddPrivateIngredientModal when nothing matches.
//
// Per task #138 + docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5a.
//
// Picker contract:
//   <IngredientPicker
//     onPick={(ing) => …}            // ing: IngredientResult
//     placeholder?: string
//     initialQuery?: string          // pre-seeded text (e.g., on edit)
//   />
//
// UX:
//   * Empty query opens a panel of recently-used + library staples.
//   * Each row shows source chip (USDA / Library / Private) + allergen pills.
//   * Bottom of the list always shows "+ Create new private ingredient" CTA
//     which opens AddPrivateIngredientModal. The modal closes on save and
//     calls onPick() with the freshly-created row.

import { Fragment, useEffect, useRef, useState } from 'react'
import { Input } from '@ilaunchify/ui'
import { Beaker, ListFilter, Loader2, Plus, Search, Sparkles, X } from 'lucide-react'
import { searchIngredients, type IngredientResult } from '../ingredient-actions'
import { AddPrivateIngredientModal } from './AddPrivateIngredientModal'

interface IngredientPickerProps {
  onPick: (ingredient: IngredientResult) => void
  placeholder?: string
  initialQuery?: string
  autoFocus?: boolean
}

export function IngredientPicker({
  onPick,
  placeholder = 'Search ingredients…',
  initialQuery = '',
  autoFocus = false,
}: IngredientPickerProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<IngredientResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showAddModal, setShowAddModal] = useState(false)
  // Source filter (legacy "funnel" menu). Single-select, client-side over the
  // unified search results. Mirrors the legacy platform's filter list.
  const [filter, setFilter] = useState<FilterKey>('all')
  const [filterOpen, setFilterOpen] = useState(false)

  // Debounced search.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const id = setTimeout(async () => {
      // A server action can resolve to `undefined` if it's aborted/deduped by
      // the framework (e.g. rapid re-fires), so guard before reading `.ok`.
      const res = await searchIngredients({ query, limit: 25 }).catch(() => undefined)
      if (cancelled) return
      if (res && res.ok) {
        setResults(res.data.results)
        setActiveIndex(0)
      } else {
        setResults([])
      }
      setLoading(false)
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [query, open])

  function handlePick(ingredient: IngredientResult) {
    onPick(ingredient)
    setQuery('')
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    const list = results.filter((r) => matchesFilter(r, filter))
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, list.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex < list.length) {
        const ing = list[activeIndex]
        if (ing) handlePick(ing)
      } else {
        setShowAddModal(true)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Apply the source filter client-side over the unified results.
  const shown = results.filter((r) => matchesFilter(r, filter))

  // Empty-state panel (no query) groups results under "Recently used" +
  // "Library staples" subheaders. firstStapleIdx is the boundary between the
  // recentlyUsed rows and the staples (−1 when there are no staples).
  const isEmptyState = query.trim().length === 0
  const firstStapleIdx = shown.findIndex((r) => !r.recentlyUsed)

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="pl-3 pr-20"
        />
        {/* Right-side controls: clear · search icon · filter funnel (legacy layout). */}
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          {query && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                setQuery('')
              }}
              className="text-ink-400 hover:text-ink-600"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Search className="pointer-events-none h-4 w-4 text-ink-400" />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setFilterOpen((v) => !v)
              setOpen(true)
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-ink-100 ${
              filter !== 'all' ? 'text-pink-600' : 'text-ink-500'
            }`}
            aria-label="Filter ingredients"
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            title="Filter by source"
          >
            <ListFilter className="h-4 w-4" />
          </button>
        </div>

        {/* Filter menu — single-select, mirrors the legacy funnel options. */}
        {filterOpen && (
          <div
            className="absolute right-0 top-[calc(100%+4px)] z-40 w-60 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
            role="menu"
          >
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="menuitemradio"
                aria-checked={filter === f.key}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setFilter(f.key)
                  setFilterOpen(false)
                  setActiveIndex(0)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ink-50 ${
                  filter === f.key ? 'text-pink-600' : 'text-ink-700'
                }`}
              >
                <span
                  className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                    filter === f.key ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300'
                  }`}
                >
                  {filter === f.key && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active-filter status chip + reset (legacy "Showing results for"). */}
      {filter !== 'all' && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <ListFilter className="h-3 w-3" />
            Filtered: <span className="font-semibold text-ink-700">{FILTERS.find((f) => f.key === filter)?.label}</span>
          </span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setFilter('all')
            }}
            className="font-medium text-pink-600 hover:underline"
          >
            Reset
          </button>
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-auto rounded-md border border-ink-200 bg-white shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-ink-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}

          {!loading && shown.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-ink-500">
              {isEmptyState ? (
                'Search for an ingredient by name.'
              ) : filter !== 'all' && results.length > 0 ? (
                <>No <span className="font-medium">{FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}</span> match &ldquo;{query}&rdquo;. Try resetting the filter.</>
              ) : (
                <>No matches for &ldquo;{query}&rdquo;. Create it as a private ingredient below.</>
              )}
            </div>
          )}

          {!loading &&
            shown.map((ing, idx) => (
              <Fragment key={ing.id}>
                {isEmptyState && idx === 0 && ing.recentlyUsed && (
                  <GroupHeader>Recently used</GroupHeader>
                )}
                {isEmptyState && firstStapleIdx !== -1 && idx === firstStapleIdx && (
                  <GroupHeader>Library staples</GroupHeader>
                )}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handlePick(ing)
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex w-full items-start gap-3 border-b border-ink-50 px-3 py-2 text-left text-sm last:border-0 ${
                    idx === activeIndex ? 'bg-pink-50/40' : ''
                  }`}
                >
                <Beaker className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink-900">{ing.internalName}</span>
                    <SourceChip source={ing.source} verificationStatus={ing.verificationStatus} />
                    {ing.recentlyUsed && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800">
                        <Sparkles className="h-2.5 w-2.5" /> used {ing.useCount}×
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-500">
                    {ing.labelDeclarationName !== ing.internalName && (
                      <span>
                        Label: <em className="not-italic text-ink-700">{ing.labelDeclarationName}</em>
                      </span>
                    )}
                    {ing.allergenFlags.length > 0 && (
                      <span className="text-amber-700">⚠ {ing.allergenFlags.join(', ')}</span>
                    )}
                    {ing.bioengineeredStatus === 'BIOENGINEERED' && (
                      <span className="text-emerald-700">BE</span>
                    )}
                    {ing.bioengineeredStatus === 'DERIVED_FROM_BIOENGINEERED' && (
                      <span className="text-emerald-700">BE-derived</span>
                    )}
                  </div>
                </div>
                </button>
              </Fragment>
            ))}

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              setShowAddModal(true)
            }}
            onMouseEnter={() => setActiveIndex(shown.length)}
            className={`flex w-full items-center gap-2 border-t border-ink-200 px-3 py-2 text-sm font-medium text-pink-600 hover:bg-pink-50 ${
              activeIndex === shown.length ? 'bg-pink-50/60' : ''
            }`}
          >
            <Plus className="h-4 w-4" />
            Create new private ingredient
            {query && <span className="text-xs font-normal text-ink-500">&ldquo;{query}&rdquo;</span>}
          </button>
        </div>
      )}

      {showAddModal && (
        <AddPrivateIngredientModal
          initialInternalName={query}
          onCancel={() => setShowAddModal(false)}
          onCreated={(ing) => {
            setShowAddModal(false)
            handlePick(ing)
          }}
        />
      )}
    </div>
  )
}

// Source filter — mirrors the legacy platform's funnel menu, mapped onto our
// unified ingredient model (USDA · LIBRARY · PARTNER_PRIVATE + recently-used).
// ("Non-food" from legacy is omitted until we track a food/non-food flag.)
type FilterKey = 'all' | 'usda' | 'library' | 'private' | 'used'
const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All ingredients' },
  { key: 'usda', label: 'USDA ingredients' },
  { key: 'library', label: 'Library ingredients' },
  { key: 'private', label: 'My custom ingredients' },
  { key: 'used', label: "Ingredients I've used" },
]
function matchesFilter(r: IngredientResult, filter: FilterKey): boolean {
  switch (filter) {
    case 'usda':
      return r.source === 'USDA'
    case 'library':
      return r.source === 'LIBRARY' || r.verificationStatus === 'LIBRARY_PROMOTED'
    case 'private':
      return r.source === 'PARTNER_PRIVATE'
    case 'used':
      return r.recentlyUsed
    default:
      return true
  }
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink-50/60 px-3 pt-2 pb-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">
      {children}
    </div>
  )
}

function SourceChip({
  source,
  verificationStatus,
}: {
  source: IngredientResult['source']
  verificationStatus: IngredientResult['verificationStatus']
}) {
  const isLib = source === 'LIBRARY' || verificationStatus === 'LIBRARY_PROMOTED'
  const isUsda = source === 'USDA'
  const isPriv = source === 'PARTNER_PRIVATE'
  const label = isUsda ? 'USDA' : isLib ? 'Library' : isPriv ? 'Private' : '—'
  const classes = isUsda
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : isLib
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-ink-100 text-ink-700 border-ink-200'
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${classes}`}
    >
      {label}
      {isPriv && verificationStatus === 'SELF_ATTESTED' && (
        <span className="ml-1 text-ink-500" title="Self-attested by partner">
          •SA
        </span>
      )}
    </span>
  )
}
