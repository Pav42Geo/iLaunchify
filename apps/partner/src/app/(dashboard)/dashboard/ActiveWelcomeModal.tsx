'use client'

// One-time celebration modal shown when a partner lands on /dashboard for
// the first time after their account is ACTIVE. Reuses Tailwind/ARIA
// patterns from the rest of the app — no shadcn Dialog dependency.
//
// State is purely "open until the user dismisses it." The parent
// dashboard page only renders this when activeWelcomeSeen is not set.
// On dismiss we call markActiveWelcomeSeen so refreshing the page
// doesn't re-open it.

import { useState, useTransition } from 'react'
import { Sparkles, X, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { markActiveWelcomeSeen } from './welcome-modal-actions'

export function ActiveWelcomeModal({ companyName }: { companyName: string }) {
  const [open, setOpen] = useState(true)
  const [, startTransition] = useTransition()

  function dismiss() {
    // Optimistic close; flag-stamp fires in the background. If it fails the
    // modal will reappear on next page load — acceptable UX (worst case the
    // partner sees the celebration twice).
    setOpen(false)
    startTransition(async () => {
      await markActiveWelcomeSeen()
    })
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-8 shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-pink-100 p-4">
            <Sparkles className="h-8 w-8 text-pink-700" aria-hidden />
          </div>

          <h2
            id="welcome-modal-title"
            className="mt-5 font-display text-[24px] font-bold tracking-[-0.02em] text-ink-900"
          >
            You&apos;re live, {companyName}!
          </h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-600">
            Your partner profile is fully verified. Creators can now route production orders to
            you, and you&apos;ll receive an email + in-app notification when a new dispatch needs
            your acceptance.
          </p>

          <div className="mt-6 w-full space-y-3 rounded-xl border border-ink-200 bg-cream p-4 text-left text-sm">
            <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
              What happens next
            </div>
            <NextStep>
              New orders show up in your{' '}
              <Link href="/orders" className="font-medium text-pink-700 underline">
                Orders inbox
              </Link>
            </NextStep>
            <NextStep>
              Stripe Connect deposits payouts 2 business days after each shipment
            </NextStep>
            <NextStep>
              Edit your capabilities anytime from{' '}
              <Link href="/services" className="font-medium text-pink-700 underline">
                Services
              </Link>
            </NextStep>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Take me to the dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

function NextStep({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-pink-500" />
      <span className="text-ink-700">{children}</span>
    </div>
  )
}
