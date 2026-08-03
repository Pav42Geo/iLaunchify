'use client'

// FC settings client form — receiving spec + blackout dates (P1 §3.1.E).
// Restyled 2026-07-12 to the settings-hub prototype panels (panel-kit
// PanelCard/Fieldset/LRow + prototype toggle) — actions and logic unchanged.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarOff, Save, Trash2, Truck } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { Fieldset, LRow, PanelCard } from '@/components/panel-kit'
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

  const isWarehouse = serviceType === 'WAREHOUSE'

  return (
    <div className="space-y-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-500">
        {SERVICE_HEADING[serviceType] ?? serviceType}
      </p>
      <PanelCard>
        {/* Receiving spec — WAREHOUSE only */}
        {isWarehouse && (
          <Fieldset icon={<Truck />} title="Receiving requirements" hint="Travels with every inbound dispatch">
            <p className="mb-4 text-[12px] text-ink-500">
              Shown to producing partners on every dispatch shipping to your facility — clear specs
              prevent dock rejections and discrepancies.
            </p>
            <LRow
              className="mb-3.5"
              title="Delivery appointment required"
              sub="Drivers must book a dock slot before arriving."
              right={
                <Toggle
                  on={spec.appointmentRequired}
                  label="Delivery appointment required"
                  onClick={() =>
                    setSpec((s) => ({ ...s, appointmentRequired: !s.appointmentRequired }))
                  }
                />
              }
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              {spec.appointmentRequired && (
                <Field label="Appointment notice / booking method" className="sm:col-span-2">
                  <input
                    type="text"
                    value={spec.appointmentNotice}
                    onChange={(e) => setSpec((s) => ({ ...s, appointmentNotice: e.target.value }))}
                    placeholder="e.g. 48h notice — book via receiving@yourfc.com"
                    className={INP}
                  />
                </Field>
              )}
              <Field label="Receiving hours">
                <input
                  type="text"
                  value={spec.receivingHours}
                  onChange={(e) => setSpec((s) => ({ ...s, receivingHours: e.target.value }))}
                  placeholder="e.g. Mon–Fri 7:00–15:00 PT"
                  className={INP}
                />
              </Field>
              <Field label="Pallet spec">
                <input
                  type="text"
                  value={spec.palletSpec}
                  onChange={(e) => setSpec((s) => ({ ...s, palletSpec: e.target.value }))}
                  placeholder="e.g. GMA 48×40, max 60in stack height, stretch-wrapped, no double-stacking"
                  className={INP}
                />
              </Field>
              <Field label="Label placement" className="sm:col-span-2">
                <input
                  type="text"
                  value={spec.labelPlacement}
                  onChange={(e) => setSpec((s) => ({ ...s, labelPlacement: e.target.value }))}
                  placeholder="e.g. Pallet labels on two adjacent sides; carton labels top-right"
                  className={INP}
                />
              </Field>
              <Field label="Additional notes" className="sm:col-span-2">
                <textarea
                  value={spec.notes}
                  onChange={(e) => setSpec((s) => ({ ...s, notes: e.target.value }))}
                  rows={3}
                  maxLength={1000}
                  placeholder="Anything else drivers or shippers must know"
                  className={cn(INP, 'resize-y')}
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => saveReceivingSpec({ serviceId, spec }), 'Receiving spec saved')}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" /> {busy ? 'Saving…' : 'Save spec'}
              </button>
            </div>
          </Fieldset>
        )}

        {/* Blackout dates */}
        <Fieldset icon={<CalendarOff />} title="Blackout dates" hint="Routing treats these days as zero capacity">
          <p className="mb-4 text-[12px] text-ink-500">
            Windows when your facility can&apos;t receive or ship (closures, inventory counts,
            maintenance).
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="From">
              <input type="date" value={boStart} onChange={(e) => setBoStart(e.target.value)} className={INP} />
            </Field>
            <Field label="To">
              <input type="date" value={boEnd} onChange={(e) => setBoEnd(e.target.value)} className={INP} />
            </Field>
            <Field label="Reason (optional)" className="min-w-[180px] flex-1">
              <input
                type="text"
                value={boReason}
                onChange={(e) => setBoReason(e.target.value)}
                placeholder="e.g. Annual inventory count"
                className={INP}
              />
            </Field>
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
              className="inline-flex h-[41px] items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" /> Add window
            </button>
          </div>

          {blackouts.length === 0 ? (
            <p className="text-[12.5px] text-ink-500">No blackout windows scheduled.</p>
          ) : (
            blackouts.map((b) => (
              <LRow
                key={b.id}
                icon={<CalendarOff />}
                title={
                  <span className="tabular-nums">
                    {new Date(b.startsOn).toLocaleDateString()} → {new Date(b.endsOn).toLocaleDateString()}
                  </span>
                }
                sub={b.reason ?? undefined}
                right={
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => removeBlackoutDate({ blackoutId: b.id }), 'Blackout window removed')}
                    className="inline-flex items-center gap-1 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-900 transition-colors hover:border-danger-300 hover:text-danger-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
                  </button>
                }
              />
            ))
          )}
        </Fieldset>
      </PanelCard>
    </div>
  )
}

const INP =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all placeholder:text-ink-400 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400'

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  )
}

/** Prototype toggle (.toggle / .toggle.on) — w-10 track, 19px white knob. */
function Toggle({
  on,
  label,
  disabled,
  onClick,
}: {
  on: boolean
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-[23px] w-10 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        on ? 'bg-success-500' : 'bg-ink-300',
        disabled && 'cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[19px] w-[19px] rounded-full bg-white transition-all',
          on ? 'left-[19px]' : 'left-[2px]',
        )}
      />
    </button>
  )
}
