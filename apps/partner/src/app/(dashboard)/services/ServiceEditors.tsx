'use client'

// Per-service capability editors — the real port of
// design/partner-services-prototype-tokens.html (Pavel 2026-07-13).
//
// HARD RULES (Pavel): read REAL data only; an empty field stays empty (no
// invented defaults like the old form's `?? 500`); saves MERGE into the
// capabilities JSON so keys an editor doesn't surface are never dropped;
// typed storage/appliesLabels columns write through their own actions.
// Every card has an explicit Save button with dirty/saving/saved states.

import { useState, useTransition } from 'react'
import { cn } from '@ilaunchify/ui'
import { Check, Layers, Loader2, Truck, Warehouse } from 'lucide-react'
import { saveStorageOffering, type SaveResult } from './actions'

// ---------------------------------------------------------------------------
// Option catalogs — value = the stored enum-ish string, label = display.
// Values follow the existing capability conventions (MFG_CAPS / COPACK_CAPS /
// ContainerCategory / StorageClass) — no new spellings invented.
// ---------------------------------------------------------------------------

// (MANUFACTURING + PRINT option lists retired 2026-07-20 with the ManufacturingEditor
// and PrintEditor — they now live in their respective service builders.)
const STORAGE_CLASS_OPTS = [
  { v: 'AMBIENT', l: 'Ambient' },
  { v: 'PROTECT_HEAT', l: 'Protect from heat' },
  { v: 'CHILLED', l: 'Chilled' },
  { v: 'FROZEN', l: 'Frozen' },
]

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const inputCls =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-[13px] text-ink-900 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

/** '' → undefined (don't write); number string → number. */
const parseNum = (s: string): number | undefined | null => {
  const t = s.trim()
  if (t === '') return null // explicit clear
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function ChipGroup({
  opts,
  value,
  onChange,
}: {
  opts: { v: string; l: string }[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = value.includes(o.v)
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}
            className={cn(
              'rounded-full border px-2.5 py-[5px] text-[12px] font-medium transition-all',
              on
                ? 'border-success-200 bg-success-50 font-semibold text-success-700'
                : 'border-ink-200 bg-ink-50 text-ink-700 hover:border-ink-300',
            )}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative h-[23px] w-10 flex-none rounded-full transition-colors',
        on ? 'bg-success-500' : 'bg-ink-300',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-[19px] w-[19px] rounded-full bg-white transition-all',
          on ? 'left-[19px]' : 'left-0.5',
        )}
      />
    </button>
  )
}

function FieldsetBox({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4 rounded-2xl border border-ink-200 p-[18px] last:mb-0">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-pink-50 text-pink-700 [&>svg]:h-[15px] [&>svg]:w-[15px]">
          {icon}
        </span>
        <h4 className="font-display text-[14.5px] font-bold text-ink-900">{title}</h4>
        {hint && <span className="ml-auto text-[11px] text-ink-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function FieldL({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-ink-700">{label}</label>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink-500">{help}</p>}
    </div>
  )
}

function RouteTags({ tags }: { tags: string[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2 py-[2px] text-[10.5px] font-semibold text-ink-600"
        >
          <span className="text-pink-500">→</span>
          {t}
        </span>
      ))}
    </div>
  )
}

function SaveBar({
  dirty,
  pending,
  error,
  onSave,
}: {
  dirty: boolean
  pending: boolean
  error: string | null
  onSave: () => void
}) {
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-3.5">
      <span className="text-[12px] text-ink-500">
        {pending ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
      </span>
      {error && <span className="text-[12px] font-semibold text-danger-500">{error}</span>}
      <button
        type="button"
        disabled={pending || !dirty}
        onClick={onSave}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Save changes
      </button>
    </div>
  )
}

function useSave() {
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const run = (fn: () => Promise<SaveResult>) => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fn()
        if (res.ok) setDirty(false)
        else setError(res.error)
      } catch (err) {
        setError(`Save failed: ${(err as Error).message || 'network error'}`)
      }
    })
  }
  return { dirty, setDirty, error, pending, run }
}

