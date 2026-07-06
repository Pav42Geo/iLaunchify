// "Your rating" dashboard card (docs/FEEDBACK_MODULE.md §5.4) — the partner's
// mirror of what creators see: per-service overall + dimension bars + the
// latest creator comments. Transparency drives improvement; the same numbers
// power marketplace ranking (Bayesian, not shown raw) and the P3 scorecard.

import { Star } from 'lucide-react'

export interface ServiceRatingView {
  serviceLabel: string // e.g. "Manufacturing"
  mean: number | null
  count: number
  isNew: boolean
  dims: Array<{ label: string; mean: number; n: number }>
}

export interface RatingCommentView {
  comment: string
  overall: number
  roleLabel: string
  createdAt: string // ISO
}

// Aspect-attributed notes routed to this partner (docs/REVIEW_ATTRIBUTION_MODEL.md §3).
// Narrative-only (no star) — the "what to fix" that sits beside the dimensional score.
export interface AspectNoteView {
  body: string
  aspectLabel: string // e.g. "Printing"
  createdAt: string // ISO
}

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(value) ? 'fill-pink-600 text-pink-600' : 'text-ink-200'}
        />
      ))}
    </span>
  )
}

export function YourRatingCard({
  services,
  comments,
  notes = [],
  span = 12,
}: {
  services: ServiceRatingView[]
  comments: RatingCommentView[]
  notes?: AspectNoteView[]
  span?: number
}) {
  const rated = services.filter((s) => s.count > 0)

  return (
    <section
      className={`rounded-2xl border border-ink-200 bg-white p-5 lg:col-span-${span}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
          <Star className="h-4 w-4 text-ink-500" aria-hidden="true" /> Your rating
        </h2>
        <span className="text-[11.5px] text-ink-500">
          What creators see — ratings come only from delivered orders
        </span>
      </div>

      {rated.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-500">
          No ratings yet — they arrive after creators receive their orders. Deliver great work and
          this card becomes your best sales asset.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {rated.map((s) => (
            <div key={s.serviceLabel}>
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-medium uppercase tracking-wide text-ink-500">
                  {s.serviceLabel}
                </span>
                {s.isNew ? (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">
                    New · {s.count} rating{s.count === 1 ? '' : 's'}
                  </span>
                ) : (
                  <>
                    <Stars value={s.mean ?? 0} />
                    <span className="text-[14px] font-semibold tabular-nums text-ink-900">
                      {s.mean?.toFixed(1)}
                    </span>
                    <span className="text-[12px] text-ink-500">· {s.count}</span>
                  </>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {s.dims.map((d) => (
                  <div key={d.label} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-[11.5px] text-ink-600">{d.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <span
                        className="block h-full rounded-full bg-pink-600"
                        style={{ width: `${(d.mean / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-7 shrink-0 text-right text-[11.5px] font-medium tabular-nums text-ink-700">
                      {d.mean.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {comments.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
            Recent creator comments
          </h3>
          <ul className="mt-2 space-y-2.5">
            {comments.map((c, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-ink-700">
                <span className="mr-1.5 inline-flex translate-y-[1px]">
                  <Stars value={c.overall} size={11} />
                </span>
                “{c.comment}”
                <span className="ml-1.5 text-[11px] text-ink-400">
                  {c.roleLabel} ·{' '}
                  {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
            Flagged by creators
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-400">
            Specific notes creators attributed to your work on an order — the “what to fix” beside
            your score.
          </p>
          <ul className="mt-2 space-y-2.5">
            {notes.map((n, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-ink-700">
                <span className="mr-1.5 rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">
                  {n.aspectLabel}
                </span>
                “{n.body}”
                <span className="ml-1.5 text-[11px] text-ink-400">
                  {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
