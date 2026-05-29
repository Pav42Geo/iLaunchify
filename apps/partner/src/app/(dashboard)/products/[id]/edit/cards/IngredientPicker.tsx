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

import { useEffect, useRef, useState } from 'react'
import { Input } from '@ilaunchify/ui'
import { Beaker, Loader2, Plus, Search, Sparkles, X } from 'lucide-react'
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

  // Debounced search.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const id = setTimeout(async () => {
      const res = await searchIngredients({ query, limit: 25 })
      if (cancelled) return
      if (res.ok) {
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
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex < results.length) {
        const ing = results[activeIndex]
        if (ing) handlePick(ing)
      } else {
        setShowAddModal(true)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
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
          className="pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setQuery('')
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-zinc-500">
              No matches for &ldquo;{query}&rdquo;. Create it as a private ingredient below.
            </div>
          )}

          {!loading &&
            results.map((ing, idx) => (
              <button
                key={ing.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handlePick(ing)
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`flex w-full items-start gap-3 border-b border-zinc-50 px-3 py-2 text-left text-sm last:border-0 ${
                  idx === activeIndex ? 'bg-pink-50/40' : ''
                }`}
              >
                <Beaker className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-zinc-900">{ing.internalName}</span>
                    <SourceChip source={ing.source} verificationStatus={ing.verificationStatus} />
                    {ing.recentlyUsed && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800">
                        <Sparkles className="h-2.5 w-2.5" /> used {ing.useCount}×
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                    {ing.labelDeclarationName !== ing.internalName && (
                      <span>
                        Label: <em className="not-italic text-zinc-700">{ing.labelDeclarationName}</em>
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
            ))}

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              setShowAddModal(true)
            }}
            onMouseEnter={() => setActiveIndex(results.length)}
            className={`flex w-full items-center gap-2 border-t border-zinc-200 px-3 py-2 text-sm font-medium text-pink-600 hover:bg-pink-50 ${
              activeIndex === results.length ? 'bg-pink-50/60' : ''
            }`}
          >
            <Plus className="h-4 w-4" />
            Create new private ingredient
            {query && <span className="text-xs font-normal text-zinc-500">&ldquo;{query}&rdquo;</span>}
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
      : 'bg-zinc-100 text-zinc-700 border-zinc-200'
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${classes}`}
    >
      {label}
      {isPriv && verificationStatus === 'SELF_ATTESTED' && (
        <span className="ml-1 text-zinc-500" title="Self-attested by partner">
          •SA
        </span>
      )}
    </span>
  )
}
