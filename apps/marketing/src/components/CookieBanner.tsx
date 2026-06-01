'use client'

// Cookie consent banner (punch-list #3). Minimal, storage-gated, dismissible.
// Records consent in localStorage so it doesn't re-nag. No third-party CMP in
// V1 — links to the Privacy Policy for the cookie disclosure.

import { useEffect, useState } from 'react'
import Link from 'next/link'

const CONSENT_KEY = 'ilf-cookie-consent'

export function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setShow(true)
    } catch {
      // Storage blocked (private mode) — don't nag.
    }
  }, [])

  function accept() {
    try {
      localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ accepted: true, at: new Date().toISOString() }),
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
          We use cookies to run the site and improve your experience. See our{' '}
          <Link
            href="/privacy"
            className="font-semibold text-pink-700 underline hover:text-pink-600"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-pill bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-black transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
