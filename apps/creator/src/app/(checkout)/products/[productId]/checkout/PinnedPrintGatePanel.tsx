'use client'

// PS-3 pinned-print gate (docs/PRINT_PROVIDER_SELECTION.md §4).
//
// Renders when placeOrderFromCheckoutDraft returns a pinnedPrintGate failure:
// the creator picked a print provider on the marketplace card, but it failed
// routing's hard filters right now (blackout window, service deactivated,
// Stripe hold, no active offering). The promise this panel keeps: a manual
// pick is NEVER silently rerouted — the creator either consciously accepts
// the auto-routed provider, or bails to re-pick on the product page.

import { Printer, X } from 'lucide-react'
import type { PinnedPrintGateInfo } from './cart-actions'

export function PinnedPrintGatePanel({
  gate,
  busy,
  onAcceptAutoRouted,
  onClose,
}: {
  gate: PinnedPrintGateInfo
  busy: boolean
  onAcceptAutoRouted: () => void
  onClose: () => void
}) {
  const pinned = gate.pinnedProviderName ?? 'Your selected print provider'
  const auto = gate.autoProviderName ?? 'the best-rated available provider'
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pinned-print-gate-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-ink-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-warning-100 text-warning-700">
              <Printer className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <h2
              id="pinned-print-gate-title"
              className="font-display text-[17px] font-semibold text-ink-900"
            >
              {pinned} isn&apos;t available right now
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-600">
          The provider you picked for this product can&apos;t take this print job at the
          moment — it may be in a blackout window or temporarily paused. We haven&apos;t
          placed your order. You can continue with{' '}
          <span className="font-medium text-ink-900">{auto}</span> instead, or keep your
          pick and try again later.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
          >
            Keep my pick — don&apos;t order yet
          </button>
          <button
            type="button"
            onClick={onAcceptAutoRouted}
            disabled={busy}
            className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
          >
            {busy ? 'Placing…' : `Continue with ${gate.autoProviderName ?? 'auto-routing'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
