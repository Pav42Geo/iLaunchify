'use client'

// The rating modal experience (docs/FEEDBACK_MODULE.md §5.1–5.2): per-partner
// cards with 3–5 one-word star rows (tap-a-star, mobile-first), optional short
// comment — then the product-review step (§6). No separate "overall" question:
// overall derives from the dimensions (halo guard).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Star, Heart } from 'lucide-react'
import { submitPartnerRatings, submitProductReview } from './actions'

type Dimensions = Record<string, number>

interface CardDef {
  dispatchId: string
  partnerName: string
  role: string
  roleLabel: string
  dimensions: Array<{ slug: string; label: string; sublabel: string }>
  existing: { dimensions: Dimensions; comment: string | null; editable: boolean } | null
}

function StarRow({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  label: string
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s} star${s === 1 ? '' : 's'}`}
          disabled={disabled}
          onClick={() => onChange(value === s ? 0 : s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-not-allowed"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              s <= (hover || value) ? 'fill-pink-600 text-pink-600' : 'text-ink-200'
            }`}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}

export function RateOrderClient({
  orderId,
  cards,
  review,
}: {
  orderId: string
  cards: CardDef[]
  review: {
    productId: string
    productName: string
    existing: { rating: number; title: string; body: string; photoCount: number; editable: boolean } | null
  } | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [scores, setScores] = useState<Record<string, Dimensions>>(
    Object.fromEntries(cards.map((c) => [c.dispatchId, c.existing?.dimensions ?? {}])),
  )
  const [comments, setComments] = useState<Record<string, string>>(
    Object.fromEntries(cards.map((c) => [c.dispatchId, c.existing?.comment ?? ''])),
  )
  const [ratingsSaved, setRatingsSaved] = useState(false)

  // Review step state
  const [revRating, setRevRating] = useState(review?.existing?.rating ?? 0)
  const [revTitle, setRevTitle] = useState(review?.existing?.title ?? '')
  const [revBody, setRevBody] = useState(review?.existing?.body ?? '')
  const [photos, setPhotos] = useState<File[]>([])

  function setDim(dispatchId: string, slug: string, v: number) {
    setScores((prev) => {
      const dims = { ...prev[dispatchId] }
      if (v === 0) delete dims[slug]
      else dims[slug] = v
      return { ...prev, [dispatchId]: dims }
    })
  }

  const anyRatings = Object.values(scores).some((d) => Object.keys(d).length > 0)

  function saveRatings() {
    startTransition(async () => {
      const payload = cards
        .filter((c) => Object.keys(scores[c.dispatchId] ?? {}).length > 0 && (c.existing?.editable ?? true))
        .map((c) => ({
          dispatchId: c.dispatchId,
          dimensions: scores[c.dispatchId]!,
          comment: comments[c.dispatchId] || undefined,
        }))
      const r = await submitPartnerRatings({ orderId, ratings: payload })
      if (r.ok) {
        setRatingsSaved(true)
        toast.success('Ratings saved — thank you!')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function saveReview() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('orderId', orderId)
      fd.set('rating', String(revRating))
      fd.set('title', revTitle)
      fd.set('body', revBody)
      for (const p of photos) fd.append('photos', p)
      const r = await submitProductReview(fd)
      if (r.ok) {
        toast.success('Review published — other creators will see it on the product page')
        setPhotos([])
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  const inputCls =
    'w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'

  return (
    <div className="space-y-6">
      {/* ---- Responsibility note: ratings drive partner standing + routing ---- */}
      <aside className="flex gap-3 rounded-2xl border border-pink-200 bg-pink-50 p-4">
        <Heart className="mt-0.5 h-5 w-5 shrink-0 fill-pink-600 text-pink-600" aria-hidden="true" />
        <div>
          <h2 className="font-display text-[14.5px] font-semibold text-ink-900">
            Your honest rating matters
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">
            These scores are how partners build their reputation and earn future orders on
            iLaunchify — a real part of their growth. Please rate fairly, from your actual
            experience: it helps great partners get recognized and keeps quality high for every
            creator.
          </p>
        </div>
      </aside>

      {/* ---- Partner rating cards ---- */}
      {cards.map((c) => {
        const locked = c.existing ? !c.existing.editable : false
        return (
          <section key={c.dispatchId} className="rounded-2xl border border-ink-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[16px] font-semibold text-ink-900">{c.partnerName}</h2>
              <span className="rounded bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                {c.roleLabel}
              </span>
            </div>
            {locked && (
              <p className="mt-1 text-[12px] text-ink-500">
                Rated — the 30-day edit window has closed.
              </p>
            )}
            <div className="mt-4 space-y-3">
              {c.dimensions.map((d) => (
                <div key={d.slug} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-ink-900">{d.label}</div>
                    <div className="text-[11.5px] text-ink-500">{d.sublabel}</div>
                  </div>
                  <StarRow
                    label={`${c.partnerName} — ${d.label}`}
                    value={scores[c.dispatchId]?.[d.slug] ?? 0}
                    onChange={(v) => setDim(c.dispatchId, d.slug, v)}
                    disabled={locked || pending}
                  />
                </div>
              ))}
            </div>
            <textarea
              value={comments[c.dispatchId] ?? ''}
              onChange={(e) => setComments((p) => ({ ...p, [c.dispatchId]: e.target.value }))}
              rows={2}
              maxLength={1000}
              disabled={locked}
              placeholder="Anything this partner should hear? (optional — they see their ratings)"
              className={`${inputCls} mt-4`}
            />
          </section>
        )
      })}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending || !anyRatings}
          onClick={saveRatings}
          className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          {pending ? 'Saving…' : ratingsSaved || cards.some((c) => c.existing) ? 'Update ratings' : 'Save ratings'}
        </button>
      </div>

      {/* ---- Product review step ---- */}
      {review && (
        <section className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="font-display text-[16px] font-semibold text-ink-900">
            Review {review.productName}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-600">
            Visible to other creators on the product page, with a “Verified order” badge.
            {review.existing && !review.existing.editable && ' Your review is published; the edit window has closed.'}
          </p>
          <fieldset disabled={(review.existing && !review.existing.editable) || pending} className="mt-4 space-y-3">
            <StarRow label="Product rating" value={revRating} onChange={setRevRating} />
            <input
              value={revTitle}
              onChange={(e) => setRevTitle(e.target.value)}
              maxLength={150}
              placeholder="Title — what's most important to know?"
              className={inputCls}
            />
            <textarea
              value={revBody}
              onChange={(e) => setRevBody(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="How's the quality? Did it match your design? What should other creators know?"
              className={inputCls}
            />
            <label className="block text-[12.5px] font-medium text-ink-700">
              Photos (up to 4{review.existing?.photoCount ? ` — ${review.existing.photoCount} already uploaded` : ''})
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 4))}
                className="mt-1 block w-full text-[12.5px] text-ink-600 file:mr-3 file:rounded-full file:border file:border-ink-200 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-ink-700"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveReview}
                disabled={pending || revRating === 0 || revTitle.trim().length < 3 || revBody.trim().length < 10}
                className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                {pending ? 'Publishing…' : review.existing ? 'Update review' : 'Publish review'}
              </button>
            </div>
          </fieldset>
        </section>
      )}
    </div>
  )
}
