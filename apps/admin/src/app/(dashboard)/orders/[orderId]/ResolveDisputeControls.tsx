'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { resolveOrderDispute } from './dispute-actions'

export function ResolveDisputeControls({ disputeId }: { disputeId: string }) {
  const [resolution, setResolution] = useState('')
  const [pending, start] = useTransition()

  function act(decision: 'RESOLVED' | 'REJECTED') {
    start(async () => {
      const res = await resolveOrderDispute({ disputeId, decision, resolution })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(decision === 'RESOLVED' ? 'Dispute resolved.' : 'Dispute rejected.')
    })
  }

  return (
    <div className="mt-3">
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder="Resolution note (optional)"
        rows={2}
        className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-pink-500"
      />
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
