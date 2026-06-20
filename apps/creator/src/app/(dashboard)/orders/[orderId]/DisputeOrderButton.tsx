'use client'

// Creator "Report an issue" control for a delivered order. Opens an OrderDispute
// (within OrderSettings.disputeWindowDays of delivery) and moves the order to
// DISPUTED for admin review. Shown only when the order is disputable.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertCircle } from 'lucide-react'
import { openOrderDispute, type DisputeCategory } from '../dispute-actions'

const CATEGORIES: Array<{ value: DisputeCategory; label: string }> = [
  { value: 'DAMAGED', label: 'Arrived damaged' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { value: 'NOT_DELIVERED', label: 'Never delivered' },
  { value: 'QUALITY', label: 'Quality problem' },
  { value: 'OTHER', label: 'Something else' },
]

export function DisputeOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<DisputeCategory | ''>('')
  const [description, setDescription] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (!category) {
      toast.error('Pick a reason.')
      return
    }
    start(async () => {
      const res = await openOrderDispute({ orderId, category, description })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Issue reported — our team will review it.')
      setOpen(false)
      setCategory('')
      setDescription('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-ink-700 hover:bg-amber-50 hover:text-amber-800"
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Report an issue
      </button>
    )
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2.5">
      <p className="text-[11.5px] text-ink-700">
        Tell us what went wrong with this delivered order. Our team will review and follow up.
      </p>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as DisputeCategory)}
        className="mt-2 w-full rounded-md border border-ink-200 px-2 py-1.5 text-[12px] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
      >
        <option value="">Choose a reason…</option>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What happened?"
        rows={2}
        className="mt-2 w-full rounded-md border border-ink-200 px-2 py-1.5 text-[12px] focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center rounded-full bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Submit report'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setCategory('')
            setDescription('')
          }}
          disabled={pending}
          className="rounded-full px-3 py-1.5 text-[12px] text-ink-600 hover:text-ink-900 disabled:opacity-50"
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
