'use client'

// L1.2b — admin FC hard-pin control (L8: "admin can hard-pin"). Options come
// from the page's live rankFulfillmentCenters recompute; picking an ineligible
// node reveals an explicit confirm checkbox + required reason. The server
// action re-validates everything — this UI is convenience, not the guard.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { overrideFulfillmentCenter } from './logistics-actions'

export interface FcOverrideOption {
  partnerServiceId: string
  label: string
  eligible: boolean
  exclusionReason: string | null
  distanceMiles: number | null
}

export function FcOverrideControls({
  orderId,
  currentPartnerServiceId,
  goodsMoving,
  options,
}: {
  orderId: string
  currentPartnerServiceId: string | null
  goodsMoving: boolean
  options: FcOverrideOption[]
}) {
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [confirmIneligible, setConfirmIneligible] = useState(false)
  const [pending, start] = useTransition()

  if (goodsMoving) {
    return (
      <p className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-[12px] text-ink-600">
        Goods are already moving (a dispatch is shipped, in transit, or delivered) — the
        fulfillment center can no longer be changed.
      </p>
    )
  }

  const selected = options.find((o) => o.partnerServiceId === selectedId) ?? null
  const needsConfirm = selected !== null && !selected.eligible
  const disabled =
    pending ||
    !selected ||
    selected.partnerServiceId === currentPartnerServiceId ||
    (needsConfirm && (!confirmIneligible || reason.trim().length === 0))

  function submit() {
    if (!selected) return
    start(async () => {
      const res = await overrideFulfillmentCenter({
        orderId,
        partnerServiceId: selected.partnerServiceId,
        reason: reason.trim() || undefined,
        confirmIneligible: needsConfirm ? confirmIneligible : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Fulfillment center pinned to ${selected.label}.`)
      setSelectedId('')
      setReason('')
      setConfirmIneligible(false)
    })
  }

  return (
    <div className="space-y-2">
      <label className="block text-[12px] font-bold uppercase tracking-wider text-ink-700">
        Override fulfillment center
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value)
            setConfirmIneligible(false)
          }}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] font-normal normal-case tracking-normal text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <option value="">Select a warehouse partner…</option>
          {options.map((o) => (
            <option key={o.partnerServiceId} value={o.partnerServiceId}>
              {o.label}
              {o.partnerServiceId === currentPartnerServiceId ? ' · current' : ''}
              {o.distanceMiles !== null ? ` · ${o.distanceMiles.toLocaleString()} mi` : ''}
              {o.eligible ? '' : ` · INELIGIBLE — ${o.exclusionReason ?? 'unknown'}`}
            </option>
          ))}
        </select>
      </label>

      {selected && selected.partnerServiceId === currentPartnerServiceId && (
        <p className="text-[11.5px] text-ink-500">
          That fulfillment center is already assigned.
        </p>
      )}

      {needsConfirm && (
        <div className="rounded-lg border border-warning-200 bg-warning-50/60 p-2.5">
          <p className="text-[12px] font-semibold text-warning-900">
            Ineligible pick — {selected.exclusionReason ?? 'fails hard eligibility'}
          </p>
          <label className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-700">
            <input
              type="checkbox"
              checked={confirmIneligible}
              onChange={(e) => setConfirmIneligible(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600 focus-visible:ring-2 focus-visible:ring-pink-500"
            />
            I understand this node fails hard eligibility — pin it anyway
          </label>
        </div>
      )}

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={needsConfirm ? 'Reason (required for an ineligible pick — logged)' : 'Reason (optional — logged)'}
        rows={2}
        className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      />

      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="rounded-full bg-ink-900 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {pending ? 'Pinning…' : 'Pin fulfillment center'}
      </button>
    </div>
  )
}
