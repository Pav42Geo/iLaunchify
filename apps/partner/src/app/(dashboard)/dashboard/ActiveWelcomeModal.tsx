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
import { Button } from '@ilaunchify/ui'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white p-8 shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-emerald-100 p-4">
            <Sparkles className="h-8 w-8 text-emerald-600" aria-hidden />
          </div>

          <h2
            id="welcome-modal-title"
            className="mt-5 text-2xl font-bold tracking-tight text-zinc-900"
          >
            You&apos;re live, {companyName}!
          </h2>
          <p className="mt-3 max-w-md text-zinc-600">
            Your partner profile is fully verified. Creators can now route production
            orders to you, and you&apos;ll receive an email + in-app notification when a
            new dispatch needs your acceptance.
          </p>

          <div className="mt-6 w-full space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              What happens next
            </div>
            <NextStep>
              New orders show up in your <Link href="/orders" className="font-medium text-emerald-700 underline">Orders inbox</Link>
            </NextStep>
            <NextStep>
              Stripe Connect deposits payouts 2 business days after each shipment
            </NextStep>
            <NextStep>
              Edit your capabilities anytime from{' '}
              <Link href="/services" className="font-medium text-emerald-700 underline">
                Services
              </Link>
            </NextStep>
          </div>

          <Button
            onClick={dismiss}
            className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            Take me to the dashboard <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function NextStep({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
      <span className="text-zinc-700">{children}</span>
    </div>
  )
}
