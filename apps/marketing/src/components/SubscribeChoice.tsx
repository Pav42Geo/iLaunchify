'use client'

// SubscribeChoice — compact One-time vs Subscribe & save chooser for the
// marketplace PDP configure box. A lightweight, PRESENTATIONAL mirror of the
// checkout's SubscribeChoiceRail (apps/creator .../checkout/SubscribeChoiceRail):
// same radio-row idea, same discount source (SUBSCRIPTION_DISCOUNT_LADDER from
// @ilaunchify/plans), same "Cancel anytime" reassurance. It is intentionally
// decoupled from checkout state so it can live on the public PDP.
//
// The discount LADDER is the single source of truth — every percentage shown
// here derives from it (per Pavel 2026-05-31). Selecting "Subscribe & save"
// applies the open-ended tier's discount to the previewed unit/earnings price.
//
// TODO wire subscribe into launch/checkout — for now this is a UI affordance.
// startLaunchFromTemplate / LaunchCtaCluster don't yet accept a subscription
// intent; once the recurring-production order type lands this choice can
// pre-select the checkout Subscribe rail.

import * as React from 'react'
import { Repeat, ShieldCheck } from 'lucide-react'
import {
  getTierByRunCount,
  getMaxDiscountBp,
  formatDiscountPct,
} from '@ilaunchify/plans'

export interface SubscribeChoiceProps {
  /** Whether Subscribe & save is selected. */
  subscribe: boolean
  onChange: (subscribe: boolean) => void
  /** Per-unit one-time price (drives the discounted preview). */
  unitPrice: number
  /** Run count whose discount applies when subscribed. null = open-ended. */
  runCount?: number | null
}

export function SubscribeChoice({
  subscribe,
  onChange,
  unitPrice,
  runCount = null,
}: SubscribeChoiceProps) {
  const tier = getTierByRunCount(runCount)
  const pctOff = formatDiscountPct(tier.discountBp)
  const maxPct = formatDiscountPct(getMaxDiscountBp())
  const subPrice = +(unitPrice * (10_000 - tier.discountBp) / 10_000).toFixed(2)

  return (
    <div className="overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)]">
      {/* One-time row */}
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-pressed={!subscribe}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-ink-50/60 focus:outline-none focus-visible:bg-ink-50"
      >
        <RadioDot selected={!subscribe} tone="ink" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-ink-700" aria-hidden="true" />
            <span className="text-[13px] font-semibold text-ink-900">One-time</span>
            <span className="ml-auto text-[13px] font-bold tabular-nums text-ink-900">
              ${unitPrice.toFixed(2)}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
            Pay this batch only. No commitment.
          </span>
        </span>
      </button>

      <div className="h-px bg-ink-100" />

      {/* Subscribe & save row */}
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-pressed={subscribe}
        className={
          'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:bg-ink-50 ' +
          (subscribe ? 'bg-pink-50' : 'hover:bg-ink-50/60')
        }
      >
        <RadioDot selected={subscribe} tone="pink" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Repeat
              className={'h-3.5 w-3.5 ' + (subscribe ? 'text-pink-700' : 'text-ink-700')}
              aria-hidden="true"
            />
            <span className="text-[13px] font-semibold text-ink-900">
              Subscribe &amp; save
            </span>
            <span className="inline-flex items-center rounded-full bg-success-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-success-700">
              −{pctOff}%
            </span>
            <span className="ml-auto flex items-baseline gap-1.5">
              <span className="text-[13px] font-bold tabular-nums text-pink-700">
                ${subPrice.toFixed(2)}
              </span>
              <span className="text-[11px] tabular-nums text-ink-400 line-through">
                ${unitPrice.toFixed(2)}
              </span>
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
            Recurring production · save up to {maxPct}% · cancel anytime
          </span>
        </span>
      </button>
    </div>
  )
}

function RadioDot({
  selected,
  tone,
}: {
  selected: boolean
  tone: 'pink' | 'ink'
}) {
  return (
    <span
      aria-hidden="true"
      className={
        'mt-0.5 inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ' +
        (selected
          ? tone === 'pink'
            ? 'border-pink-500 bg-pink-500'
            : 'border-ink-900 bg-ink-900'
          : 'border-ink-300 bg-white')
      }
    >
      {selected && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
    </span>
  )
}
