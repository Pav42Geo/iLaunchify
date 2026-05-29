'use client'

// Step 3 — Subscription offer. Per Pavel's 2026-05-29 decision, V1 ships
// this as a marketing/waitlist card; real Stripe Subscription billing lands
// in V1.5 (G6 task remains pending).

import { useEffect } from 'react'
import { StepShell } from './_StepShell'
import type { SubscriptionState } from '../types'
import { Sparkles, Zap, Crown } from 'lucide-react'

interface Props {
  state: SubscriptionState
  onChange: (patch: Partial<SubscriptionState>) => void
}

export function SubscriptionStep({ state, onChange }: Props) {
  // Auto-stamp seenOffer so analytics can attribute drop-off.
  useEffect(() => {
    if (!state.seenOffer) onChange({ seenOffer: true })
  }, [state.seenOffer, onChange])

  return (
    <StepShell
      index={3}
      title="Subscribe + save"
      subtitle="Volume pricing on every order, not just this one."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50/70 to-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-pink-100 text-pink-700">
              <Zap className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base font-semibold text-ink-900">Builder</h3>
            <span className="ml-auto rounded-full bg-pink-500 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white">
              Recommended
            </span>
          </div>
          <div className="mb-2">
            <span className="text-3xl font-bold tracking-tight text-ink-900">$29</span>
            <span className="ml-1 text-xs text-ink-500">/ month</span>
            <p className="mt-1 text-[12.5px] text-ink-600">
              ~12% off every production order. Cancel anytime.
            </p>
          </div>
          <ul className="mb-4 space-y-1.5 text-[12.5px] text-ink-700">
            <li>• Volume pricing across all orders</li>
            <li>• Print-ready PDF + PNG export</li>
            <li>• Multi-channel push (Shopify, Etsy)</li>
          </ul>
          <button
            type="button"
            onClick={() => onChange({ joinedWaitlist: true })}
            disabled={!!state.joinedWaitlist}
            className="w-full rounded-full bg-pink-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-pink-600 disabled:opacity-60"
          >
            {state.joinedWaitlist ? 'Added to waitlist ✓' : 'Notify me when subscriptions launch'}
          </button>
          <p className="mt-2 text-center text-[10.5px] text-ink-500">
            Subscription billing ships V1.5. For now, this saves your interest.
          </p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-ink-100 text-ink-700">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base font-semibold text-ink-900">One-time</h3>
          </div>
          <div className="mb-2">
            <span className="text-3xl font-bold tracking-tight text-ink-900">$—.——</span>
            <p className="mt-1 text-[12.5px] text-ink-600">
              Continue with this order only. No commitment.
            </p>
          </div>
          <ul className="mb-4 space-y-1.5 text-[12.5px] text-ink-700">
            <li>• Pay-as-you-go production</li>
            <li>• Cost shown in summary on the right</li>
            <li>• Upgrade any time later</li>
          </ul>
          <button
            type="button"
            disabled
            className="w-full rounded-full bg-ink-100 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500"
          >
            Continue → use the Next button
          </button>
        </div>
      </div>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-500">
        <Crown className="h-3 w-3 text-ink-400" />
        Agency tier (multi-brand + team seats) lands with V1.5 too.
      </p>
    </StepShell>
  )
}