// ---------------------------------------------------------------------------
// ① MANUFACTURING — RETIRED 2026-07-20. The per-capability editor was folded into
// the full manufacturing service builder (apps/.../services/manufacturing), which is
// now the single surface for scope, formulation, samples, runs/capacity, batches and
// commercial defaults. The Services page links to it (CTA-only, like co-packing).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ④ STORAGE AT YOUR FACILITY — typed columns on a PRODUCING service.
// Explicitly NOT the 3PL/FC WAREHOUSE service.
// ---------------------------------------------------------------------------

export interface StorageTypedVM {
  offersStorage: boolean
  storageClasses: string[]
  maxDwellDays: number | null
  storageBillingUnit: string | null
  storageRateCents: number | null
  storageFreeGraceDays: number | null
  storageMinMonthlyCents: number | null
  canShipParcel: boolean
  onDemandEnabled: boolean
  pickFeeCents: number | null
  packFeeCents: number | null
}

export function StorageEditor({ serviceId, initial }: { serviceId: string; initial: StorageTypedVM }) {
  const [f, setF] = useState({
    offersStorage: initial.offersStorage,
    storageClasses: initial.storageClasses,
    maxDwellDays: initial.maxDwellDays != null ? String(initial.maxDwellDays) : '',
    storageBillingUnit: initial.storageBillingUnit ?? '',
    storageRate: initial.storageRateCents != null ? (initial.storageRateCents / 100).toFixed(2) : '',
    storageFreeGraceDays: initial.storageFreeGraceDays != null ? String(initial.storageFreeGraceDays) : '',
    storageMinMonthly:
      initial.storageMinMonthlyCents != null ? (initial.storageMinMonthlyCents / 100).toFixed(2) : '',
    canShipParcel: initial.canShipParcel,
    onDemandEnabled: initial.onDemandEnabled,
    pickFee: initial.pickFeeCents != null ? (initial.pickFeeCents / 100).toFixed(2) : '',
    packFee: initial.packFeeCents != null ? (initial.packFeeCents / 100).toFixed(2) : '',
  })
  const s = useSave()
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    s.setDirty(true)
  }

  const dollarsToCents = (v: string): number | null | undefined => {
    const n = parseNum(v)
    if (n === undefined || n === null) return n
    return Math.round(n * 100)
  }

  const save = () =>
    s.run(() =>
      saveStorageOffering(serviceId, {
        offersStorage: f.offersStorage,
        storageClasses: f.storageClasses,
        maxDwellDays: parseNum(f.maxDwellDays),
        storageBillingUnit: f.storageBillingUnit || null,
        storageRateCents: dollarsToCents(f.storageRate),
        storageFreeGraceDays: parseNum(f.storageFreeGraceDays),
        storageMinMonthlyCents: dollarsToCents(f.storageMinMonthly),
        canShipParcel: f.canShipParcel,
        onDemandEnabled: f.onDemandEnabled,
        pickFeeCents: dollarsToCents(f.pickFee),
        packFeeCents: dollarsToCents(f.packFee),
      }),
    )

  return (
    <div>
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning-100 bg-warning-50 px-3.5 py-3 text-[12.5px] text-warning-700">
        <Warehouse className="mt-0.5 h-4 w-4 flex-none" />
        <span>
          <b>This is storage at YOUR plant — not a fulfillment center.</b> It powers the
          creator&rsquo;s &ldquo;Hold at manufacturer&rdquo; checkout option. Fulfillment Centers
          are separate 3PL partners with a WAREHOUSE service — this never enters the FC network.
        </span>
      </div>

      <div className="mb-4 flex items-center gap-3.5 rounded-xl border border-ink-200 px-4 py-3">
        <div>
          <div className="text-[13.5px] font-semibold text-ink-900">Offer storage to creators</div>
          <div className="text-[11.5px] text-ink-500">
            Show &ldquo;Hold at manufacturer&rdquo; as a destination on your production orders
          </div>
        </div>
        <div className="ml-auto">
          <Toggle on={f.offersStorage} onClick={() => set('offersStorage', !f.offersStorage)} />
        </div>
      </div>

      {f.offersStorage && (
        <>
          <FieldsetBox icon={<Layers />} title="What you can hold" hint="storageClasses · maxDwellDays">
            <FieldL
              label="Storage classes"
              help="Cold classes are admin-gated platform-wide (Logistics → Gates) — enabling them here still respects that gate."
            >
              <ChipGroup
                opts={STORAGE_CLASS_OPTS}
                value={f.storageClasses}
                onChange={(v) => set('storageClasses', v)}
              />
            </FieldL>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:w-1/2">
              <FieldL label="Max dwell (days)">
                <input
                  value={f.maxDwellDays}
                  onChange={(e) => set('maxDwellDays', e.target.value)}
                  className={inputCls}
                />
              </FieldL>
            </div>
            <RouteTags tags={['Checkout destination card', 'Shelf-life vs dwell check']} />
          </FieldsetBox>

          <FieldsetBox icon={<Truck />} title="Storage billing" hint="storage-accrual math">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FieldL label="Billing unit">
                <select
                  value={f.storageBillingUnit}
                  onChange={(e) => set('storageBillingUnit', e.target.value)}
                  className={inputCls}
                >
                  <option value="">Not set</option>
                  <option value="PALLET_MONTH">Pallet / month</option>
                  <option value="CUFT_MONTH">Cubic ft / month</option>
                </select>
              </FieldL>
              <FieldL label="Rate ($)">
                <input value={f.storageRate} onChange={(e) => set('storageRate', e.target.value)} className={inputCls} />
              </FieldL>
              <FieldL label="Free grace (days)">
                <input
                  value={f.storageFreeGraceDays}
                  onChange={(e) => set('storageFreeGraceDays', e.target.value)}
                  className={inputCls}
                />
              </FieldL>
              <FieldL label="Monthly minimum ($)">
                <input
                  value={f.storageMinMonthly}
                  onChange={(e) => set('storageMinMonthly', e.target.value)}
                  className={inputCls}
                />
              </FieldL>
            </div>
            <RouteTags tags={['Storage accrual (creator invoice)']} />
          </FieldsetBox>

          <FieldsetBox icon={<Truck />} title="Shipping out of storage" hint="canShipParcel · onDemandEnabled">
            <div className="flex items-center gap-3.5 border-b border-ink-100 pb-3">
              <div>
                <div className="text-[13px] font-semibold text-ink-900">We can ship parcels</div>
                <div className="text-[11.5px] text-ink-500">
                  Individual orders leave your dock via EasyPost-rated carriers
                </div>
              </div>
              <div className="ml-auto">
                <Toggle on={f.canShipParcel} onClick={() => set('canShipParcel', !f.canShipParcel)} />
              </div>
            </div>
            <div className="flex items-center gap-3.5 pt-3">
              <div>
                <div className="text-[13px] font-semibold text-ink-900">On-demand enablement</div>
                <div className="text-[11.5px] text-ink-500">
                  Creators&rsquo; channel orders auto-dispatch from your held stock
                </div>
              </div>
              <div className="ml-auto">
                <Toggle
                  on={f.onDemandEnabled}
                  onClick={() => set('onDemandEnabled', !f.onDemandEnabled)}
                />
              </div>
            </div>
            {f.onDemandEnabled && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 sm:w-1/2">
                <FieldL label="Pick fee ($ / parcel)">
                  <input value={f.pickFee} onChange={(e) => set('pickFee', e.target.value)} className={inputCls} />
                </FieldL>
                <FieldL label="Pack fee ($ / parcel)">
                  <input value={f.packFee} onChange={(e) => set('packFee', e.target.value)} className={inputCls} />
                </FieldL>
              </div>
            )}
            <RouteTags tags={['On-demand channel orders', 'EasyPost rate shop']} />
          </FieldsetBox>
        </>
      )}

      <SaveBar dirty={s.dirty} pending={s.pending} error={s.error} onSave={save} />
    </div>
  )
}
