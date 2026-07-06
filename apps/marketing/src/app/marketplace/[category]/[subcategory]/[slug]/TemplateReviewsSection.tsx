// Creator Reviews section (docs/FEEDBACK_MODULE.md §6.2) — Amazon-style, but
// verified-only: every review sits behind a delivered order for a product built
// from THIS template. Anchored at #creator-reviews (the stars popover's
// "See Creator Reviews" link scrolls here). Server component.

import type { TemplateReview } from '@/lib/template-reviews'

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex text-[14px] leading-none" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= value ? 'text-pink-600' : 'text-ink-200'} aria-hidden>
          ★
        </span>
      ))}
    </span>
  )
}

export function TemplateReviewsSection({ reviews }: { reviews: TemplateReview[] }) {
  if (reviews.length === 0) return null

  const mean = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
  const buckets = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    n: reviews.filter((r) => r.rating === s).length,
  }))

  return (
    <section id="creator-reviews" className="max-w-[1640px] mx-auto px-8 mb-24 scroll-mt-24">
      <h2 className="font-display text-ui-display mb-2">Creator reviews</h2>
      <p className="mb-7 max-w-2xl text-[13px] text-ink-600">
        Every review is from a creator with a delivered order of a product built from this
        template — no exceptions, no paid placement, and partners can't edit or remove them.
      </p>

      <div className="grid gap-10 lg:grid-cols-[280px,1fr]">
        {/* Histogram recap */}
        <div>
          <div className="flex items-baseline gap-2">
            <Stars value={Math.round(mean)} />
            <span className="font-display text-2xl font-semibold text-ink-900">
              {mean.toFixed(1)}
            </span>
            <span className="text-[13px] text-ink-500">out of 5</span>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-500">
            {reviews.length} verified review{reviews.length === 1 ? '' : 's'}
          </p>
          <div className="mt-4 space-y-1.5">
            {buckets.map((b) => (
              <div key={b.star} className="flex items-center gap-2 text-[12.5px] text-ink-600">
                <span className="w-10">{b.star} star</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <span
                    className="block h-full rounded-full bg-pink-600"
                    style={{ width: `${(b.n / reviews.length) * 100}%` }}
                  />
                </span>
                <span className="w-10 text-right tabular-nums">
                  {Math.round((b.n / reviews.length) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Review cards */}
        <div className="space-y-6">
          {reviews.map((r) => (
            <article key={r.id} className="border-b border-ink-100 pb-6 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                <h3 className="text-[14.5px] font-semibold text-ink-900">{r.title}</h3>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {r.authorName} ·{' '}
                <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">
                  Verified order
                </span>{' '}
                ·{' '}
                {new Date(r.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-700">
                {r.body}
              </p>
              {r.photoUrls.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.photoUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u}
                        alt={`Photo from ${r.authorName}'s review`}
                        className="h-24 w-24 rounded-lg border border-ink-200 object-cover transition-transform hover:scale-[1.03]"
                      />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
