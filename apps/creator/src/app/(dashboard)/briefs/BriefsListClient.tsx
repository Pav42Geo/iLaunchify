'use client'

// Your-briefs list — 1:1 build of design/your-briefs-prototype.html
// (2026-07-12). Stats strip → filter tabs + sort → rich brief cards with the
// journey mini-stepper, terms chips, attention/fresh states, interested-maker
// stack and pool-window urgency. Filtering/sorting is client-side over the
// server-resolved view models (≤100 rows).

import * as React from 'react'
import Link from 'next/link'
import { productGradient } from '@ilaunchify/ui/tokens'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ilaunchify/ui'

export type BriefBucket = 'open' | 'choosing' | 'room' | 'prod' | 'other'

export interface BriefCardVM {
  id: string
  title: string
  nicheName: string
  emoji: string
  /** Resolved CSS gradient (productGradient[nicheGradientKey(slug)]). */
  gradient: string
  bucket: BriefBucket
  rawStatus: string
  /** Server-computed relative time ("2 days ago") — stable across hydration. */
  postedAgo: string
  createdAtMs: number
  vol: string | null
  budget: string | null
  lead: string | null
  category: string | null
  makerName: string | null
  roomId: string | null
  productId: string | null
  interested: number
  newInterests: number
  /** Days left in the interest window (open/choosing only). */
  poolDaysLeft: number | null
  /** Pulsing attention chip text — null when nothing needs the creator. */
  attention: string | null
  /** Warning-colored meta line, e.g. "recipe v2 needs your review". */
  roomLine: string | null
  /** 0 Posted · 1 Interests · 2 Shortlist · 3 Room · 4 Production · 5 done. */
  journey: number
  fresh: boolean
}

const JOURNEY = ['Posted', 'Interests', 'Shortlist', 'Room', 'Production'] as const

type FilterKey = 'all' | 'open' | 'choosing' | 'room' | 'prod'
type SortKey = 'attn' | 'new' | 'old'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Collecting interest' },
  { key: 'choosing', label: 'Choosing a maker' },
  { key: 'room', label: 'In room' },
  { key: 'prod', label: 'In production' },
]

const OTHER_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

function statusMeta(b: BriefCardVM): {
  pillCls: string
  label: string
  cta: string
  ctaCls: string
} {
  switch (b.bucket) {
    case 'open':
      return {
        pillCls: 'bg-info-50 text-info-700',
        label: '⏳ Collecting interest',
        cta: 'View brief',
        ctaCls: 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50',
      }
    case 'choosing':
      return {
        pillCls: 'bg-warning-50 text-warning-700',
        label: '★ Choosing a maker',
        cta: 'Review interests →',
        ctaCls: 'bg-pink-500 text-white hover:bg-pink-600',
      }
    case 'room':
      return {
        pillCls: 'bg-pink-50 text-pink-700',
        label: '🚪 In collaboration room',
        cta: 'Open room →',
        ctaCls: 'bg-pink-500 text-white hover:bg-pink-600',
      }
    case 'prod':
      return {
        pillCls: 'bg-success-50 text-success-700',
        label: b.rawStatus === 'COMPLETED' ? '✓ Completed' : '✓ In production',
        cta: 'View product →',
        ctaCls: 'bg-ink-900 text-white hover:bg-black',
      }
    default:
      return {
        pillCls: 'bg-ink-100 text-ink-600',
        label: OTHER_LABEL[b.rawStatus] ?? b.rawStatus,
        cta: 'View brief',
        ctaCls: 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50',
      }
  }
}

function ctaHref(b: BriefCardVM): string {
  const interests = `/briefs/${b.id}/interests`
  if (b.bucket === 'room') return b.roomId ? `/rooms/${b.roomId}` : interests
  if (b.bucket === 'prod') {
    if (b.productId) return `/products/${b.productId}`
    return b.roomId ? `/rooms/${b.roomId}` : interests
  }
  return interests
}

/** Overlapping mini-avatar stack for interested makers (prototype .stack). */
const STACK_GRADIENTS = [
  productGradient.purple,
  productGradient.pink,
  productGradient.lime,
  productGradient.cyan,
] as const

