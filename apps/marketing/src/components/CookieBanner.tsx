'use client'

// Cookie consent banner (punch-list #3). Minimal, storage-gated, dismissible.
// Records consent in localStorage so it doesn't re-nag, and drives Google
// Consent Mode v2 (see @ilaunchify/ui <GoogleAnalytics>): GA loads with
// analytics/ads storage DENIED by default and is only granted once the visitor
// accepts here. Declining keeps it denied. No third-party CMP in V1 — links to
// the Cookie Policy for the disclosure.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GA_CONSENT_KEY } from '@ilaunchify/ui'

export function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(GA_CONSENT_KEY)) setShow(true)
    } catch {
      // Storage blocked (private mode) — don't nag.
    }
  }, [])

  function record(accepted: boolean) {
    try {
      localStorage.setItem(
        GA_CONSENT_KEY,
        JSON.stringify({ accepted, at: new Date().toISOString() }),
      )
    } catch {
      // ignore
    }
    // Update Google Consent Mode live so the current pageview is (un)tracked
    // without a reload. gtag is defined by <GoogleAnalytics> when NEXT_PUBLIC_GA_ID
    // is set; guarded so the banner still works when GA is disabled.
    try {
      const granted = accepted ? 'granted' : 'denied'
      ;(window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
        'consent',
        'update',
        {
          ad_storage: granted,
          ad_user_data: granted,
          ad_personalization: granted,
          analytics_storage: granted,
        },
      )
    } catch {
      // ignore
    }
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-5"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-ink-200 bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:gap-4">
        <p className="flex-1 text-[13px] leading-[1.5] text-ink-700">
          We use cookies to run the site and, with your consent, to measure
          traffic with Google Analytics. See our{' '}
          <Link
            href="/cookie-policy"
            className="font-semibold text-pink-700 underline hover:text-pink-600"
          >
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => record(false)}
            className="rounded-pill border border-ink-200 px-5 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-50 transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => record(true)}
            className="rounded-pill bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-black transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
