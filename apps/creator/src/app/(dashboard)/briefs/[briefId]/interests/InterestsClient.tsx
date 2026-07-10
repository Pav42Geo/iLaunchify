'use client'

// Shortlist & Selection client — star, compare (≤3), sort, select.
// UX contract: prototype screen ③, including the pre-selection commitments
// modal (NDA · staged reveal · milestone payment protection · others thanked).
// Note: copy says "payment protection", never "escrow" (Stripe posture).

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@ilaunchify/ui'
import { toggleShortlist, selectMaker } from './actions'

export interface InterestCard {
  id: string
  status: string
  partnerName: string
  partnerTier: string
  location: string | null
  rating: number | null
  fitScore: number
  priceLow: string | null
  priceHigh: string | null
  moq: number | null
  leadTimeWeeks: number | null
  offersSample: boolean
  pitch: string
  claimFit: Record<string, boolean>
}

type SortKey = 'fit' | 'value' | 'fast' | 'rated'

export function InterestsClient({
  briefId,
  briefClaims,
  interests,
}: {
  briefId: string
  briefClaims: string[]
  interests: InterestCard[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'short'>('all')
  const [sort, setSort] = useState<SortKey>('fit')
  const [compare, setCompare] = useState<Set<string>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [selecting, setSelecting] = useState<InterestCard | null>(null)

  const shortlisted = interests.filter((i) => i.status === 'SHORTLISTED')
  const bestPrice = Math.min(...interests.map((i) => (i.priceLow ? Number(i.priceLow) : Infinity)))
  const bestLead = Math.min(...interests.map((i) => i.leadTimeWeeks ?? Infinity))
  const bestMoq = Math.min(...interests.map((i) => i.moq ?? Infinity))
  const bestFit = Math.max(...interests.map((i) => i.fitScore))

  const list = useMemo(() => {
    let l = tab === 'short' ? interests.filter((i) => i.status === 'SHORTLISTED') : [...interests]
    l = [...l]
    if (sort === 'value') l.sort((a, b) => (Number(a.priceLow) || 1e9) - (Number(b.priceLow) || 1e9))
    else if (sort === 'fast') l.sort((a, b) => (a.leadTimeWeeks ?? 1e9) - (b.leadTimeWeeks ?? 1e9))
    else if (sort === 'rated') l.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    else l.sort((a, b) => b.fitScore - a.fitScore)
    return l
  }, [interests, tab, sort])

  function star(i: InterestCard) {
    setError(null)
    startTransition(async () => {
      const res = await toggleShortlist(briefId, i.id)
      if (!res.ok) setError(res.error)
      router.refresh()
    })
  }

  function toggleCompare(id: string) {
    setCompare((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 3) next.add(id)
      return next
    })
  }

  function confirmSelect() {
    if (!selecting) return
    setError(null)
    startTransition(async () => {
      const res = await selectMaker(briefId, selecting.id)
      if (res.ok && res.roomId) {
        router.push(`/rooms/${res.roomId}`)
      } else if (!res.ok) {
        setError(res.error)
        setSelecting(null)
      }
    })
  }

  const compared = interests.filter((i) => compare.has(i.id))

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', `All interested (${interests.length})`],
            ['short', `Shortlisted (${shortlisted.length})`],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-ui-caption font-medium transition ${
              tab === t
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-500 hover:text-ink-900'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={compare.size < 2}
          onClick={() => setCompareOpen(true)}
        >
          ⇄ Compare ({compare.size})
        </Button>
        <label className="flex items-center gap-2 text-ui-caption text-ink-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-ink-200 bg-white px-2 py-1.5 text-ui-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <option value="fit">Best fit</option>
            <option value="value">Best value</option>
            <option value="fast">Fastest</option>
            <option value="rated">Top rated</option>
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-ui-caption text-danger-700" role="alert">
          {error}
        </p>
      ) : null}

      {/* Cards */}
      {list.length === 0 ? (
        <div className="rounded-3xl border border-ink-200 bg-white px-6 py-14 text-center">
          <div className="text-3xl">☆</div>
          <p className="mt-2 font-display text-ui-subhead">No shortlisted makers yet</p>
          <p className="mt-1 text-ui-caption text-ink-500">
            Tap ☆ on a manufacturer to save them here.
          </p>
        </div>
      ) : (
        list.map((i) => {
          const rec = i.fitScore === bestFit && i.fitScore >= 90
          const starred = i.status === 'SHORTLISTED'
          return (
            <div
              key={i.id}
              className={`relative rounded-3xl border bg-white p-5 ${
                rec ? 'border-pink-500' : 'border-ink-200'
              }`}
            >
              {rec ? (
                <span className="absolute -top-3 left-5 rounded-full bg-pink-500 px-3 py-0.5 text-[11px] font-semibold text-white">
                  ★ Best fit
                </span>
              ) : null}
              <div className="flex items-start gap-3">
                <div>
                  <h3 className="font-display text-ui-subhead">
                    {i.partnerName}{' '}
                    <span className="align-middle rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
                      ✓ {i.partnerTier.toLowerCase()}
                    </span>
                  </h3>
                  <p className="mt-0.5 text-ui-caption text-ink-500">
                    {i.rating !== null ? `★ ${i.rating.toFixed(1)}` : 'Not yet rated'}
                    {i.location ? ` · 📍 ${i.location}` : ''}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-display text-ui-value">{i.fitScore}%</div>
                  <div className="text-ui-caption text-ink-500">fit</div>
                </div>
                <button
                  type="button"
                  aria-pressed={starred}
                  aria-label={starred ? 'Remove from shortlist' : 'Shortlist'}
                  onClick={() => star(i)}
                  className={`rounded-full border px-3 py-2 text-lg leading-none transition ${
                    starred
                      ? 'border-pink-500 bg-pink-50 text-pink-700'
                      : 'border-ink-200 text-ink-500 hover:text-ink-900'
                  }`}
                >
                  {starred ? '★' : '☆'}
                </button>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <Term
                  label="Price/unit"
                  value={i.priceLow ? `$${i.priceLow}${i.priceHigh ? `–${i.priceHigh}` : ''}` : '—'}
                  best={i.priceLow !== null && Number(i.priceLow) === bestPrice}
                />
                <Term
                  label="MOQ"
                  value={i.moq?.toLocaleString() ?? '—'}
                  best={i.moq !== null && i.moq === bestMoq}
                />
                <Term
                  label="Lead time"
                  value={i.leadTimeWeeks ? `${i.leadTimeWeeks} wk` : '—'}
                  best={i.leadTimeWeeks !== null && i.leadTimeWeeks === bestLead}
                />
                <Term label="Paid sample" value={i.offersSample ? '✓ Yes' : '—'} />
              </dl>

              {briefClaims.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {briefClaims.map((c) => {
                    const can = i.claimFit[c] ?? false
                    return (
                      <span
                        key={c}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          can ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-500'
                        }`}
                      >
                        {can ? '✓' : '△'} {c}
                      </span>
                    )
                  })}
                </div>
              ) : null}

              <blockquote className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-ui-caption text-ink-700">
                “{i.pitch}”
              </blockquote>

              <div className="mt-4 flex items-center gap-3">
                <label className="flex items-center gap-2 text-ui-caption text-ink-500">
                  <input
                    type="checkbox"
                    checked={compare.has(i.id)}
                    onChange={() => toggleCompare(i.id)}
                    className="h-4 w-4 rounded border-ink-200 text-pink-500 focus-visible:ring-pink-500"
                  />
                  Compare
                </label>
                <span className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => star(i)}>
                  {starred ? '★ Shortlisted' : '☆ Shortlist'}
                </Button>
                <Button
                  variant={rec ? 'primary' : 'pink'}
                  size="sm"
                  onClick={() => setSelecting(i)}
                >
                  Select &amp; start →
                </Button>
              </div>
            </div>
          )
        })
      )}

      {/* Compare modal */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compare manufacturers</DialogTitle>
            <DialogDescription>Best value highlighted — you decide when ready.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-ui-caption">
              <thead>
                <tr>
                  <th className="p-2 text-left text-ink-500" />
                  {compared.map((m) => (
                    <th key={m.id} className="p-2 text-left font-display text-ui-subhead">
                      {m.partnerName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Price/unit" cells={compared.map((m) => (m.priceLow ? `$${m.priceLow}` : '—'))} winners={compared.map((m) => Number(m.priceLow) === bestPrice)} />
                <CompareRow label="MOQ" cells={compared.map((m) => m.moq?.toLocaleString() ?? '—')} winners={compared.map((m) => m.moq === bestMoq)} />
                <CompareRow label="Lead time" cells={compared.map((m) => (m.leadTimeWeeks ? `${m.leadTimeWeeks} wk` : '—'))} winners={compared.map((m) => m.leadTimeWeeks === bestLead)} />
                <CompareRow label="Rating" cells={compared.map((m) => (m.rating !== null ? `★ ${m.rating.toFixed(1)}` : '—'))} winners={compared.map(() => false)} />
                <CompareRow label="Paid sample" cells={compared.map((m) => (m.offersSample ? '✓ Yes' : '—'))} winners={compared.map(() => false)} />
                <CompareRow label="Location" cells={compared.map((m) => m.location ?? '—')} winners={compared.map(() => false)} />
                <CompareRow label="Fit" cells={compared.map((m) => `${m.fitScore}%`)} winners={compared.map((m) => m.fitScore === bestFit)} />
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompareOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select confirmation modal — the commitments (prototype ③) */}
      <Dialog open={!!selecting} onOpenChange={(o) => !o && setSelecting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start with {selecting?.partnerName}?</DialogTitle>
            <DialogDescription>
              This opens a private, protected room and begins the build:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Commit icon="📜" title="Mutual NDA on room open">
              Confidentiality both ways. The e-sign flow is finalizing with counsel — the room
              shows its status until signed.
            </Commit>
            <Commit icon="🔒" title="Recipe & targets revealed only in-room">
              {selecting?.partnerName} sees your private details for the first time — nowhere
              public.
            </Commit>
            <Commit icon="💰" title="Discovery milestone under payment protection">
              You fund it when you agree terms in the room; released only when you approve the
              first milestone.
            </Commit>
            <Commit icon="🤝" title="The other makers are thanked">
              Notified respectfully that you chose another partner.
            </Commit>
            <p className="rounded-xl bg-pink-50 px-3 py-2 text-ui-caption text-pink-700">
              🧭 <b>You stay in control.</b> Nothing gets made without your approval — review every
              version, request changes, or pause anytime.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelecting(null)}>
              Not yet
            </Button>
            <Button variant="primary" onClick={confirmSelect} disabled={isPending}>
              {isPending ? 'Opening room…' : '✓ Confirm & open room'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Term({ label, value, best }: { label: string; value: string; best?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${best ? 'bg-pink-50' : 'bg-ink-50'}`}>
      <dt className="text-[11px] uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={`text-ui-caption font-semibold ${best ? 'text-pink-700' : ''}`}>
        {value}
        {best ? ' ✓' : ''}
      </dd>
    </div>
  )
}

function CompareRow({
  label,
  cells,
  winners,
}: {
  label: string
  cells: string[]
  winners: boolean[]
}) {
  return (
    <tr className="border-t border-ink-100">
      <td className="p-2 font-medium text-ink-500">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className={`p-2 ${winners[i] ? 'font-semibold text-pink-700' : ''}`}>
          {c}
          {winners[i] ? ' ✓' : ''}
        </td>
      ))}
    </tr>
  )
}

function Commit({
  icon,
  title,
  children,
}: {
  icon: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-ink-200 px-3 py-2.5">
      <div className="text-xl">{icon}</div>
      <div>
        <div className="text-ui-caption font-semibold">{title}</div>
        <div className="text-ui-caption text-ink-500">{children}</div>
      </div>
    </div>
  )
}