function InterestStack({ n, fresh }: { n: number; fresh: number }) {
  if (!n) {
    return (
      <span className="text-ui-caption text-ink-500">
        Be first — interests pending; matched makers were notified
      </span>
    )
  }
  return (
    <>
      <span className="flex" aria-hidden>
        {Array.from({ length: Math.min(n, 4) }, (_, i) => (
          <span
            key={i}
            className="h-5 w-5 rounded-full border-2 border-white first:ml-0 -ml-1.5"
            style={{ background: STACK_GRADIENTS[i % STACK_GRADIENTS.length] }}
          />
        ))}
      </span>
      <span className="text-ui-caption text-ink-500">
        {n} interested
        {fresh > 0 ? (
          <>
            {' · '}
            <b className="text-pink-700">{fresh} new</b>
          </>
        ) : null}
      </span>
    </>
  )
}

function JourneyStepper({ step }: { step: number }) {
  return (
    <div className="mb-1 mt-3.5 flex items-center" aria-label="Brief journey">
      {JOURNEY.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'on' : 'todo'
        return (
          <React.Fragment key={label}>
            <span
              className={`flex items-center gap-1.5 whitespace-nowrap text-[10.5px] font-bold ${
                state === 'done'
                  ? 'text-success-700'
                  : state === 'on'
                    ? 'text-pink-700'
                    : 'text-ink-400'
              }`}
            >
              <span
                className={`h-[9px] w-[9px] flex-none rounded-full ${
                  state === 'done'
                    ? 'bg-success-500'
                    : state === 'on'
                      ? 'bg-pink-500 ring-[3px] ring-pink-50'
                      : 'bg-ink-200'
                }`}
              />
              {label}
            </span>
            {i < JOURNEY.length - 1 && (
              <span
                className={`mx-2 h-0.5 min-w-[14px] flex-1 ${i < step ? 'bg-success-500' : 'bg-ink-200'}`}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function Term({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="min-w-[110px] rounded-[10px] border border-ink-100 bg-ink-50 px-3 py-1.5 text-center">
      <div className="text-[9px] font-extrabold uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`mt-px font-bold ${small ? 'text-[11.5px]' : 'text-[13.5px]'}`}>{value}</div>
    </div>
  )
}

function BriefCard({ b }: { b: BriefCardVM }) {
  const st = statusMeta(b)
  const highlighted = Boolean(b.attention) || b.fresh
  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-lg ${
        highlighted ? 'border-pink-500 ring-[3px] ring-pink-50' : 'border-ink-200'
      }`}
    >
      <div className="px-5 pb-4 pt-[18px]">
        {/* head */}
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl text-[23px]"
            style={{ background: b.gradient }}
          >
            {b.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[17.5px] leading-snug tracking-tight">{b.title}</h3>
            <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-ui-caption text-ink-500">
              <span>{b.nicheName}</span>
              <span>posted {b.postedAgo}</span>
              {b.makerName && (
                <span>
                  with <b>{b.makerName}</b>
                </span>
              )}
              {b.roomLine && <span className="text-warning-700">· {b.roomLine}</span>}
            </div>
          </div>
          {b.attention && (
            <span className="animate-pulse rounded-pill bg-pink-500 px-2.5 py-1 text-[10.5px] font-extrabold text-white">
              ● {b.attention}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-[3px] text-[10.5px] font-bold ${st.pillCls}`}
          >
            {st.label}
          </span>
        </div>

        <JourneyStepper step={b.journey} />

        {/* terms */}
        <div className="my-2.5 flex flex-wrap gap-2">
          <Term label="Volume" value={b.vol ?? '—'} />
          <Term label="Budget/unit" value={b.budget ?? '—'} />
          <Term label="Lead time" value={b.lead ?? '—'} />
          <Term label="Category" value={b.category ?? '—'} small />
        </div>

        {/* footer */}
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          {(b.bucket === 'open' || b.bucket === 'choosing') && (
            <InterestStack n={b.interested} fresh={b.newInterests} />
          )}
          {b.poolDaysLeft !== null && b.poolDaysLeft > 0 && (
            <span
              className={`rounded-pill px-2.5 py-[3px] text-[11px] font-bold ${
                b.poolDaysLeft <= 3 ? 'bg-danger-50 text-danger-600' : 'bg-ink-100 text-ink-500'
              }`}
            >
              ⏱ pool open {b.poolDaysLeft}d more
            </span>
          )}
          <span className="flex-1" />
          <Link
            href={`/briefs/${b.id}/interests`}
            className="text-ui-caption font-semibold text-ink-500 hover:text-ink-900 hover:underline"
          >
            View brief
          </Link>
          <Link
            href={ctaHref(b)}
            className={`inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[12.5px] font-bold transition ${st.ctaCls}`}
          >
            {st.cta}
          </Link>
        </div>
      </div>
    </div>
  )
}

export function BriefsListClient({ briefs }: { briefs: BriefCardVM[] }) {
  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [sort, setSort] = React.useState<SortKey>('attn')

  const count = (f: FilterKey) =>
    f === 'all' ? briefs.length : briefs.filter((b) => b.bucket === f).length

  const attnCount = briefs.filter((b) => b.attention).length

  const visible = React.useMemo(() => {
    const l = briefs.filter((b) => filter === 'all' || b.bucket === filter)
    if (sort === 'attn') {
      return [...l].sort(
        (a, b) => (b.attention ? 1 : 0) - (a.attention ? 1 : 0) || b.createdAtMs - a.createdAtMs,
      )
    }
    if (sort === 'new') return [...l].sort((a, b) => b.createdAtMs - a.createdAtMs)
    return [...l].sort((a, b) => a.createdAtMs - b.createdAtMs)
  }, [briefs, filter, sort])

  return (
    <div className="space-y-4">
      {/* stats strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div
          className={`rounded-xl border px-4 py-3 ${
            attnCount ? 'border-pink-100 bg-pink-50' : 'border-ink-100 bg-ink-50'
          }`}
        >
          <div
            className={`font-display text-2xl font-extrabold leading-tight ${attnCount ? 'text-pink-700' : ''}`}
          >
            {attnCount}
          </div>
          <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Need your decision
          </div>
        </div>
        {(
          [
            [count('open') + count('choosing'), 'In the pool'],
            [count('room'), 'In rooms'],
            [count('prod'), 'In production'],
          ] as const
        ).map(([n, label]) => (
          <div key={label} className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3">
            <div className="font-display text-2xl font-extrabold leading-tight">{n}</div>
            <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const on = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-[7px] text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                on
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
              }`}
            >
              {f.label}
              <span
                className={`rounded-pill px-[7px] py-px text-[10.5px] ${
                  on ? 'bg-white/[.18] text-white' : 'bg-ink-100 text-ink-600'
                }`}
              >
                {count(f.key)}
              </span>
            </button>
          )
        })}
        <span className="flex-1" />
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-auto min-w-[190px] text-[12.5px]" aria-label="Sort briefs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="attn">Needs attention first</SelectItem>
            <SelectItem value="new">Newest first</SelectItem>
            <SelectItem value="old">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* cards */}
      {visible.length ? (
        <div className="flex flex-col gap-3.5">
          {visible.map((b) => (
            <BriefCard key={b.id} b={b} />
          ))}
        </div>
      ) : (
        /* filtered-empty (true empty is server-rendered with the tier-gated CTA) */
        <div className="rounded-xl border border-ink-200 bg-white px-6 py-14 text-center">
          <div className="text-[40px]">💡</div>
          <h3 className="mb-1.5 mt-2.5 font-display text-ui-section">Nothing here yet</h3>
          <p className="mx-auto mb-4 max-w-[46ch] text-ui-caption text-ink-500">
            No briefs in this stage right now — they'll appear here as your co-creations move
            through the journey.
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="inline-flex items-center rounded-pill bg-pink-500 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-pink-600"
          >
            Show all briefs →
          </button>
        </div>
      )}
    </div>
  )
}
