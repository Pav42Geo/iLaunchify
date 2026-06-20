'use client'

// Creator-facing cancel control. Calls requestOrderCancellation, which either
// cancels an unpaid pre-routing order outright or files a request for admin
// review (paid / past the self-cancel window). Shown only for cancellable orders.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XCircle } from 'lucide-react'
import { requestOrderCancellation } from '../cancel-actions'

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    start(async () => {
      const res = await requestOrderCancellation({ orderId, reason })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.outcome === 'CANCELLED'
          ? 'Order cancelled.'
          : 'Cancellation request submitted for review.',
      )
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink-700 hover:bg-rose-50 hover:text-rose-700"
      >
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Cancel order
      </button>
    )
  }

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/40 p-2.5">
      <p className="text-[11.5px] text-ink-700">
        Cancel this order? If it&apos;s already paid, we&apos;ll submit it for review and any
        applicable fees apply to your refund.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        rows={2}
        className="mt-2 w-full rounded-md border border-ink-200 px-2 py-1.5 text-[12px] focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center rounded-full bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Confirm cancel'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setReason('')
          }}
          disabled={pending}
          className="rounded-full px-3 py-1.5 text-[12px] text-ink-600 hover:text-ink-900 disabled:opacity-50"
        >
          Keep order
        </button>
      </div>
    </div>
  )
}
