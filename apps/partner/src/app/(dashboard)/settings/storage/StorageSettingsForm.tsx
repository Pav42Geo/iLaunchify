'use client'

// Authoring form for the partner's storage offering (hold-at-manufacturer,
// docs/LOGISTICS_AND_FULFILLMENT.md §4). Money is entered in dollars and
// stored in cents. Restyled 2026-07-12 to the settings-hub prototype panels
// (panel-kit PanelCard/Fieldset/LRow + prototype toggle) — logic unchanged.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Package, Warehouse } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { Fieldset, LRow, PanelCard } from '@/components/panel-kit'
import { savePartnerStorageSettings, type StorageSettingsInput } from './actions'

// Display copy for the admin-approved rate bands (docs/LOGISTICS_AND_FULFILLMENT.md
// L9). The server action is the enforcement point — these are hints only.
const RATE_BAND_HINT: Record<string, string> = {
  PALLET_MONTH: '$5.00 – $150.00 per pallet per month (admin-approved band)',
  CUFT_MONTH: '$0.30 – $3.00 per cubic foot per month (admin-approved band)',
}

const STORAGE_CLASS_OPTS: { value: string; label: string; comingSoon: boolean }[] = [
  { value: 'AMBIENT', label: 'Ambient (shelf-stable)', comingSoon: false },
  { value: 'PROTECT_HEAT', label: 'Protect from heat (meltables)', comingSoon: false },
  { value: 'CHILLED', label: 'Chilled (refrigerated)', comingSoon: true },
  { value: 'FROZEN', label: 'Frozen', comingSoon: true },
]

/** Parse a dollars string into integer cents (null when blank/invalid). */
const cents = (v: string): number | null => {
  const trimmed = v.trim()
  if (trimmed === '') return null
  const n = Number.parseFloat(trimmed)
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : null
}

/** Render integer cents as a dollars input value. */
const dollars = (c: number | null): string => (c === null ? '' : (c / 100).toFixed(2))

const intOrNull = (v: string): number | null =>
  v.trim() === '' ? null : Math.max(0, Number.parseInt(v, 10) || 0)

