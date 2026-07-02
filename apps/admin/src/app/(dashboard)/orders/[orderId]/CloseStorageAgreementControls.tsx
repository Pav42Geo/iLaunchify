'use client'

// L1.2b — admin "Close agreement" control for a HOLD_AT_MANUFACTURER storage
// agreement. Frictionless when unitsRemaining = 0 (stock fully released);
// otherwise requires an explicit confirm + reason (logged). The server action
// re-validates — this UI is convenience, not the guard.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { closeStorageAgreement } from './logistics-actions'

export function CloseStorageAgreementControls({
  orderId,
  agreementId,
  unitsRemaining,
}: {
  orderId: string
  agreementId: string
  unitsRemaining: number
}) {
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()

  const needsConfirm = unitsRemaining > 0
  const disabled = pending || (needsConfirm && (!confirm || reason.trim().length === 0))

  function submit() {
    start(async () => {
      const res = await closeStorageAgreement({
        agreementId,
        orderId,
        confirm: needsConfirm ? confirm : undefined,
        reason: reason.trim() || undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Storage agreement closed.')
    })
  }

  return (
    <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
      {needsConfirm && (
        <div className="rounded-lg border border-warning-200 bg-warning-50/60 p-2.5">
          <p className="text-[12px] font-semibold text-warning-900">
            {unitsRemaining.toLocaleString()} units are still in storage
          </p>
          <label className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-700">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600 focus-visible:ring-2 focus-visible:ring-pink-500"
            />
            Close anyway — remaining stock is handled outside the agreement
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required — logged)"
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="rounded-full border border-ink-300 bg-white px-4 py-1.5 text-[13px] font-semibold text-ink-900 transition-colors hover:border-ink-400 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {pending ? 'Closing…' : 'Close agreement'}
      </button>
    </div>
  )
}
