'use client'

// =============================================================================
// SubcategoryPickerDialog — multi-select drawer for the Niche × Subcategory
// junction. Groups all Subcategories under their parent Category and pre-checks
// any currently in the niche.
// =============================================================================

import { useId, useMemo, useState, useTransition } from 'react'
import { Plus, Search, X, Check } from 'lucide-react'
import { addSubcategoriesToNiche } from '../../actions'

interface CategoryGroup {
  id: string
  name: string
  mainCategory: string
  subcategories: { id: string; name: string; slug: string }[]
}

export function SubcategoryPickerDialog({
  nicheId,
  nicheName,
  categories,
  currentSubcategoryIds,
}: {
  nicheId: string
  nicheName: string
  categories: CategoryGroup[]
  currentSubcategoryIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentSubcategoryIds),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories
      .map((g) => ({
        ...g,
        subcategories: g.subcategories.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.slug.toLowerCase().includes(q) ||
            g.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.subcategories.length > 0)
  }, [categories, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    setError(null)
    // Only send IDs that are newly added (not already in the niche).
    const newlyAdded = Array.from(selected).filter(
      (id) => !currentSubcategoryIds.includes(id),
    )
    if (newlyAdded.length === 0) {
      setError('No new subcategories selected.')
      return
    }
    startTransition(async () => {
      const res = await addSubcategoriesToNiche(nicheId, newlyAdded)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
    })
  }

  const newCount = Array.from(selected).filter(
    (id) => !currentSubcategoryIds.includes(id),
  ).length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        <Plus className="h-3.5 w-3.5" />
        Add subcategories…
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/30 px-4 py-10 sm:py-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div>
                <h2 id={titleId} className="font-display text-[16px] font-semibold text-ink-900">
                  Add subcategories to {nicheName}
                </h2>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  Currently-surfaced subcategories are pre-checked. Save commits new additions only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="border-b border-ink-100 px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subcategories…"
                  className="block w-full rounded-full border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-[12.5px] italic text-ink-500">
                  No subcategories match "{search}".
                </p>
              ) : (
                <div className="space-y-4">
                  {filtered.map((g) => (
                    <div key={g.id}>
                      <div className="mb-1.5 flex items-baseline gap-2">
                        <p className="font-display text-[13px] font-semibold text-ink-900">
                          {g.name}
                        </p>
                        <span className="text-[12px] uppercase tracking-[0.1em] text-ink-700">
                          {g.mainCategory}
                        </span>
                      </div>
                      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {g.subcategories.map((s) => {
                          const checked = selected.has(s.id)
                          const wasOriginallyIn = currentSubcategoryIds.includes(s.id)
                          return (
                            <li key={s.id}>
                              <label
                                className={`flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-2 text-[12.5px] transition-colors ${
                                  checked
                                    ? 'border-pink-300 bg-pink-50/60'
                                    : 'border-ink-100 bg-white hover:bg-ink-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(s.id)}
                                  className="mt-[3px] h-3.5 w-3.5 accent-pink-500"
                                />
                                <span className="flex-1">
                                  <span className="block font-medium leading-tight text-ink-900">
                                    {s.name}
                                  </span>
                                  <span className="block text-[10.5px] text-ink-500">
                                    {s.slug}
                                  </span>
                                </span>
                                {wasOriginallyIn && (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-success-700">
                                    <Check className="h-2.5 w-2.5" /> In
                                  </span>
                                )}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="px-5 pb-2">
                <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] text-danger-900">
                  {error}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3">
              <p className="text-[11.5px] text-ink-500 tabular-nums">
                {newCount} new · {selected.size} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending || newCount === 0}
                  className="inline-flex h-8 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
                >
                  {pending ? 'Adding…' : `Add ${newCount} subcategor${newCount === 1 ? 'y' : 'ies'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
