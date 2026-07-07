'use client'

// Creator Reviews section (docs/FEEDBACK_MODULE.md §6.2) — Amazon-style,
// verified-only. Star-histogram rows filter the list (synced with the rating
// popover via ?star=N). Paginated 10 at a time ("See more reviews"). Each review
// has a thumbs up / thumbs down helpfulness vote.

import { useEffect, useState, type CSSProperties } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import type { TemplateReview } from '@/lib/template-reviews'
import { voteReview } from './review-actions'

const PAGE = 10

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
  // Star filter lives in the URL (?star=N) so the popover's "By stars" rows and
  // this histogram stay in sync.
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = params.get('star')
  const star = raw && /^[1-5]$/.test(raw) ? Number(raw) : null

  const [visible, setVisible] = useState(PAGE)
  useEffect(() => setVisible(PAGE), [star]) // reset paging when the filter changes

  const setStar = (s: number | null) => {
    const p = new URLSearchParams(params.toString())
    if (s == null) p.delete('star')
    else p.set('star', String(s))
    const qs = p.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}#creator-reviews`, { scroll: false })
  }
  const toggle = (s: number) => setStar(star === s ? null : s)

  if (reviews.length === 0) return null

  const mean = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
  const buckets = [5, 4, 3, 2, 1].map((s) => ({ star: s, n: reviews.filter((r) => r.rating === s).length }))
  const shown = star == null ? reviews : reviews.filter((r) => r.rating === star)
  const page = shown.slice(0, visible)

  return (
    <section id="creator-reviews" className="max-w-[1640px] mx-auto px-8 mb-24 scroll-mt-24">
      <h2 className="font-display text-ui-display mb-2">Creator reviews</h2>
      <p className="mb-7 max-w-2xl text-[13px] text-ink-600">
        Every review is from a creator with a delivered order of a product built from this
        template — no exceptions, no paid placement, and partners can't edit or remove them.
      </p>

      <div className="grid gap-10 lg:grid-cols-[280px,1fr]">
        {/* Histogram recap — each row filters the list to that star. */}
        <div>
          <div className="flex items-baseline gap-2">
            <Stars value={Math.round(mean)} />
            <span className="font-display text-2xl font-semibold text-ink-900">{mean.toFixed(1)}</span>
            <span className="text-[13px] text-ink-500">out of 5</span>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-500">
            {reviews.length} verified review{reviews.length === 1 ? '' : 's'}
          </p>
          <div className="mt-4 space-y-1">
            {buckets.map((b) => {
              const active = star === b.star
              const pct = Math.round((b.n / reviews.length) * 100)
              return (
                <button
                  key={b.star}
                  type="button"
                  onClick={() => toggle(b.star)}
                  aria-pressed={active}
                  disabled={b.n === 0}
                  className={
                    'group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px] transition-colors ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ' +
                    (b.n === 0
                      ? 'cursor-default text-ink-300'
                      : active
                        ? 'bg-pink-50 text-ink-900 ring-1 ring-pink-200'
                        : 'cursor-pointer text-ink-600 hover:bg-ink-50')
                  }
                >
                  <span className={'w-12 shrink-0 text-pink-700 group-hover:underline ' + (active ? 'font-semibold' : '')}>
                    {b.star} star
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="animate-fill-bar block h-full rounded-full bg-pink-600"
                      style={{ width: `${pct}%`, ['--fill-w' as string]: `${pct}%` } as CSSProperties}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums group-hover:text-pink-700 group-hover:underline">
                    {pct}%
                  </span>
                </button>
              )
            })}
          </div>
          {star != null && (
            <button type="button" onClick={() => setStar(null)} className="mt-3 text-[12px] font-medium text-pink-700 hover:underline">
              Clear filter
            </button>
          )}
        </div>

        {/* Review cards — filtered + paginated. */}
        <div>
          {star != null && (
            <p className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-600">
              <span className="font-semibold text-ink-900">{star} star</span>
              <span className="text-ink-400">·</span>
              <span>{shown.length} of {reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
              <button type="button" onClick={() => setStar(null)} className="text-pink-700 hover:underline">Clear filter</button>
            </p>
          )}

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50/40 px-4 py-8 text-center text-[13px] text-ink-500">
              No {star}-star reviews yet.
            </p>
          ) : (
            <>
              <div className="space-y-6">
                {page.map((r) => (
                  <ReviewCard key={r.id} r={r} />
                ))}
              </div>
              {visible < shown.length && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE)}
                    className="rounded-full border border-ink-300 bg-white px-5 py-2 text-[13px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    See more reviews ({shown.length - visible} more)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function ReviewCard({ r }: { r: TemplateReview }) {
  const [helpful, setHelpful] = useState(r.helpfulCount)
  const [vote, setVote] = useState<null | 'up' | 'down'>(null)
  const [pending, setPending] = useState(false)

  const cast = (dir: 'up' | 'down') => {
    if (pending || vote) return // one vote per session
    setPending(true)
    setVote(dir)
    if (dir === 'up') setHelpful((n) => n + 1)
    void voteReview(r.id, dir).finally(() => setPending(false))
  }

  const voteBtn = (dir: 'up' | 'down') => {
    const Icon = dir === 'up' ? ThumbsUp : ThumbsDown
    const selected = vote === dir
    return (
      <button
        type="button"
        onClick={() => cast(dir)}
        disabled={!!vote || pending}
        aria-pressed={selected}
        aria-label={dir === 'up' ? 'Helpful' : 'Not helpful'}
        className={
          'inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-default ' +
          (selected
            ? dir === 'up'
              ? 'border-pink-300 bg-pink-50 text-pink-700'
              : 'border-ink-300 bg-ink-100 text-ink-700'
            : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-800 disabled:opacity-50')
        }
      >
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <article className="border-b border-ink-100 pb-6 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={r.rating} />
        <h3 className="text-[14.5px] font-semibold text-ink-900">{r.title}</h3>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-500">
        {r.authorName} ·{' '}
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-600">Verified order</span> ·{' '}
        {new Date(r.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </p>
      <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-700">{r.body}</p>
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
      <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-500">
        {helpful > 0 && (
          <span>
            {helpful.toLocaleString()} {helpful === 1 ? 'person' : 'people'} found this helpful
          </span>
        )}
        <span className="flex items-center gap-1.5">
          {voteBtn('up')}
          {voteBtn('down')}
        </span>
      </div>
    </article>
  )
}
