'use client'

// Etsy-pattern quick-ship (Pavel 2026-07-14): mark a READY dispatch shipped
// straight from the orders list — a small dialog with tracking + carrier
// (format auto-detect), calling the SAME audited, document-gated shipDispatch
// action as the dispatch detail. If the leg needs more (missing shipping docs,
// freight seal, cold-chain coolant), the server refuses and the toast points
// to the dispatch page — the quick path never bypasses a gate.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Truck, X } from 'lucide-react'
import { Button } from '@ilaunchify/ui'
import { shipDispatch } from './[dispatchId]/actions'
import { CarrierTrackingFields } from './CarrierTrackingFields'

export function QuickShipButton({ dispatchId, label }: { dispatchId: string; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const r = await shipDispatch({ dispatchId, trackingCarrier: carrier, trackingNumber: tracking })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Marked shipped — payout queued')
      setOpen(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700"
      >
        <Truck className="h-3.5 w-3.5" aria-hidden="true" />
        Mark shipped
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Mark ${label} shipped`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-5 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false)
          }}
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-6 text-left shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-[17px] font-bold text-ink-900">Mark shipped</h2>
            <p className="mt-1 text-[12.5px] text-ink-500">
              {label} · shipping on your own carrier. Tracking is optional but feeds your on-time
              record.
            </p>
            <div className="mt-4 space-y-3">
              <CarrierTrackingFields
                idPrefix={`qs-${dispatchId}`}
                carrier={carrier}
                tracking={tracking}
                onCarrierChange={setCarrier}
                onTrackingChange={setTracking}
              />
            </div>
            <Button className="mt-4 w-full" onClick={submit} disabled={busy}>
              {busy ? 'Confirming…' : 'Confirm shipment'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
