'use client'

// ElementRail — Canva-style horizontal "group" rail (Pavel 2026-06-23).
//
// A labelled row with a prominent "See all" and a slide-left/right strip of
// tiles (hover chevrons). Shared so the creator Elements + Text drawers and the
// partner Packaging Studio frame palette all use the exact same navigation.
//
// Purely presentational — callers pass the tiles as children and handle the
// "See all" drill-in themselves. The strip owns its own horizontal scroll, so
// the rail never widens its container (wrap the panel in `overflow-x-clip` if
// the host scroll area is fussy).

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface ElementRailProps {
  label: string
  /** Right-aligned action label. Defaults to "See all". Hidden when no handler. */
  seeAllLabel?: string
  onSeeAll?: () => void
  /** Tile elements — each should be `shrink-0` so the strip scrolls. */
  children: React.ReactNode
  className?: string
}

export function ElementRail({
  label,
  seeAllLabel = 'See all',
  onSeeAll,
  children,
  className = '',
}: ElementRailProps) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const by = (dx: number) => scroller.current?.scrollBy({ left: dx, behavior: 'smooth' })

  return (
    <section className={`group/rail py-2 ${className}`.trim()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-ink-700">
          {label}
        </span>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[13px] font-semibold text-pink-700 transition-colors hover:bg-pink-50 hover:text-pink-600"
          >
            {seeAllLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => by(-160)}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-ink-200 bg-white p-1 opacity-0 shadow-sm transition-opacity hover:bg-ink-50 group-hover/rail:opacity-100"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-ink-700" />
        </button>
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => by(160)}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-ink-200 bg-white p-1 opacity-0 shadow-sm transition-opacity hover:bg-ink-50 group-hover/rail:opacity-100"
        >
          <ChevronRight className="h-3.5 w-3.5 text-ink-700" />
        </button>

        <div
          ref={scroller}
          className="flex w-full min-w-0 snap-x gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
      </div>
    </section>
  )
}
