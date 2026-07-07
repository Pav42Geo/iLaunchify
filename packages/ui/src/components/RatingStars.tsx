'use client'

// RatingStars + RatingBreakdownPopover (docs/FEEDBACK_MODULE.md §5.3–5.4).
//
// Display rules, enforced here so no surface re-invents them:
//   • arithmetic mean, 1 decimal, ALWAYS with the count ("4.6 ★ · 23")
//   • below min-N → a quiet "New" badge, never stars
//   • the popover (Amazon-histogram style) shows per-dimension bars and an
//     optional "See Creator Reviews" anchor link
// Ranking uses the Bayesian score — which is deliberately NOT displayed.

import * as React from 'react'
import { cn } from '../lib/utils'

export interface RatingDimBar {
  label: string
  mean: number // 1–5
  n: number
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  // Fractional fill via overlaid rows (email-unsafe technique is fine in-app).
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  const row = (cls: string) => (
    <span className={cn('inline-flex leading-none', cls)} style={{ fontSize: size }} aria-hidden>
      {'★★★★★'}
    </span>
  )
  return (
    <span className="relative inline-block align-middle" aria-hidden>
      {row('text-ink-200')}
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row('text-pink-600')}
      </span>
    </span>
  )
}

export function RatingStars({
  mean,
  count,
  isNew = false,
  minLabel = 'New',
  size = 14,
  className,
  children,
}: {
  mean: number | null
  count: number
  /** True below min-N — renders the badge instead of stars. */
  isNew?: boolean
  minLabel?: string
  size?: number
  className?: string
  /** Optional popover content — rendered on hover/focus below the stars. */
  children?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  // Once opened (hover or click) the popover is PINNED — it stays until the user
  // dismisses it via the X or Escape (not on mouse-leave). See onMouseEnter below.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (isNew || mean == null) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] text-ink-500', className)}>
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">
          {minLabel}
        </span>
        {count > 0 && <span>{count} rating{count === 1 ? '' : 's'}</span>}
      </span>
    )
  }

  const summary = (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px]', className)}>
      <Stars value={mean} size={size} />
      <span className="font-semibold tabular-nums text-ink-900">{mean.toFixed(1)}</span>
      <span className="text-ink-500">· {count.toLocaleString()} rating{count === 1 ? '' : 's'}</span>
    </span>
  )

  if (!children) return summary

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${mean.toFixed(1)} out of 5, ${count} ratings — show breakdown`}
        onClick={() => setOpen((o) => !o)}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {summary}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Rating breakdown"
          className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-ink-200 bg-white p-4 shadow-lg"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] leading-none text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            ✕
          </button>
          <div className="pr-5">{children}</div>
        </div>
      )}
    </span>
  )
}

export function RatingBreakdownPopover({
  mean,
  count,
  dims,
  starBuckets,
  starHrefBase = '?',
  reviewsHref,
  reviewsLabel = 'See Creator Reviews',
  explainerHref,
}: {
  mean: number
  count: number
  dims: RatingDimBar[]
  /** Per-star review counts — renders a clickable histogram that filters the
   *  Creator reviews section via `?star=N` (kept in sync there). Omit to hide. */
  starBuckets?: { star: number; n: number }[]
  /** Base for the star links (default '?'); each row → `${base}star=N#creator-reviews`. */
  starHrefBase?: string
  /** Anchor to the reviews section (e.g. "#creator-reviews"). */
  reviewsHref?: string
  reviewsLabel?: string
  explainerHref?: string
}) {
  const starTotal = starBuckets?.reduce((a, b) => a + b.n, 0) ?? 0
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <Stars value={mean} size={16} />
        <span className="font-display text-lg font-semibold text-ink-900">
          {mean.toFixed(1)} out of 5
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-500">
        {count.toLocaleString()} verified rating{count === 1 ? '' : 's'} from creators with
        delivered orders
      </p>
      <div className="mt-3 space-y-2">
        {dims.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[12px] text-ink-700">{d.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
              <span
                className="animate-fill-bar block h-full rounded-full bg-pink-600"
                style={{ width: `${(d.mean / 5) * 100}%`, ['--fill-w' as string]: `${(d.mean / 5) * 100}%` } as React.CSSProperties}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-[12px] font-medium tabular-nums text-ink-800">
              {d.mean.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      {starBuckets && starBuckets.length > 0 && starTotal > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
            By stars — click to filter reviews
          </p>
          <div className="space-y-0.5">
            {starBuckets.map((b) => {
              const pct = Math.round((b.n / starTotal) * 100)
              return (
                <a
                  key={b.star}
                  href={`${starHrefBase}star=${b.star}#creator-reviews`}
                  className="group flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[12px] text-ink-600 hover:bg-ink-50"
                >
                  <span className="w-11 shrink-0 text-pink-700 group-hover:underline">{b.star} star</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="animate-fill-bar block h-full rounded-full bg-pink-600"
                      style={{ width: `${pct}%`, ['--fill-w' as string]: `${pct}%` } as React.CSSProperties}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right tabular-nums group-hover:text-pink-700 group-hover:underline">
                    {pct}%
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      )}
      {(reviewsHref || explainerHref) && (
        <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-[12.5px]">
          {reviewsHref && (
            <a href={reviewsHref} className="block font-medium text-pink-700 hover:underline">
              {reviewsLabel} ›
            </a>
          )}
          {explainerHref && (
            <a href={explainerHref} className="block text-ink-500 hover:underline">
              How ratings work
            </a>
          )}
        </div>
      )}
    </div>
  )
}
