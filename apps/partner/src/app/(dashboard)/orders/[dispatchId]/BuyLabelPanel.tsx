'use client'

// Phase L2a — "Buy label with iLaunchify shipping" (spec §6). Renders inside
// the READY ship panel when the server says the EasyPost rail is live
// (LogisticsSetting gate + env key + doc gate — all booleans computed
// server-side; the key never reaches the client).
//
// Flow: parcel dims → getLabelQuotes (top 3 eligible rates, cheapest
// recommended, NO margin) → pick → buyLabel → tracking auto-prefills the
// mark-shipped form via onPurchased. The partner still confirms shipDispatch
// themselves — buying a label does NOT flip the dispatch.

import { Button, Input, Label } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  getLabelQuotes,
  buyLabel,
  type LabelQuoteView,
  type PurchasedLabelView,
} from './label-actions'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function BuyLabelPanel({
  dispatchId,
  onPurchased,
}: {
  dispatchId: string
  onPurchased: (label: PurchasedLabelView) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lengthIn, setLengthIn] = useState('')
  const [widthIn, setWidthIn] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weightLb, setWeightLb] = useState('')
  const [quotes, setQuotes] = useState<LabelQuoteView[] | null>(null)
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null)
  const [purchased, setPurchased] = useState<PurchasedLabelView | null>(null)

  const dims = {
    lengthIn: Number(lengthIn),
    widthIn: Number(widthIn),
    heightIn: Number(heightIn),
    weightLb: Number(weightLb),
  }
  const dimsValid = Object.values(dims).every((v) => Number.isFinite(v) && v > 0)

  async function fetchQuotes() {
    if (!dimsValid) {
      toast.error('Enter parcel length, width, height, and weight (all > 0).')
      return
    }
    setBusy(true)
    setQuotes(null)
    setSelectedRateId(null)
    try {
      const r = await getLabelQuotes({ dispatchId, parcel: dims })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      if (r.quotes.length === 0) {
        toast.error('No rates available for this parcel.')
        return
      }
      setQuotes(r.quotes)
      setSelectedRateId(r.quotes.find((q) => q.recommended)?.externalRateId ?? r.quotes[0]?.externalRateId ?? null)
    } finally {
      setBusy(false)
    }
  }

  async function purchase() {
    const quote = quotes?.find((q) => q.externalRateId === selectedRateId)
    if (!quote) {
      toast.error('Pick a rate first.')
      return
    }
    setBusy(true)
    try {
      const r = await buyLabel({
        dispatchId,
        externalShipmentId: quote.externalShipmentId,
        externalRateId: quote.externalRateId,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      setPurchased(r.label)
      onPurchased(r.label)
      toast.success(`Label bought — ${r.label.carrier} ${r.label.trackingNumber}`)
    } finally {
      setBusy(false)
    }
  }

  if (purchased) {
    return (
      <div className="space-y-2 rounded-md border border-success-200 bg-success-50/50 p-3">
        <p className="text-[12.5px] font-semibold text-success-800">Label purchased</p>
        <p className="text-[12px] text-ink-700">
          {purchased.carrier} {purchased.service} · {dollars(purchased.costCents)}
        </p>
        <p className="font-mono text-[12px] text-ink-700">{purchased.trackingNumber}</p>
        <div className="flex flex-wrap gap-3 text-[12px] font-semibold">
          <a
            href={purchased.labelUrl}
            target="_blank"
            rel="noreferrer"
            className="text-pink-700 underline hover:text-pink-800"
          >
            Download label
          </a>
          {purchased.publicTrackingUrl && (
            <a
              href={purchased.publicTrackingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-pink-700 underline hover:text-pink-800"
            >
              Track
            </a>
          )}
        </div>
        <p className="text-[10.5px] text-ink-500">
          Tracking is prefilled below — confirm the shipment once the parcel physically leaves.
        </p>
      </div>
    )
  }

  if (!expanded) {
    return (
      <div className="rounded-md border border-ink-200 bg-ink-50/50 p-3">
        <p className="text-[12.5px] font-semibold text-ink-800">iLaunchify shipping</p>
        <p className="mt-0.5 text-[11.5px] text-ink-500">
          No carrier account? Buy a discounted parcel label here — tracking fills in automatically.
        </p>
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setExpanded(true)} disabled={busy}>
          Buy label with iLaunchify shipping
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-ink-200 bg-ink-50/50 p-3">
      <p className="text-[12.5px] font-semibold text-ink-800">Buy label — parcel details</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor="parcel-l" className="text-[11px]">L (in)</Label>
          <Input id="parcel-l" type="number" min={0.1} step={0.1} value={lengthIn} onChange={(e) => setLengthIn(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="parcel-w" className="text-[11px]">W (in)</Label>
          <Input id="parcel-w" type="number" min={0.1} step={0.1} value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="parcel-h" className="text-[11px]">H (in)</Label>
          <Input id="parcel-h" type="number" min={0.1} step={0.1} value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="parcel-wt" className="text-[11px]">Weight (lb)</Label>
        <Input id="parcel-wt" type="number" min={0.1} step={0.1} value={weightLb} onChange={(e) => setWeightLb(e.target.value)} />
      </div>
      <Button className="w-full" onClick={fetchQuotes} disabled={busy || !dimsValid}>
        {quotes ? 'Refresh rates' : 'Get rates'}
      </Button>

      {quotes && (
        <div className="space-y-1.5">
          {quotes.map((q) => (
            <label
              key={q.externalRateId}
              className={`flex cursor-pointer items-center gap-2 rounded border p-2 text-[12.5px] transition-colors ${
                selectedRateId === q.externalRateId
                  ? 'border-pink-500 bg-pink-50/60'
                  : 'border-ink-200 bg-white hover:bg-ink-50'
              }`}
            >
              <input
                type="radio"
                name="label-rate"
                checked={selectedRateId === q.externalRateId}
                onChange={() => setSelectedRateId(q.externalRateId)}
              />
              <span className="flex-1">
                <span className="font-medium text-ink-900">
                  {q.carrier} {q.service}
                </span>
                <span className="block text-[11px] text-ink-500">
                  {q.transitDays !== null ? `~${q.transitDays}d transit` : 'transit unknown'}
                  {q.recommended && <span className="ml-1.5 font-semibold text-pink-700">Recommended</span>}
                </span>
              </span>
              <span className="font-semibold tabular-nums text-ink-900">{dollars(q.rateCents)}</span>
            </label>
          ))}
          <Button className="w-full" onClick={purchase} disabled={busy || !selectedRateId}>
            Buy label
            {selectedRateId
              ? ` · ${dollars(quotes.find((q) => q.externalRateId === selectedRateId)?.rateCents ?? 0)}`
              : ''}
          </Button>
        </div>
      )}

      <Button variant="ghost" className="w-full" onClick={() => setExpanded(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  )
}
