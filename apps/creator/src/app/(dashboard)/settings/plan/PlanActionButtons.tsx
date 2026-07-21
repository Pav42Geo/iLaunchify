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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@ilaunchify/ui'
import {
  startTierUpgrade,
  cancelMyTierSubscription,
  resumeMyTierSubscription,
  pauseMyTierSubscription,
  resumePausedTierSubscription,
  openBillingPortal,
} from './actions'
import {
  TIER_CANCEL_REASONS,
  REASON_TEXT_MAX_LENGTH,
  type TierCancelReasonCode,
} from './cancel-reasons'
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
// Cancellation P0 (docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md §3.3):
// the confirm()/prompt() placeholder is replaced by a real modal that shows
// (a) the effective date (period end — nothing is lost today), (b) what the
// creator gives up, and (c) a structured "why?" survey: one required radio +
// one optional free-text field. One primary question only — completion, not
// interrogation. NO retention offer here yet (that's the P1 save-flow; CA's
// ARL allows at most one, shown next to a plain cancel path).

// Cancellation P1: reasons that unlock the pause save-offer. TOO_EXPENSIVE
// deliberately excluded — a pauser who keeps producing would keep the lower
// fee rate unbilled; "not producing right now" reasons carry no such leak.
const PAUSE_ELIGIBLE_REASONS: readonly TierCancelReasonCode[] = [
  'NOT_USING',
  'TEMPORARY',
]

