'use client'

// PS-8c — the claim card. A shortlisted printer picks which decoration method
// they'll run for the uncovered packaging spec, then "I can produce this" mints
// the claim + a pre-filled DRAFT offering and drops them into the offering editor
// to finish pricing/MOQ. Partial disclosure: spec + run band + region only.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Megaphone, MapPin, Layers } from 'lucide-react'
import type { DecorationMethod } from '@ilaunchify/db'
import { claimCapabilityRequest } from './actions'
import { decorationLabel } from '../packaging/offerings/constants'
import type { ClaimableRequest } from './data'

export function CapabilityRequestsClient({ requests }: { requests: ClaimableRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-10 text-center">
        <Megaphone className="mx-auto h-6 w-6 text-ink-400" />
        <p className="mt-2 text-[14px] font-semibold text-ink-800">No open capability requests</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          When a manufacturer needs printing you can produce, it lands here — you&rsquo;ll also get
          a notification. Claim it to add the work to your catalog.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <RequestCard key={r.requestId} request={r} />
      ))}
    </div>
  )
}

function RequestCard({ request }: { request: ClaimableRequest }) {
  const router = useRouter()
  const [decoration, setDecoration] = useState<DecorationMethod | ''>(
    request.compatibleDecorations[0] ?? '',
  )
  const [isPending, start] = useTransition()

  function claim() {
    if (!decoration) {
      toast.error('Pick the decoration method you can run.')
      return
    }
    start(async () => {
      const res = await claimCapabilityRequest(request.requestId, decoration)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Claimed — finish the pricing to activate your offering.')
      router.push(`/packaging/offerings/${res.data.offeringId}`)
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">
            {request.packagingLabel}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-600">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-ink-400" />
              {request.runBand} units
            </span>
            {request.region && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-ink-400" />
                {request.region}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12.5px] text-ink-500">
        You already run compatible presses. Pick the decoration you&rsquo;ll produce and claim it —
        you&rsquo;ll see the full pre-approved spec once your offering is verified; designs and
        brand stay private until then.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-ink-700">
            Decoration method
          </label>
          <select
            value={decoration}
            onChange={(e) => setDecoration(e.target.value as DecorationMethod)}
            disabled={request.compatibleDecorations.length === 0}
            className="mt-1 block rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {request.compatibleDecorations.length === 0 && <option value="">None available</option>}
            {request.compatibleDecorations.map((m) => (
              <option key={m} value={m}>
                {decorationLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={claim}
          disabled={isPending || !decoration}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
        >
          {isPending ? 'Claiming…' : 'I can produce this'}
        </button>
      </div>
    </div>
  )
}
