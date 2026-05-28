'use client'

import * as React from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * MarketplaceControlsBar — result-count + sort dropdown bar at the top of
 * the marketplace grid. Sits between the hero and the active-filter chips.
 *
 * URL-driven (DS-40.B): sort key reads from `?sort=` and writes back via
 * router.push so the server page can pick it up and pass to Prisma. Keeps
 * the URL shareable / back-button friendly.
 */

export type SortKey =
  | 'popular'
  | 'lead-time'
  | 'moq-low'
  | 'price-low'
  | 'newest'

const SORT_LABEL: Record<SortKey, string> = {
  popular: 'Most popular',
  'lead-time': 'Fastest to ship',
  'moq-low': 'Lowest min units',
  'price-low': 'Lowest cost',
  newest: 'Newest first',
}

const SORT_OPTIONS: SortKey[] = [
  'popular',
  'lead-time',
  'moq-low',
  'price-low',
  'newest',
]

function isSortKey(v: string | null): v is SortKey {
  return v !== null && (SORT_OPTIONS as string[]).includes(v)
}

export interface MarketplaceControlsBarProps {
  /** Total result count after current filters. */
  resultCount: number
  /** Total available templates (denominator for "of 200" display). */
  totalCount: number
  /** Optional callback when "Open filters" is clicked on mobile. */
  onOpenFilters?: () => void
}

export function MarketplaceControlsBar({
  resultCount,
  totalCount,
  onOpenFilters,
}: MarketplaceControlsBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlSort = searchParams.get('sort')
  const sort: SortKey = isSortKey(urlSort) ? urlSort : 'popular'

  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function handleSelect(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'popular') {
      // Default — keep URL clean.
      params.delete('sort')
    } else {
      params.set('sort', key)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    setOpen(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-5 border-b border-ink-200">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenFilters}
          className="md:hidden inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-900 bg-ink-100 hover:bg-ink-200 transition-colors px-3 h-9 rounded-pill"
        >
          <SlidersHorizontal strokeWidth={2} className="w-3.5 h-3.5" />
          Filters
        </button>
        <div className="text-[13px] text-ink-500 tabular-nums">
          Showing{' '}
          <strong className="text-ink-900 font-bold">
            {resultCount.toLocaleString()}
          </strong>{' '}
          of {totalCount.toLocaleString()} templates
        </div>
      </div>

      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-900 bg-white border border-ink-300 hover:border-ink-500 transition-colors px-3.5 h-9 rounded-pill"
        >
          <span className="text-ink-500 font-normal">Sort:</span>
          {SORT_LABEL[sort]}
          <ChevronDown
            strokeWidth={2}
            className={
              'w-3.5 h-3.5 text-ink-500 transition-transform duration-base ease-out-quart ' +
              (open ? 'rotate-180' : '')
            }
          />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 w-56 bg-white border border-ink-200 rounded-xl shadow-xl py-1.5 z-30"
          >
            {SORT_OPTIONS.map((key) => {
              const isActive = key === sort
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(key)}
                  className={
                    'w-full text-left px-3.5 py-2 text-[13px] transition-colors ' +
                    (isActive
                      ? 'bg-pink-50 text-pink-700 font-semibold'
                      : 'text-ink-700 hover:bg-ink-50')
                  }
                >
                  {SORT_LABEL[key]}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
