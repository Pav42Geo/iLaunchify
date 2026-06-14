'use client'

// Creator prompt when a maker proposed a later delivery date (delay-accept,
// docs/ROUTING_BINDING_MODEL.md §7). Approve → the order proceeds on the new date;
// Decline → the order is cancelled + refunded. The manufacturer still owns the
// accept/decline of the order itself; this is only the creator's yes/no on the date.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToDispatchDelay } from '../dispatch-delay-actions'

export function DelayApprovalPrompt({
  dispatchId,
  proposedDeadlineAt,
  delayReason,
}: {
  dispatchId: string
  proposedDeadlineAt: string // ISO
  delayReason: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function respond(approve: boolean) {
    if (!approve && !window.confirm('Decline the new date? This cancels the order and refunds you.')) return
    setBusy(true)
    setError(null)
    const r = await respondToDispatchDelay({ dispatchId, approve }).catch(() => null)
    setBusy(false)
    if (!r || !r.ok) { setError(r && !r.ok ? r.error : 'Something went wrong.'); return }
    router.refresh()
  }

  const dateLabel = new Date(proposedDeadlineAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="mt-2 rounded-lg border border-[#FAC775] bg-[#FDF6E8] p-3">
      <p className="text-[12.5px] font-semibold text-[#5A3406]">The maker can produce this — but by a later date.</p>
      <p className="mt-1 text-[12px] text-[#7C4A0E]">
        Proposed delivery: <b>{dateLabel}</b>
        {delayReason ? <> · “{delayReason}”</> : null}
      </p>
      {error && <p className="mt-1.5 text-[11.5px] text-red-700">{error}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => respond(true)}
          className="flex-1 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 disabled:opacity-60"
        >
          Approve new date
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => respond(false)}
          className="flex-1 rounded-full border border-ink-300 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60"
        >
          Decline · refund
        </button>
      </div>
    </div>
  )
}
