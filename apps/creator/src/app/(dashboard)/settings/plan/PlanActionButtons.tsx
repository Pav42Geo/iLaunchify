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
import { marketingUrl } from '@/lib/marketing-url'

type Tier = 'BUILDER' | 'AGENCY'

// =============================================================================
// UpgradeButton — Maker → Builder/Agency OR Builder → Agency
// =============================================================================
//
// Requires affirmative consent to the Membership Subscription Terms BEFORE the
// recurring charge (US auto-renewal / "click-to-cancel" best practice — see
// /policies/membership-subscription-terms). The button stays disabled until the
// creator checks the box.

export function UpgradeButton({
  targetTier,
  label,
}: {
  targetTier: Tier
  label: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)

  return (
    <div className="space-y-2.5">
      <label className="flex items-start gap-2 text-[11px] leading-snug text-ink-600">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-pink-500"
          aria-label="Agree to the Membership Subscription Terms"
        />
        <span>
          I agree to the{' '}
          <a
            href={marketingUrl('/policies/membership-subscription-terms')}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-pink-700 underline hover:text-pink-800"
          >
            Membership Subscription Terms
          </a>
          , including automatic monthly renewal until I cancel.
        </span>
      </label>
      <button
        type="button"
        disabled={pending || !agreed}
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
        className="inline-flex h-10 w-full items-center justify-center rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold uppercase tracking-wider text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Opening Stripe…' : label}
      </button>
      {error && (
        <p className="text-[11.5px] text-danger-700" role="alert">
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
        className="inline-flex h-9 items-center justify-center rounded-full border border-ink-300 bg-white px-4 text-[12px] font-semibold uppercase tracking-wider text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Scheduling…' : 'Cancel subscription'}
      </button>
      {error && (
        <p className="text-[11.5px] text-danger-700" role="alert">
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
        className="inline-flex h-9 items-center justify-center rounded-full bg-success-600 px-4 text-[12px] font-semibold uppercase tracking-wider text-white transition hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Resuming…' : 'Resume subscription'}
      </button>
      {error && (
        <p className="text-[11.5px] text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
