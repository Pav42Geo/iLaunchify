'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { approveRefund, rejectRefund } from './actions'

export function RefundRequestActions({ id }: { id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function approve() {
    if (!window.confirm('Approve this refund? This runs the refund (if refunds are enabled).')) return
    start(async () => {
      const r = await approveRefund({ id })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Refund approved.')
      router.refresh()
    })
  }

  function reject() {
    const note = window.prompt('Reason for rejecting (optional):') ?? undefined
    start(async () => {
      const r = await rejectRefund({ id, note })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Request rejected.')
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
        onClick={reject}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Reject
      </button>
    </div>
  )
}
