'use client'

// Phase G6.f — per-row Cancel button on /subscriptions.
//
// Two-step interaction so the creator can't accidentally lose a $10K+
// recurring run: first click reveals an inline confirm + optional
// reason textarea, second click commits.
//
// Calls cancelMySubscription server action which forwards to Stripe and
// audit-logs. Stripe failure is invisible to the creator — the action
// flips our row regardless and the webhook reconciles.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, X } from 'lucide-react'
import { cancelMySubscription } from './actions'

interface Props {
  subscriptionId: string
}

export function CancelSubscriptionButton({ subscriptionId }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-[11.5px] font-medium text-zinc-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
      >
        Cancel subscription
      </button>
    )
  }

  return (
    <div className="w-full max-w-[260px] rounded-md border border-red-200 bg-red-50/40 p-3">
      <p className="text-[11.5px] font-semibold text-red-900">
        Cancel this subscription?
      </p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-red-700">
        Recurring billing stops immediately. Already-spawned orders aren&rsquo;t
        affected — only future cycles.
      </p>
      <label htmlFor={`cancel-reason-${subscriptionId}`} className="sr-only">
        Cancel reason (optional)
      </label>
      <textarea
        id={`cancel-reason-${subscriptionId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (optional, helps us improve)"
        disabled={pending}
        className="mt-2 block w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11.5px] focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            setReason('')
          }}
          disabled={pending}
          aria-label="Keep subscription"
          className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Keep it
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              const res = await cancelMySubscription({
                productionSubscriptionId: subscriptionId,
                reason: reason.trim() || undefined,
              })
              if (!res.ok) {
                toast.error(res.error)
                return
              }
              toast.success('Subscription cancelled.')
              setConfirming(false)
              setReason('')
              router.refresh()
            })
          }
          disabled={pending}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-red-600 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {pending ? 'Cancelling…' : 'Yes, cancel'}
        </button>
      </div>
    </div>
  )
}
