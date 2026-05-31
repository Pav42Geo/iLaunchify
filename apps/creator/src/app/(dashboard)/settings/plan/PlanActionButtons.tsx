'use client'

// V1.5-T5 — client-side button trio for the /settings/plan tier cards.
//
// All three buttons render the same pink-pill primary action used across
// the checkout flow + Studio (Button primitive defaults). Loading state
// disables the button + swaps the label; errors surface via window.alert
// for V1.5 (a proper toast system lands with the post-PMF polish pass).
//
// The upgrade button kicks Stripe Checkout: the action returns a hosted
// URL and we navigate top-level. Cancel + Resume revalidate the page
// server-side (action does the revalidatePath), so React refreshes the
// card states automatically.

import { useState, useTransition } from 'react'
import {
  startTierUpgrade,
  cancelMyTierSubscription,
  resumeMyTierSubscription,
} from './actions'

type Tier = 'BUILDER' | 'AGENCY'

// =============================================================================
// UpgradeButton — Maker → Builder/Agency OR Builder → Agency
// =============================================================================

export function UpgradeButton({
  targetTier,
  label,
}: {
  targetTier: Tier
  label: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await startTierUpgrade({ targetTier })
            if (!res.ok) {
              setError(res.error)
              return
            }
            // Stripe-hosted Checkout — full-page nav, not router.push.
            window.location.assign(res.url)
          })
        }}
        className="inline-flex h-10 w-full items-center justify-center rounded-full bg-pink-600 px-5 text-[12.5px] font-semibold uppercase tracking-wider text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Opening Stripe…' : label}
      </button>
      {error && (
        <p className="text-[11.5px] text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// =============================================================================
// CancelButton — schedules end-of-period cancellation
// =============================================================================
//
// Pavel decision (V1.5): no in-app reason capture beyond a confirm()
// prompt. A proper "Why are you leaving?" survey lands when we have
// volume to learn from.

export function CancelButton() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              'Cancel your tier subscription? You’ll keep your current plan until the end of the billing period, then drop back to Maker.',
            )
          ) {
            return
          }
          const reason =
            window.prompt(
              'Optional — anything we should know about why?',
              '',
            ) ?? undefined
          setError(null)
          start(async () => {
            const res = await cancelMyTierSubscription({ reason })
            if (!res.ok) {
              setError(res.error)
            }
          })
        }}
        className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Scheduling…' : 'Cancel subscription'}
      </button>
      {error && (
        <p className="text-[11.5px] text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// =============================================================================
// ResumeButton — undo a pending cancel
// =============================================================================

export function ResumeButton() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await resumeMyTierSubscription()
            if (!res.ok) {
              setError(res.error)
            }
          })
        }}
        className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-4 text-[12px] font-semibold uppercase tracking-wider text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Resuming…' : 'Resume subscription'}
      </button>
      {error && (
        <p className="text-[11.5px] text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
