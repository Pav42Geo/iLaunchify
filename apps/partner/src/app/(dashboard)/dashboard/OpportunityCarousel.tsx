'use client'

// Co-creation matches carousel (Dashboard v2, Pavel 2026-07-14,
// design/partner-dashboard-final-tokens.html). Two cards per view, ‹ › arrows
// page through however many matches exist, scroll-snap + dots. The WHOLE card
// is a link to the Opportunity Pool (Pavel: partners express interest THERE,
// with full brief context — never from the dashboard).

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { cn } from '@ilaunchify/ui'

export interface CarouselBrief {
  id: string
  title: string
  sub: string
  /** REAL loader-computed fit score (0–100). */
  fitScore: number
  interestedCount: number
}

export function OpportunityCarousel({ briefs }: { briefs: CarouselBrief[] }) {
  const track = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(briefs.length / 2))

  function move(dir: number) {
    const el = track.current
    if (!el) return
    const slide = el.querySelector<HTMLElement>('[data-slide]')
    const w = (slide?.offsetWidth ?? 260) + 10
    el.scrollBy({ left: dir * w * 2, behavior: 'smooth' })
    setPage((p) => Math.min(pages - 1, Math.max(0, p + dir)))
  }

  if (briefs.length === 0) return null

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-display text-[14px] font-bold text-ink-900">Co-creation matches</h2>
        <span className="text-[11px] font-semibold text-ink-400">
          · {briefs.length} brief{briefs.length === 1 ? '' : 's'} fit your capabilities
        </span>
        {briefs.length > 2 && (
          <span className="ml-auto flex gap-1.5">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous matches"
              className="grid h-[26px] w-[26px] place-items-center rounded-full border border-ink-200 bg-white text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="Next matches"
              className="grid h-[26px] w-[26px] place-items-center rounded-full border border-ink-200 bg-white text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <div
        ref={track}
        className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {briefs.map((b) => (
          <Link
            key={b.id}
            href="/opportunities"
            data-slide
            className="min-w-[250px] flex-[0_0_calc(50%-5px)] snap-start rounded-[14px] border border-ink-200 bg-white p-4 transition-colors hover:border-pink-500"
          >
            <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-pink-700">
              <Star className="h-[10px] w-[10px]" /> {Math.round(b.fitScore)}% fit
            </span>
            <div className="text-[14px] font-bold leading-snug text-ink-900">{b.title}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-ink-500">{b.sub}</div>
            <div className="mt-2.5 text-[11px] font-semibold text-ink-400">
              {b.interestedCount > 0
                ? `${b.interestedCount} maker${b.interestedCount === 1 ? '' : 's'} interested · `
                : ''}
              Open in the pool to express interest →
            </div>
          </Link>
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {Array.from({ length: pages }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn('h-1.5 w-1.5 rounded-full', i === page ? 'bg-pink-500' : 'bg-ink-200')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
