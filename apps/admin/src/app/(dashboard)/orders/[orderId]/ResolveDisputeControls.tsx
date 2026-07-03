'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { resolveOrderDispute, resolveDisputeWithReprint } from './dispute-actions'

export function ResolveDisputeControls({
  disputeId,
  orderTotalCents,
  labelDispatches = [],
}: {
  disputeId: string
  orderTotalCents: number
  /** LABEL (print) dispatches on this order — enables the reprint outcome. */
  labelDispatches?: { id: string; label: string }[]
}) {
  const [resolution, setResolution] = useState('')
  // Refund (dollars) issued when resolving in the creator's favor — pre-filled to the
  // full order total, editable, 0 = no refund. Gated by STRIPE_REFUNDS_ENABLED.
  const [refundDollars, setRefundDollars] = useState((orderTotalCents / 100).toFixed(2))
  // Opt-in: strike the at-fault manufacturer when upholding the dispute.
  const [strikePartner, setStrikePartner] = useState(false)
  // Reprint outcome — which LABEL dispatch to reprint + its cost (0 = goodwill).
  const [reprintDispatchId, setReprintDispatchId] = useState(labelDispatches[0]?.id ?? '')
  const [reprintCostDollars, setReprintCostDollars] = useState('0.00')
  const [pending, start] = useTransition()

  function reprint() {
    if (!reprintDispatchId) return
    start(async () => {
      const res = await resolveDisputeWithReprint({
        disputeId,
        dispatchId: reprintDispatchId,
        resolution,
        costCents: Math.max(0, Math.round(parseFloat(reprintCostDollars || '0') * 100)),
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Dispute resolved · reprint dispatch created and the printer notified.')
    })
  }

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
      {labelDispatches.length > 0 && (
        <div className="mt-3 rounded-lg border border-ink-200 bg-white px-3 py-2">
          <p className="text-[12.5px] font-semibold text-ink-800">Reprint outcome (LABEL)</p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            Clones the print leg — same printer, same manifest version, same artwork — as a fresh
            dispatch and notifies the printer. Resolves the dispute.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {labelDispatches.length > 1 && (
              <select
                value={reprintDispatchId}
                onChange={(e) => setReprintDispatchId(e.target.value)}
                className="rounded-lg border border-ink-200 px-2 py-1 text-ui-body focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                {labelDispatches.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1 text-[12.5px] text-ink-600">
              Reprint cost
              <span className="inline-flex items-center">
                <span className="text-ink-500">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={reprintCostDollars}
                  onChange={(e) => setReprintCostDollars(e.target.value)}
                  className="ml-0.5 w-24 rounded-lg border border-ink-200 px-2 py-1 text-ui-body focus-visible:ring-2 focus-visible:ring-pink-500"
                />
              </span>
              <span className="text-[11px] text-ink-400">0 = goodwill</span>
            </label>
            <button
              type="button"
              onClick={reprint}
              disabled={pending || !reprintDispatchId}
              className="rounded-full bg-ink-900 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
            >
              Resolve + reprint
            </button>
          </div>
        </div>
      )}
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
