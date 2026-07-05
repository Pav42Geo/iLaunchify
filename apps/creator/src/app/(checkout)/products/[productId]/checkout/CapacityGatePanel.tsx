'use client'

// Risk Center capacity gate — the honest-options panel (M5-prep,
// docs/RISK_MANAGEMENT_CENTER.md §4; decisions 2026-07-05: split +
// extended-ETA in product, manufacturer migration stays an ops conversation).
//
// Renders when placeOrderFromCheckoutDraft returns a capacityGate failure —
// which only happens after an admin promotes CAPACITY_OVERCOMMIT to GATE.
// The promise this panel keeps: the platform never knowingly sells a date it
// can't deliver, and the creator always chooses.

import { AlertTriangle, CalendarClock, Scissors, MessageCircle, X } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { CapacityGateInfo } from '@ilaunchify/orders'

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

export function CapacityGatePanel({
  gate,
  qtyNoun,
  busy,
  onReduceQty,
  onProceedExtendedEta,
  onClose,
}: {
  gate: CapacityGateInfo
  /** "packs" for pack products, "units" otherwise — keeps copy honest. */
  qtyNoun: string
  busy: boolean
  onReduceQty: (newQty: number) => void
  onProceedExtendedEta: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="capacity-gate-title">
      <div className="w-full max-w-lg rounded-3xl border border-ink-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-warning-100 text-warning-700">
              <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <h2 id="capacity-gate-title" className="font-display text-[17px] font-semibold text-ink-900">
              This order is bigger than your manufacturer&apos;s realistic capacity this month
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
          Based on this manufacturer&apos;s real production history and current commitments, about{' '}
          <strong className="tabular-nums text-ink-900">{gate.headroomUnits.toLocaleString()} units</strong>{' '}
          of capacity remain this month — your order needs{' '}
          <strong className="tabular-nums text-ink-900">{gate.orderUnits.toLocaleString()}</strong>. Rather
          than promise a date nobody can keep, pick what works for you:
        </p>

        <div className="mt-4 space-y-2.5">
          {gate.suggestedReducedQty !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReduceQty(gate.suggestedReducedQty!)}
              className="flex w-full items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left transition-colors hover:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
            >
              <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink-900">
                  Order {gate.suggestedReducedQty.toLocaleString()} {qtyNoun} now
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-600">
                  Fits this month&apos;s real capacity — ships on the normal timeline. Order the rest
                  {gate.splitProposal && gate.splitProposal[1]
                    ? ` in ${monthLabel(gate.splitProposal[1].month)}`
                    : ' next month'}{' '}
                  and that capacity is already reserved for you.
                </span>
              </span>
            </button>
          )}

          {gate.suggestedEtaMonth && (
            <button
              type="button"
              disabled={busy}
              onClick={onProceedExtendedEta}
              className="flex w-full items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left transition-colors hover:border-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
            >
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink-900">
                  Keep the full {gate.orderUnits.toLocaleString()} units — realistic timeline
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-600">
                  Production completes around <strong>{monthLabel(gate.suggestedEtaMonth)}</strong>. You&apos;re
                  agreeing to the honest date up front instead of discovering a delay at week five.
                </span>
              </span>
            </button>
          )}

          <a
            href={`mailto:support@ilaunchify.com?subject=${encodeURIComponent('Large order capacity — need options')}`}
            className="flex w-full items-start gap-3 rounded-2xl border border-ink-200 bg-ink-50/60 p-4 text-left transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink-900">Talk to our ops team</span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-600">
                For recurring volume at this scale we can work with you and your manufacturer on a
                production plan — or explore a higher-capacity setup together.
              </span>
            </span>
          </a>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-400">
          Capacity figures come from this manufacturer&apos;s verified production history and live order
          book — not their brochure. That&apos;s why our dates hold.
        </p>
      </div>
    </div>
  )
}
