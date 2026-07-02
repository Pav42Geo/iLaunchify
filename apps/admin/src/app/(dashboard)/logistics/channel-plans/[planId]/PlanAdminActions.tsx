'use client'

// Admin actions card for the channel-inbound plan detail page (Phase L3b).
//
// - "Cancel plan": DRAFT only — flips status to CANCELLED via the guarded
//   server action (audited under the parent Order).
// - "Confirm with Amazon": rendered DISABLED — the SP-API createInboundPlan/
//   confirm flow is pending Amazon developer approval. Wire it here when the
//   credentials land (docs/LOGISTICS_AND_FULFILLMENT.md §7.2).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CloudOff, Loader2 } from 'lucide-react'
import { cancelChannelPlan } from './actions'

export function PlanAdminActions({
  planId,
  status,
  orderRef,
}: {
  planId: string
  status: string
  orderRef: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canCancel = status === 'DRAFT'

  function onCancel() {
    if (
      !window.confirm(
        `Cancel this draft inbound plan for ${orderRef}? The order keeps its channel destination — a new plan can be drafted later.`,
      )
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await cancelChannelPlan(planId)
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
        Admin actions
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={!canCancel || isPending}
          title={
            canCancel
              ? 'Cancel this draft plan'
              : 'Only DRAFT plans can be cancelled — confirmed plans are locked with the channel.'
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-danger-200 bg-danger-100 px-4 text-[12px] font-semibold text-danger-800 transition-colors hover:bg-danger-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          Cancel plan
        </button>

        <button
          type="button"
          disabled
          title="SP-API pending — enable after Amazon developer approval"
          className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <CloudOff className="h-3.5 w-3.5" />
          Confirm with Amazon
        </button>
      </div>

      <p className="mt-2 text-[11.5px] text-ink-500">
        Confirm with Amazon: SP-API pending — enable after Amazon developer approval.
        {!canCancel && ' Cancel is available for DRAFT plans only.'}
      </p>

      {error && (
        <p className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-[12px] text-danger-800" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
