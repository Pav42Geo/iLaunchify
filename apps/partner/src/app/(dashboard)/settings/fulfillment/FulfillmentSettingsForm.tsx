'use client'

// FC settings client form — receiving spec + blackout dates (P1 §3.1.E).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarOff, Save, Trash2 } from 'lucide-react'
import {
  saveReceivingSpec,
  addBlackoutDate,
  removeBlackoutDate,
  type ReceivingSpecInput,
} from './actions'

export interface BlackoutRow {
  id: string
  startsOn: string // ISO
  endsOn: string
  reason: string | null
}

const SERVICE_HEADING: Record<string, string> = {
  WAREHOUSE: 'Fulfillment Center service',
  MANUFACTURING: 'Manufacturing service',
  COPACKING: 'Co-packing service',
  LABEL_PRINTING: 'Print production service',
}

export function FulfillmentSettingsForm({
  serviceId,
  serviceType,
  initialSpec,
  blackouts,
}: {
  serviceId: string
  serviceType: string
  initialSpec: Partial<ReceivingSpecInput>
  blackouts: BlackoutRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [spec, setSpec] = useState<ReceivingSpecInput>({
    appointmentRequired: initialSpec.appointmentRequired ?? false,
    appointmentNotice: initialSpec.appointmentNotice ?? '',
    receivingHours: initialSpec.receivingHours ?? '',
    palletSpec: initialSpec.palletSpec ?? '',
    labelPlacement: initialSpec.labelPlacement ?? '',
    notes: initialSpec.notes ?? '',
  })
  const [boStart, setBoStart] = useState('')
  const [boEnd, setBoEnd] = useState('')
  const [boReason, setBoReason] = useState('')

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okMsg: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(okMsg)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'

  const isWarehouse = serviceType === 'WAREHOUSE'

  return (
    <div className="space-y-6">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">
        {SERVICE_HEADING[serviceType] ?? serviceType}
      </p>
      {/* Receiving spec — WAREHOUSE only */}
      {isWarehouse && (
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Receiving requirements</h2>
          <p className="text-[12px] text-ink-600">
            Shown to producing partners on every dispatch shipping to your facility — clear specs
            prevent dock rejections and discrepancies.
          </p>
        </header>
        <div className="space-y-4 px-5 py-4">
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink-800">
            <input
              type="checkbox"
              checked={spec.appointmentRequired}
              onChange={(e) => setSpec((s) => ({ ...s, appointmentRequired: e.target.checked }))}
              className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
            />
            Delivery appointment required
          </label>
          {spec.appointmentRequired && (
            <label className="block text-[12px] font-medium text-ink-700">
              Appointment notice / booking method
              <input
                type="text"
                value={spec.appointmentNotice}
                onChange={(e) => setSpec((s) => ({ ...s, appointmentNotice: e.target.value }))}
                placeholder="e.g. 48h notice — book via receiving@yourfc.com"
                className={inputCls}
              />
            </label>
          )}
          <label className="block text-[12px] font-medium text-ink-700">
            Receiving hours
            <input
              type="text"
              value={spec.receivingHours}
              onChange={(e) => setSpec((s) => ({ ...s, receivingHours: e.target.value }))}
              placeholder="e.g. Mon–Fri 7:00–15:00 PT"
              className={inputCls}
            />
          </label>
          <label className="block text-[12px] font-medium text-ink-700">
            Pallet spec
            <input
              type="text"
              value={spec.palletSpec}
              onChange={(e) => setSpec((s) => ({ ...s, palletSpec: e.target.value }))}
              placeholder="e.g. GMA 48×40, max 60in stack height, stretch-wrapped, no double-stacking"
              className={inputCls}
            />
          </label>
          <label className="block text-[12px] font-medium text-ink-700">
            Label placement
            <input
              type="text"
              value={spec.labelPlacement}
              onChange={(e) => setSpec((s) => ({ ...s, labelPlacement: e.target.value }))}
              placeholder="e.g. Pallet labels on two adjacent sides; carton labels top-right"
              className={inputCls}
            />
          </label>
          <label className="block text-[12px] font-medium text-ink-700">
            Additional notes
            <textarea
              value={spec.notes}
              onChange={(e) => setSpec((s) => ({ ...s, notes: e.target.value }))}
              rows={3}
              maxLength={1000}
              placeholder="Anything else drivers or shippers must know"
              className={inputCls}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => saveReceivingSpec({ serviceId, spec }), 'Receiving spec saved')}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Saving…' : 'Save spec'}
            </button>
          </div>
        </div>
      </section>
      )}

      {/* Blackout dates */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Blackout dates</h2>
          <p className="text-[12px] text-ink-600">
            Windows when your facility can&apos;t receive or ship (closures, inventory counts,
            maintenance). Routing treats these days as zero capacity.
          </p>
        </header>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] font-medium text-ink-700">
              From
              <input type="date" value={boStart} onChange={(e) => setBoStart(e.target.value)} className={inputCls} />
            </label>
            <label className="text-[12px] font-medium text-ink-700">
              To
              <input type="date" value={boEnd} onChange={(e) => setBoEnd(e.target.value)} className={inputCls} />
            </label>
            <label className="min-w-[180px] flex-1 text-[12px] font-medium text-ink-700">
              Reason (optional)
              <input
                type="text"
                value={boReason}
                onChange={(e) => setBoReason(e.target.value)}
                placeholder="e.g. Annual inventory count"
                className={inputCls}
              />
            </label>
            <button
              type="button"
              disabled={busy || !boStart || !boEnd}
              onClick={() =>
                run(async () => {
                  const r = await addBlackoutDate({ serviceId, startsOn: boStart, endsOn: boEnd, reason: boReason })
                  if (r.ok) {
                    setBoStart('')
                    setBoEnd('')
                    setBoReason('')
                  }
                  return r
                }, 'Blackout window added')
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" /> Add window
            </button>
          </div>

          {blackouts.length === 0 ? (
            <p className="text-[12.5px] text-ink-500">No blackout windows scheduled.</p>
          ) : (
            <ul className="divide-y divide-ink-50 rounded-xl border border-ink-100">
              {blackouts.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                  <span className="tabular-nums font-medium text-ink-900">
                    {new Date(b.startsOn).toLocaleDateString()} → {new Date(b.endsOn).toLocaleDateString()}
                  </span>
                  {b.reason && <span className="text-ink-500">· {b.reason}</span>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => removeBlackoutDate({ blackoutId: b.id }), 'Blackout window removed')}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition-colors hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
