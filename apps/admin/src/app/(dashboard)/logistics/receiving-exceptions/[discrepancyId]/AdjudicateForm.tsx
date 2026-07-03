'use client'

// Adjudication controls for one receiving discrepancy (admin). Kept small on
// purpose — the heavy lifting (guards, FSM, audit, notification) lives in the
// server action.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleCheck, ShieldQuestion } from 'lucide-react'
import { updateDiscrepancyStatus } from './actions'

export function AdjudicateForm({
  discrepancyId,
  status,
}: {
  discrepancyId: string
  status: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function move(toStatus: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED') {
    setBusy(true)
    try {
      const r = await updateDiscrepancyStatus({
        discrepancyId,
        toStatus,
        resolutionNote: note.trim() || undefined,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(toStatus === 'RESOLVED' ? 'Discrepancy resolved — FC notified' : `Moved to ${toStatus.toLowerCase().replace('_', ' ')}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'RESOLVED') return null

  return (
    <section className="space-y-3 rounded-2xl border border-ink-200 bg-white px-5 py-4">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">Adjudicate</h2>
      <div>
        <label htmlFor="resolution-note" className="block text-[12px] font-medium text-ink-700">
          Resolution note <span className="text-ink-400">(required to resolve — the FC sees this)</span>
        </label>
        <textarea
          id="resolution-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Outcome + next step, e.g. “Short 24 units confirmed with manufacturer — replacement pallet ships Friday; storage billing starts from received count.”"
          className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'OPEN' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => move('UNDER_REVIEW')}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-[12.5px] font-medium text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <ShieldQuestion className="h-3.5 w-3.5" aria-hidden="true" /> Mark under review
          </button>
        )}
        <button
          type="button"
          disabled={busy || note.trim().length === 0}
          onClick={() => move('RESOLVED')}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <CircleCheck className="h-4 w-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Resolve'}
        </button>
      </div>
    </section>
  )
}
