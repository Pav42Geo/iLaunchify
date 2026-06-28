'use client'

import { useState, useTransition } from 'react'
import { approveClawback, markClawbackExecuted, waiveClawback } from './actions'

type Status = 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'WAIVED'

const BTN =
  'inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50'

export function ClawbackRowActions({ id, status }: { id: string; status: Status }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  if (status === 'EXECUTED' || status === 'WAIVED') {
    return <span className="text-[11px] text-ink-400">—</span>
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setErr(null)
    start(async () => {
      const r = await fn().catch(() => ({ ok: false as const, error: 'Action failed.' }))
      if (!r.ok) setErr(r.error)
    })
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {err && <span className="mr-1 text-[10.5px] text-danger-600">{err}</span>}
      {status === 'PENDING_APPROVAL' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveClawback({ id }))}
          className={`${BTN} border-success-300 bg-success-50 text-success-800 hover:border-success-400`}
        >
          Approve
        </button>
      )}
      {status === 'APPROVED' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const note = window.prompt('How was this recouped? (e.g. deducted from next payout, invoiced)') ?? undefined
            run(() => markClawbackExecuted({ id, note }))
          }}
          className={`${BTN} border-ink-900 bg-ink-900 text-white hover:bg-ink-800`}
        >
          Mark executed
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const note = window.prompt('Reason for waiving this clawback? (optional)') ?? undefined
          run(() => waiveClawback({ id, note }))
        }}
        className={`${BTN} border-ink-200 bg-white text-ink-600 hover:border-ink-400`}
      >
        Waive
      </button>
    </div>
  )
}
