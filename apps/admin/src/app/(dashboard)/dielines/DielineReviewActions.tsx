'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { verifyDieline, sendBackDieline } from './actions'

export function DielineReviewActions({ dielineId }: { dielineId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn()
      if (!r.ok) { toast.error(r.error ?? 'Failed'); return }
      toast.success(ok)
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={() => run(() => sendBackDieline(dielineId), 'Sent back')}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
      >
        <Undo2 className="h-3.5 w-3.5" /> Send back
      </button>
      <button
        onClick={() => run(() => verifyDieline(dielineId), 'Verified & activated')}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3.5 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Verify &amp; activate
      </button>
    </div>
  )
}
