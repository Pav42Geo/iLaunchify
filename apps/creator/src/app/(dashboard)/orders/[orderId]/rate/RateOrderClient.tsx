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

interface AspectDef {
  aspect: string
  label: string
  prompt: string
  partnerName: string | null
  existingBody: string
}

interface Attribution {
  reanchorEnabled: boolean
  aspects: AspectDef[]
}

export function RateOrderClient({
  orderId,
  cards,
  review,
  attribution,
}: {
  orderId: string
  cards: CardDef[]
  attribution?: Attribution | null
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

  // Aspect attribution (docs/REVIEW_ATTRIBUTION_MODEL.md §3.2). Progressive: chips
  // stay hidden on a happy review and open on a low score or an explicit tap.
  const aspectDefs = attribution?.aspects ?? []
  const hasAspects = aspectDefs.length > 0
  const [aspectsRequested, setAspectsRequested] = useState(false)
  const [aspectNotes, setAspectNotes] = useState<Record<string, string>>(
    Object.fromEntries(aspectDefs.map((a) => [a.aspect, a.existingBody])),
  )
  const [outcome, setOutcome] = useState<'' | 'PRODUCT' | 'MIX' | 'PARTNER'>('')
  const [reanchorRating, setReanchorRating] = useState(0)

  const isLow = revRating > 0 && revRating <= 3
  const aspectsOpen = hasAspects && (aspectsRequested || isLow)
  const taggedAspects = aspectDefs.filter((a) => (aspectNotes[a.aspect] ?? '').trim().length > 0)
  const forkVisible = Boolean(attribution?.reanchorEnabled) && isLow && taggedAspects.length > 0

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
    if (forkVisible && outcome === '') {
      toast.error('Was it the product, or how a partner handled it? Pick one below.')
      return
    }
    if (forkVisible && outcome === 'PARTNER' && reanchorRating < revRating) {
      toast.error('Give the product-only rating — it can only be the same or higher.')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('orderId', orderId)
      fd.set('rating', String(revRating))
      fd.set('title', revTitle)
      fd.set('body', revBody)
      for (const p of photos) fd.append('photos', p)
      // Aspect attribution: only tagged (non-empty) partner notes travel.
      const notes = taggedAspects.map((a) => ({ aspect: a.aspect, body: (aspectNotes[a.aspect] ?? '').trim() }))
      if (notes.length > 0) fd.set('aspects', JSON.stringify(notes))
      if (forkVisible) {
        fd.set('attributionOutcome', outcome)
        if (outcome === 'PARTNER') fd.set('newProductRating', String(reanchorRating))
      }
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

            {/* ---- Aspect attribution (§3.2): route a partner gripe off the product ---- */}
            {hasAspects && (
              <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-3.5">
                {!aspectsOpen ? (
                  <button
                    type="button"
                    onClick={() => setAspectsRequested(true)}
                    className="text-[12.5px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 rounded"
                  >
                    Something about a partner’s work? Tell the right partner →
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[12.5px] leading-relaxed text-ink-600">
                      If part of this was a partner’s doing — printing, packaging, delivery — tell
                      them directly. It routes to the responsible partner and won’t change your
                      product’s stars.
                    </p>
                    {aspectDefs.map((a) => (
                      <div key={a.aspect}>
                        <label className="text-[12.5px] font-medium text-ink-800">
                          {a.label}
                          {a.partnerName ? <span className="text-ink-500"> · {a.partnerName}</span> : null}
                        </label>
                        <textarea
                          value={aspectNotes[a.aspect] ?? ''}
                          onChange={(e) => setAspectNotes((p) => ({ ...p, [a.aspect]: e.target.value }))}
                          rows={2}
                          maxLength={300}
                          placeholder={a.prompt}
                          className={`${inputCls} mt-1`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {forkVisible && (
                  <div className="mt-3 space-y-2 rounded-xl border border-pink-200 bg-pink-50 p-3.5">
                    <p className="text-[12.5px] font-semibold text-ink-900">
                      Was the disappointment about the product, or how a partner handled it?
                    </p>
                    {([
                      ['PRODUCT', 'Mostly the product'],
                      ['MIX', 'A mix of both'],
                      ['PARTNER', 'The partner — the product was fine'],
                    ] as const).map(([val, label]) => (
                      <label key={val} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                        <input
                          type="radio"
                          name="attr-outcome"
                          checked={outcome === val}
                          onChange={() => setOutcome(val)}
                          className="accent-pink-600"
                        />
                        {label}
                      </label>
                    ))}
                    {outcome === 'PARTNER' && (
                      <div className="mt-1 space-y-1">
                        <p className="text-[12px] text-ink-600">
                          Rate just the product — the partner issue routes separately, so this can
                          only be the same or higher:
                        </p>
                        <StarRow label="Product-only rating" value={reanchorRating} onChange={setReanchorRating} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
