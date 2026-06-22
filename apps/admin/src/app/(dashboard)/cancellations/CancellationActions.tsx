'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { reviewCancellation } from './actions'

export function CancellationActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function approve() {
    if (
      !window.confirm(
        'Approve this cancellation? The order is cancelled, the partner may receive a strike, and any refund runs (if refunds are enabled).',
      )
    ) {
      return
    }
    const reviewNotes = window.prompt('Review note (optional):') ?? undefined
    start(async () => {
      const r = await reviewCancellation({ requestId, decision: 'APPROVED', reviewNotes })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Cancellation approved.')
      router.refresh()
    })
  }

  function deny() {
    const reviewNotes = window.prompt('Reason for denying (the partner must fulfill):') ?? undefined
    start(async () => {
      const r = await reviewCancellation({ requestId, decision: 'DENIED', reviewNotes })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Cancellation denied.')
      router.refresh()
    })
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" /> Approve
      </button>
      <button
        type="button"
        onClick={deny}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Deny
      </button>
    </div>
  )
}