export function CancelButton({
  tierName,
  periodEndLabel,
  loseFeatures,
  pauseAvailable,
}: {
  tierName: string
  periodEndLabel: string | null
  loseFeatures: string[]
  /** False when already paused or inside the 365-day pause cooldown. */
  pauseAvailable: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reasonCode, setReasonCode] = useState<TierCancelReasonCode | null>(
    null,
  )
  const [reasonText, setReasonText] = useState('')
  const [pauseMonths, setPauseMonths] = useState(2)

  const showPauseOffer =
    pauseAvailable && reasonCode !== null &&
    PAUSE_ELIGIBLE_REASONS.includes(reasonCode)

  const reset = () => {
    setReasonCode(null)
    setReasonText('')
    setError(null)
    setPauseMonths(2)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="inline-flex h-9 items-center justify-center rounded-full border border-ink-300 bg-white px-4 text-[12px] font-semibold uppercase tracking-wider text-ink-700 transition hover:bg-ink-100"
      >
        Cancel subscription
      </button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel your {tierName} plan?</DialogTitle>
            <DialogDescription>
              {periodEndLabel ? (
                <>
                  You&rsquo;ll keep every {tierName} benefit until{' '}
                  <span className="font-semibold text-ink-900">
                    {periodEndLabel}
                  </span>
                  , then move to the free Maker plan. No further charges. You
                  can resume any time before then.
                </>
              ) : (
                <>
                  You&rsquo;ll keep every {tierName} benefit until the end of
                  your current billing period, then move to the free Maker
                  plan. No further charges. You can resume any time before
                  then.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {loseFeatures.length > 0 && (
              <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                  What you&rsquo;ll lose on Maker
                </p>
                <ul className="mt-1.5 space-y-1 text-[12px] text-ink-700">
                  {loseFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span aria-hidden="true" className="mt-[1px]">
                        &bull;
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <fieldset>
              <legend className="text-[12px] font-semibold text-ink-900">
                Why are you cancelling?
              </legend>
              <div className="mt-2 space-y-1.5">
                {TIER_CANCEL_REASONS.map((r) => (
                  <label
                    key={r.code}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-800 transition has-[:checked]:border-pink-400 has-[:checked]:bg-pink-50"
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      value={r.code}
                      checked={reasonCode === r.code}
                      onChange={() => setReasonCode(r.code)}
                      className="h-3.5 w-3.5 accent-pink-500"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-[12px] font-medium text-ink-700">
                Anything else we should know?{' '}
                <span className="font-normal text-ink-500">(optional)</span>
              </span>
              <textarea
                value={reasonText}
                onChange={(e) =>
                  setReasonText(e.target.value.slice(0, REASON_TEXT_MAX_LENGTH))
                }
                rows={2}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
                placeholder="Your feedback goes straight to the team."
              />
            </label>

            {/* Cancellation P1 — the single save offer (CA ARL: max one,
                rendered ABOVE a plain, always-visible cancel path). */}
            {showPauseOffer && (
              <div className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-3">
                <p className="text-[12.5px] font-semibold text-ink-900">
                  Pause instead? Take a break without losing your setup.
                </p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">
                  Your {tierName} benefits run until{' '}
                  {periodEndLabel ?? 'the end of your paid period'} (already
                  paid). Then your plan pauses: no charges, free Maker plan.
                  Billing and your {tierName} benefits return automatically.
                  Available once every 12 months.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {[1, 2, 3].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPauseMonths(m)}
                      className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition ${
                        pauseMonths === m
                          ? 'border-pink-500 bg-white text-pink-700'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
                      }`}
                    >
                      {m} month{m > 1 ? 's' : ''}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null)
                      start(async () => {
                        const res = await pauseMyTierSubscription({
                          months: pauseMonths,
                          reasonCode: reasonCode ?? undefined,
                        })
                        if (!res.ok) {
                          setError(res.error)
                          return
                        }
                        setOpen(false)
                      })
                    }}
                    className="ml-auto inline-flex h-8 items-center justify-center rounded-full bg-pink-600 px-4 text-[11.5px] font-semibold uppercase tracking-wider text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? 'Pausing…' : 'Pause my plan'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-[11.5px] text-danger-700" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold uppercase tracking-wider text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Keep my plan
            </button>
            <button
              type="button"
              disabled={pending || !reasonCode}
              onClick={() => {
                if (!reasonCode) return
                setError(null)
                start(async () => {
                  const res = await cancelMyTierSubscription({
                    reasonCode,
                    reasonText: reasonText.trim() || undefined,
                  })
                  if (!res.ok) {
                    setError(res.error)
                    return
                  }
                  setOpen(false)
                })
              }}
              className="inline-flex h-9 items-center justify-center rounded-full border border-danger-300 bg-white px-4 text-[12px] font-semibold uppercase tracking-wider text-danger-700 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Scheduling…' : 'Cancel subscription'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// =============================================================================
// ResumePauseButton — cancel a scheduled pause / resume a paused plan early
// =============================================================================
//
// Rendered in the pause banners on /settings/plan. Before the paid period
// ends it just clears the scheduled pause; during the unpaid window it
// restores the remembered tier and Stripe resumes billing on its schedule.

export function ResumePauseButton({ label }: { label: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await resumePausedTierSubscription()
            if (!res.ok) {
              setError(res.error)
            }
          })
        }}
        className="inline-flex h-8 items-center justify-center rounded-full bg-ink-900 px-4 text-[11.5px] font-semibold uppercase tracking-wider text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Resuming…' : label}
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
// ManageBillingButton — Stripe Billing Portal (Cancellation P1)
// =============================================================================
//
// Card update + invoice history only (portal config disables cancel + plan
// switching). Lives in the dunning grace banner so a failed payment has a
// one-click fix, and below the tier cards for everyday card management.

export function ManageBillingButton({ compact }: { compact?: boolean }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await openBillingPortal()
            if (!res.ok) {
              setError(res.error)
              return
            }
            // Stripe-hosted portal — full-page nav, same as Checkout.
            window.location.assign(res.url)
          })
        }}
        className={
          compact
            ? 'inline-flex h-8 items-center justify-center rounded-full bg-ink-900 px-4 text-[11.5px] font-semibold uppercase tracking-wider text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60'
            : 'inline-flex h-9 items-center justify-center rounded-full border border-ink-300 bg-white px-4 text-[12px] font-semibold uppercase tracking-wider text-ink-700 transition hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        {pending ? 'Opening…' : 'Manage billing'}
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
