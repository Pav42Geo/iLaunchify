'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { resolveOrderDispute } from './dispute-actions'

export function ResolveDisputeControls({
  disputeId,
  orderTotalCents,
}: {
  disputeId: string
  orderTotalCents: number
}) {
  const [resolution, setResolution] = useState('')
  // Refund (dollars) issued when resolving in the creator's favor — pre-filled to the
  // full order total, editable, 0 = no refund. Gated by STRIPE_REFUNDS_ENABLED.
  const [refundDollars, setRefundDollars] = useState((orderTotalCents / 100).toFixed(2))
  // Opt-in: strike the at-fault manufacturer when upholding the dispute.
  const [strikePartner, setStrikePartner] = useState(false)
  const [pending, start] = useTransition()

  function act(decision: 'RESOLVED' | 'REJECTED') {
    const refundCents =
      decision === 'RESOLVED' ? Math.max(0, Math.round(parseFloat(refundDollars || '0') * 100)) : undefined
    start(async () => {
      const res = await resolveOrderDispute({
        disputeId,
        decision,
        resolution,
        refundCents,
        strikePartner: decision === 'RESOLVED' ? strikePartner : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        decision === 'RESOLVED'
          ? refundCents && refundCents > 0
            ? `Dispute resolved · refund $${(refundCents / 100).toFixed(2)} recorded.`
            : 'Dispute resolved.'
          : 'Dispute rejected.',
      )
    })
  }

  return (
    <div className="mt-3">
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution note (optional)"
        rows={2}
        className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-ui-body focus-visible:ring-2 focus-visible:ring-pink-500"
      />
      <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-600">
        Refund if resolved:
        <span className="inline-flex items-center">
          <span className="text-ink-500">$</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={refundDollars}
            onChange={(e) => setRefundDollars(e.target.value)}
            className="ml-0.5 w-28 rounded-lg border border-ink-200 px-2 py-1 text-ui-body focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </span>
        <span className="text-[11px] text-ink-400">of ${(orderTotalCents / 100).toFixed(2)} total · 0 = none</span>
      </label>
      <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-600">
        <input
          type="checkbox"
          checked={strikePartner}
          onChange={(e) => setStrikePartner(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600 focus-visible:ring-2 focus-visible:ring-pink-500"
        />
        Strike the manufacturer (at fault) when resolving
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => act('RESOLVED')}
          disabled={pending}
          className="rounded-full bg-pink-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          Mark resolved
        </button>
        <button
          type="button"
          onClick={() => act('REJECTED')}
          disabled={pending}
          className="rounded-full border border-ink-200 px-4 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
