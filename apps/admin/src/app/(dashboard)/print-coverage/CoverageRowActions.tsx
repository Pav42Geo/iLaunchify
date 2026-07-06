'use client'

// PS-8d — per-request admin nudges: re-broadcast to the next printer band now,
// or extend an expiring window. Detection/broadcast/unpark are automatic; these
// are the only two manual levers (§10.4).

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Radio, CalendarPlus } from 'lucide-react'
import { rebroadcastCoverageRequest, extendCoverageRequest } from './actions'

export function CoverageRowActions({
  requestId,
  templateId,
  status,
}: {
  requestId: string
  templateId: string
  status: string
}) {
  const [isPending, start] = useTransition()
  const closed = status === 'FULFILLED'

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    start(async () => {
      const res = await fn()
      if (!res.ok) return void toast.error(res.error ?? 'Something went wrong.')
      toast.success(res.message ?? 'Done.')
    })
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        onClick={() => run(() => rebroadcastCoverageRequest(templateId))}
        disabled={isPending || closed}
        title="Re-broadcast to the next printer band"
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-40"
      >
        <Radio className="h-3.5 w-3.5" />
        Re-broadcast
      </button>
      <button
        onClick={() => run(() => extendCoverageRequest(requestId))}
        disabled={isPending || closed}
        title="Extend the request window by 14 days"
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] font-semibold text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-40"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Extend
      </button>
    </div>
  )
}
