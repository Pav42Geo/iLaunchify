'use client'

// Phase G6.c — Subscribe & save picker.
//
// Lives at the bottom of Step 2 (Production), right where the creator
// has just locked in qty + materials and the per-run price is fresh.
// The placement is deliberate: this is the moment to ask "want this on
// autopilot every month?" not after they've already typed in payment.
//
// Two cards side by side:
//   - One-time (default, no commitment)
//   - Subscribe & save (cadence + run-count picker + live discount preview)
//
// Locked behind the SUBSCRIBE_AND_SAVE feature flag — Maker tier sees
// the same layout but the Subscribe card renders as a soft upgrade
// prompt routing to /pricing?tier=builder. Mirrors the R8.c right-rail
// stub's lock pattern so the upgrade affordance is consistent.
//
// All state writes flow through the wizard's draft autosave; this
// component is purely controlled.

import { Lock, Repeat, ShieldCheck, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { SubscriptionState } from './types'

// V1 discount ladder. Per Pavel's R8.c memory: "up to 12%". Conservative
// V1 floors that admin can dial up once we have data on take-rate.
const CADENCE_OPTIONS = [
  { value: 'MONTHLY' as const, label: 'Monthly', sub: 'every 30 days' },
  { value: 'QUARTERLY' as const, label: 'Quarterly', sub: 'every 3 months' },
]
const RUN_COUNT_OPTIONS = [
  { value: 3, label: '3 runs', discountBp: 500 }, // 5%
  { value: 6, label: '6 runs', discountBp: 800 }, // 8%
  { value: 12, label: '12 runs', discountBp: 1200 }, // 12%
  { value: null, label: 'Open-ended', discountBp: 1000 }, // 10%
]

interface Props {
  state: SubscriptionState
  onChange: (patch: Partial<SubscriptionState>) => void
  /** From the wizard — feature-flag resolved server-side. */
  unlocked: boolean
  /** Per-run total in cents (subtotal + shipping + tax + platform fee). */
  perRunTotalCents: number
}

export function SubscribeAndSavePicker({
  state,
  onChange,
  unlocked,
  perRunTotalCents,
}: Props) {
  const subscribeSelected = state.offerAccepted

  // Mark the offer as seen the first time we render it — feeds future
  // analytics on impression vs accept rates.
  if (!state.seenOffer) {
    queueMicrotask(() => onChange({ seenOffer: true }))
  }

  const pickedRun = RUN_COUNT_OPTIONS.find(
    (o) => o.value === state.runCount,
  ) ?? RUN_COUNT_OPTIONS[1]! // default to 6 runs if nothing chosen
  const previewDiscountBp = pickedRun.discountBp
  const previewPerRunCents = Math.max(
    0,
    Math.round((perRunTotalCents * (10_000 - previewDiscountBp)) / 10_000),
  )
  const previewSavingsCents = perRunTotalCents - previewPerRunCents

  function pickOneTime() {
    onChange({
      offerAccepted: false,
      cadence: null,
      runCount: null,
      discountBp: 0,
    })
  }

  function pickSubscribe() {
    if (!unlocked) return
    onChange({
      offerAccepted: true,
      cadence: state.cadence ?? 'MONTHLY',
      runCount: state.runCount ?? 6,
      discountBp: pickedRun.discountBp,
    })
  }

  function setCadence(cadence: 'MONTHLY' | 'QUARTERLY') {
    onChange({ cadence })
  }

  function setRunCount(value: number | null) {
    const match =
      RUN_COUNT_OPTIONS.find((o) => o.value === value) ?? RUN_COUNT_OPTIONS[1]!
    onChange({ runCount: value, discountBp: match.discountBp })
  }

  return (
    <section
      aria-labelledby="subscribe-and-save-heading"
      className="rounded-xl border border-ink-200 bg-white"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3">
        <div>
          <h3
            id="subscribe-and-save-heading"
            className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500"
          >
            How often do you want to produce this?
          </h3>
          <p className="mt-0.5 text-[11.5px] text-ink-500">
            Lock in a recurring cadence to save up to 12% and skip the
            re-spec every time.
          </p>
        </div>
      </header>

      <div className="grid gap-3 p-5 md:grid-cols-2">
        {/* One-time card */}
        <button
          type="button"
          onClick={pickOneTime}
          aria-pressed={!subscribeSelected}
          className={
            'group rounded-xl border-2 p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
            (!subscribeSelected
              ? 'border-ink-900 bg-ink-50/40 shadow-sm'
              : 'border-ink-200 bg-white hover:border-ink-300')
          }
        >
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            {!subscribeSelected && <SelectedDot />}
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-900">
            One-time run
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-600">
            Pay for this batch only. No commitment, no recurring charge.
            You can re-order whenever you like.
          </p>
          <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            This run only
          </p>
          <p className="font-display text-lg font-bold tabular-nums text-ink-900">
            {perRunTotalCents > 0 ? formatCents(perRunTotalCents) : '$—.——'}
          </p>
        </button>

        {/* Subscribe card */}
        <button
          type="button"
          onClick={pickSubscribe}
          disabled={!unlocked && subscribeSelected /* never happens, but type-safe */}
          aria-pressed={subscribeSelected}
          className={
            'group relative rounded-xl border-2 p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
            (subscribeSelected
              ? 'border-pink-500 bg-gradient-to-br from-pink-50/80 to-white shadow-sm'
              : unlocked
                ? 'border-ink-200 bg-white hover:border-pink-300'
                : 'cursor-default border-ink-200 bg-ink-50/40')
          }
        >
          <div className="flex items-start justify-between gap-2">
            <span
              className={
                'inline-flex h-9 w-9 items-center justify-center rounded-full ' +
                (subscribeSelected
                  ? 'bg-pink-100 text-pink-700'
                  : 'bg-ink-100 text-ink-700')
              }
            >
              <Repeat className="h-4 w-4" aria-hidden="true" />
            </span>
            {unlocked ? (
              subscribeSelected ? (
                <SelectedDot tone="pink" />
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Save up to 12%
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                Builder
              </span>
            )}
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-ink-900">
            Subscribe &amp; save
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-600">
            {unlocked
              ? 'We auto-produce + ship every cycle. Same partners, same manifest, locked-in discount. Cancel anytime.'
              : 'Upgrade to Builder to lock in a recurring cadence + discount on every run.'}
          </p>

          {unlocked ? (
            <>
              <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                {subscribeSelected ? 'Per-run with discount' : 'Per-run preview'}
              </p>
              <p className="font-display text-lg font-bold tabular-nums text-pink-700">
                {perRunTotalCents > 0
                  ? formatCents(previewPerRunCents)
                  : '$—.——'}
              </p>
              {perRunTotalCents > 0 && previewSavingsCents > 0 && (
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  <Sparkles className="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />
                  Save {formatCents(previewSavingsCents)} every cycle ({(previewDiscountBp / 100).toFixed(0)}% off)
                </p>
              )}
            </>
          ) : (
            <div className="mt-3">
              <Link
                href="/pricing?tier=builder"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full bg-pink-500 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
              >
                Upgrade to Builder
              </Link>
            </div>
          )}
        </button>
      </div>

      {/* Cadence + run-count detail panel — only when Subscribe is the
          active selection. Slides in below the cards on the same surface. */}
      {subscribeSelected && unlocked && (
        <div className="space-y-4 border-t border-pink-100 bg-pink-50/30 px-5 py-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-600">
              Cadence
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CADENCE_OPTIONS.map((c) => {
                const active = state.cadence === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCadence(c.value)}
                    aria-pressed={active}
                    className={
                      'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
                      (active
                        ? 'border-pink-500 bg-pink-500 text-white'
                        : 'border-ink-200 bg-white text-ink-700 hover:border-pink-300')
                    }
                  >
                    {c.label}
                    <span
                      className={
                        'ml-1.5 text-[10px] font-normal ' +
                        (active ? 'text-pink-100' : 'text-ink-400')
                      }
                    >
                      {c.sub}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-600">
              Total runs
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {RUN_COUNT_OPTIONS.map((o) => {
                const active = state.runCount === o.value
                return (
                  <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => setRunCount(o.value)}
                    aria-pressed={active}
                    className={
                      'rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
                      (active
                        ? 'border-pink-500 bg-white shadow-sm'
                        : 'border-ink-200 bg-white hover:border-pink-300')
                    }
                  >
                    <p className="text-[12.5px] font-semibold text-ink-900">
                      {o.label}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      {(o.discountBp / 100).toFixed(0)}% off / cycle
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-[11px] text-ink-500">
            First charge happens with this order. Recurring billing starts{' '}
            {state.cadence === 'QUARTERLY' ? '3 months' : '30 days'} from
            today and you can cancel from your account anytime.
          </p>
        </div>
      )}
    </section>
  )
}

function SelectedDot({ tone = 'ink' }: { tone?: 'pink' | 'ink' }) {
  return (
    <span
      aria-hidden="true"
      className={
        'inline-flex h-5 w-5 items-center justify-center rounded-full ' +
        (tone === 'pink' ? 'bg-pink-500 text-white' : 'bg-ink-900 text-white')
      }
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
        <path
          d="M5 12.5l4 4 10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
