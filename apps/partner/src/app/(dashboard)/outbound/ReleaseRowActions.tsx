'use client'

// Row actions for the outbound release queue — Partner Role Accounts P1
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.1.C). Thin client over the SHARED release
// FSM actions (orders/[dispatchId]/releases-actions.ts):
//
//   REQUESTED → [Start picking] → PICKING → [Mark shipped + tracking] → SHIPPED
//   → [Mark delivered] → DELIVERED
//
// dispatchId is '' here — the actions revalidate /outbound + /inventory.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackageSearch, Truck, CircleCheck } from 'lucide-react'
import {
  startReleasePicking,
  shipStorageRelease,
  deliverStorageRelease,
} from '../orders/[dispatchId]/releases-actions'

export function ReleaseRowActions({ releaseId, status }: { releaseId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showTracking, setShowTracking] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [number, setNumber] = useState('')

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(okMsg)
      setShowTracking(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'REQUESTED') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => startReleasePicking({ dispatchId: '', releaseId }), 'Picking started')}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <PackageSearch className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? 'Working…' : 'Start picking'}
      </button>
    )
  }

  if (status === 'PICKING') {
    if (!showTracking) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowTracking(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Mark shipped
        </button>
      )
    }
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <input
          type="text"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="Carrier"
          className="h-8 w-24 rounded-md border border-ink-200 bg-white px-2 text-[12px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Tracking #"
          className="h-8 w-32 rounded-md border border-ink-200 bg-white px-2 font-mono text-[11.5px] text-ink-900 placeholder:font-sans placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <button
          type="button"
          disabled={busy || carrier.trim() === '' || number.trim() === ''}
          onClick={() =>
            run(
              () =>
                shipStorageRelease({
                  dispatchId: '',
                  releaseId,
                  trackingCarrier: carrier,
                  trackingNumber: number,
                }),
              'Marked shipped — balance decremented',
            )
          }
          className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          {busy ? 'Saving…' : 'Confirm'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowTracking(false)}
          className="rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-600 hover:border-ink-400"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (status === 'SHIPPED') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => deliverStorageRelease({ dispatchId: '', releaseId }), 'Marked delivered')}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? 'Working…' : 'Mark delivered'}
      </button>
    )
  }

  return null
}