export function StorageSettingsForm({
  serviceId,
  serviceLabel,
  initial,
}: {
  serviceId: string
  serviceLabel: string
  initial: StorageSettingsInput
}) {
  const [v, setV] = useState<StorageSettingsInput>(initial)
  const [pending, start] = useTransition()
  const set = <K extends keyof StorageSettingsInput>(k: K, val: StorageSettingsInput[K]) =>
    setV((prev) => ({ ...prev, [k]: val }))

  function toggleClass(value: string) {
    setV((prev) => ({
      ...prev,
      storageClasses: prev.storageClasses.includes(value)
        ? prev.storageClasses.filter((c) => c !== value)
        : [...prev.storageClasses, value],
    }))
  }

  function save() {
    start(async () => {
      const r = await savePartnerStorageSettings(serviceId, v)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Storage settings saved')
    })
  }

  const storageDisabled = !v.offersStorage

  return (
    <PanelCard>
      {/* Master toggle */}
      <LRow
        className="mb-[18px]"
        title={`Offer finished-goods storage on ${serviceLabel}`}
        sub="Creators can keep a production run at your facility and release or ship it on demand. Fees below are billed monthly through iLaunchify."
        right={
          <Toggle
            on={v.offersStorage}
            label={`Offer finished-goods storage on ${serviceLabel}`}
            onClick={() => set('offersStorage', !v.offersStorage)}
          />
        }
      />

      <Fieldset icon={<Warehouse />} title="Storage">
        <div className="flex flex-wrap gap-2">
          {STORAGE_CLASS_OPTS.map((opt) => {
            const checked = v.storageClasses.includes(opt.value)
            const disabled = storageDisabled || opt.comingSoon
            return (
              <label
                key={opt.value}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[12px] font-medium transition-colors',
                  checked
                    ? 'border-pink-100 bg-pink-50 text-pink-700'
                    : 'border-ink-200 bg-ink-50 text-ink-700 hover:bg-ink-100',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleClass(opt.value)}
                  className="sr-only"
                />
                {opt.label}
                {opt.comingSoon && (
                  <span className="rounded-full border border-warning-300 bg-warning-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-warning-700">
                    coming soon
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <p className="mb-4 mt-2 text-[11px] text-ink-500">
          Chilled and frozen storage are enabled per class by iLaunchify ops once the cold-chain rail
          is live — they can&apos;t be self-served yet.
        </p>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Billing unit">
            <select
              className={INP}
              disabled={storageDisabled}
              value={v.storageBillingUnit ?? ''}
              onChange={(e) =>
                set('storageBillingUnit', (e.target.value || null) as StorageSettingsInput['storageBillingUnit'])
              }
            >
              <option value="">—</option>
              <option value="PALLET_MONTH">Per pallet / month</option>
              <option value="CUFT_MONTH">Per cubic foot / month</option>
            </select>
          </Field>
          <Field
            label="Storage rate ($ per unit / month)"
            hint={v.storageBillingUnit ? RATE_BAND_HINT[v.storageBillingUnit] : undefined}
          >
            <input
              className={INP}
              type="number"
              min={0}
              step="0.01"
              disabled={storageDisabled}
              value={dollars(v.storageRateCents)}
              onChange={(e) => set('storageRateCents', cents(e.target.value))}
              placeholder="e.g. 15.00"
            />
          </Field>
          <Field label="Monthly minimum ($, optional)">
            <input
              className={INP}
              type="number"
              min={0}
              step="0.01"
              disabled={storageDisabled}
              value={dollars(v.storageMinMonthlyCents)}
              onChange={(e) => set('storageMinMonthlyCents', cents(e.target.value))}
              placeholder="e.g. 150.00"
            />
          </Field>
          <Field label="Free grace period (business days)" hint="Industry norm ~10 business days after production delivery.">
            <input
              className={INP}
              type="number"
              min={0}
              disabled={storageDisabled}
              value={v.storageFreeGraceDays ?? ''}
              onChange={(e) => set('storageFreeGraceDays', intOrNull(e.target.value))}
              placeholder="10"
            />
          </Field>
          <Field label="Max dwell (days, optional)" hint="Your aging policy — how long stock may sit before it must move.">
            <input
              className={INP}
              type="number"
              min={0}
              disabled={storageDisabled}
              value={v.maxDwellDays ?? ''}
              onChange={(e) => set('maxDwellDays', intOrNull(e.target.value))}
              placeholder="e.g. 365"
            />
          </Field>
        </div>
      </Fieldset>

      <Fieldset icon={<Package />} title="Ship-on-demand">
        <LRow
          title="We can ship parcels"
          sub="Individual boxes via UPS/FedEx/USPS — not just palletized freight. Required for ship-on-demand."
          right={
            <Toggle
              on={v.canShipParcel}
              label="We can ship parcels"
              onClick={() => {
                const on = !v.canShipParcel
                setV((prev) => ({ ...prev, canShipParcel: on, onDemandEnabled: on ? prev.onDemandEnabled : false }))
              }}
            />
          }
        />
        <LRow
          className={v.canShipParcel ? undefined : 'opacity-50'}
          title="Offer ship-on-demand"
          sub="Hold a creator's stock and pick/pack/ship individual orders as they come in."
          right={
            <Toggle
              on={v.onDemandEnabled}
              disabled={!v.canShipParcel}
              label="Offer ship-on-demand"
              onClick={() => set('onDemandEnabled', !v.onDemandEnabled)}
            />
          }
        />
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          <Field label="Pick fee ($ per pick, optional)">
            <input
              className={INP}
              type="number"
              min={0}
              step="0.01"
              value={dollars(v.pickFeeCents)}
              onChange={(e) => set('pickFeeCents', cents(e.target.value))}
              placeholder="e.g. 1.80"
            />
          </Field>
          <Field label="Pack fee ($ per package, optional)">
            <input
              className={INP}
              type="number"
              min={0}
              step="0.01"
              value={dollars(v.packFeeCents)}
              onChange={(e) => set('packFeeCents', cents(e.target.value))}
              placeholder="e.g. 0.95"
            />
          </Field>
        </div>
      </Fieldset>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save storage settings'}
        </button>
        <span className="text-[12px] text-ink-500">
          Rates apply to new storage agreements — existing agreements keep their fee snapshot.
        </span>
      </div>
    </PanelCard>
  )
}

const INP =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all placeholder:text-ink-400 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-ink-500">{hint}</span>}
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
