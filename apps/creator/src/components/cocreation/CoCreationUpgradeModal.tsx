'use client'

// Co-creation upgrade gate (Pavel 2026-07-11).
//
// Co-creation is a Builder / Agency feature (D-CC1). Maker-tier creators can
// still reach the Co-Creation Studio and browse their briefs, but the
// "Post a brief" CTA opens this modal instead of the brief builder — the
// familiar /settings/plan self-serve upgrade path. Copy mirrors the brief
// builder's server-side upgrade panel so the two never diverge.
//
// Self-managed body portal at z-[120]/[130] (same reliable pattern as
// PricingTierModal — Radix's default z-index sat under the sticky header).

import * as React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X } from 'lucide-react'

export function CoCreationUpgradeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      {/* Scrim */}
      <div onClick={onClose} className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to co-create"
        className="relative z-[130] w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-[var(--bg-surface)] shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-8 pb-8 pt-10 text-center">
          <div className="text-4xl">🤝</div>
          <h2 className="mt-3 font-display text-ui-title text-ink-900">
            Co-create with a manufacturer
          </h2>
          <p className="mt-2 text-ui-body text-ink-500">
            Post your own product brief — a recipe or just an idea — and get it formulated,
            branded, and produced by a matched, verified maker. Co-creation briefs are included in
            the <b className="text-ink-700">Builder</b> and <b className="text-ink-700">Agency</b>{' '}
            plans.
          </p>

          <div className="mt-7 flex flex-col items-center gap-3">
            <Link
              href="/settings/plan"
              className="inline-flex w-full items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-ui-body font-semibold text-white transition hover:-translate-y-px"
            >
              Upgrade to Builder →
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-ui-caption font-medium text-ink-500 transition-colors hover:text-ink-900"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
