'use client'

// CarrierServiceRule create/edit form (Phase L2). Simple full-field form —
// storage classes + hazmat as checkbox groups, priority number, active toggle.
// Server actions (actions.ts) re-validate everything with zod against the
// hardcoded enum lists; this form is convenience, not the fence.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import {
  SHIPMENT_MODES,
  STORAGE_CLASSES,
  HAZMAT_CLASSES,
  STORAGE_CLASS_LABEL,
  HAZMAT_LABEL,
  type HazmatClassKey,
  type ShipmentModeKey,
  type StorageClassKey,
} from './carrier-enums'
import { createCarrierRule, updateCarrierRule, type CarrierRuleInput } from './actions'

export interface CarrierRuleFormValues {
  carrier: string
  serviceLevel: string
  modes: string[]
  storageClasses: string[]
  hazmatAllowed: string[]
  maxWeightLb: number | null
  maxTransitDays: number | null
  groundOnly: boolean
  seasonalWindowJson: string | null
  priority: number
  active: boolean
}

const EMPTY: CarrierRuleFormValues = {
  carrier: '',
  serviceLevel: '',
  modes: ['PARCEL'],
  storageClasses: ['AMBIENT'],
  hazmatAllowed: [],
  maxWeightLb: null,
  maxTransitDays: null,
  groundOnly: false,
  seasonalWindowJson: null,
  priority: 100,
  active: true,
}

export function CarrierRuleForm({
  ruleId,
  initial,
}: {
  /** Present = edit mode; absent = create mode. */
  ruleId?: string
  initial?: CarrierRuleFormValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<CarrierRuleFormValues>(initial ?? EMPTY)

  function set<K extends keyof CarrierRuleFormValues>(key: K, value: CarrierRuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleIn(key: 'modes' | 'storageClasses' | 'hazmatAllowed', value: string) {
    setValues((v) => {
      const list = v[key]
      return {
        ...v,
        [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
      }
    })
  }

  function submit() {
    setError(null)
    const input: CarrierRuleInput = {
      carrier: values.carrier,
      serviceLevel: values.serviceLevel,
      modes: values.modes.filter((m): m is ShipmentModeKey =>
        (SHIPMENT_MODES as readonly string[]).includes(m),
      ),
      storageClasses: values.storageClasses.filter((c): c is StorageClassKey =>
        (STORAGE_CLASSES as readonly string[]).includes(c),
      ),
      hazmatAllowed: values.hazmatAllowed.filter((h): h is HazmatClassKey =>
        (HAZMAT_CLASSES as readonly string[]).includes(h),
      ),
      maxWeightLb: values.maxWeightLb,
      maxTransitDays: values.maxTransitDays,
      groundOnly: values.groundOnly,
      seasonalWindowJson: values.seasonalWindowJson?.trim() ? values.seasonalWindowJson : null,
      priority: values.priority,
      active: values.active,
    }
    startTransition(async () => {
      const result = ruleId ? await updateCarrierRule(ruleId, input) : await createCarrierRule(input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push('/logistics/carriers')
      router.refresh()
    })
  }

  return (
    <div className="max-w-2xl space-y-5 rounded-2xl border border-ink-200 bg-white p-6">
      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] text-danger-800">
          {error}
        </div>
      )}

      {/* Carrier + service level */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Carrier" hint='EasyPost carrier name, e.g. "UPS", "FedEx", "USPS"'>
          <input
            type="text"
            value={values.carrier}
            onChange={(e) => set('carrier', e.target.value)}
            placeholder="FedEx"
            className={inputCls}
          />
        </Field>
        <Field label="Service level" hint='Rule key, e.g. "GROUND", "2DAY", "OVERNIGHT"'>
          <input
            type="text"
            value={values.serviceLevel}
            onChange={(e) => set('serviceLevel', e.target.value.toUpperCase())}
            placeholder="GROUND"
            className={inputCls}
          />
        </Field>
      </div>

      {/* Modes */}
      <CheckboxGroup
        label="Shipment modes"
        hint="Which movement modes this service may carry."
      >
        {SHIPMENT_MODES.map((m) => (
          <CheckboxChip
            key={m}
            checked={values.modes.includes(m)}
            onChange={() => toggleIn('modes', m)}
            label={m}
          />
        ))}
      </CheckboxGroup>

      {/* Storage classes */}
      <CheckboxGroup
        label="Storage classes"
        hint="HARD filter — a shipment whose class isn't listed here never matches this rule, whatever the price."
      >
        {STORAGE_CLASSES.map((c) => (
          <CheckboxChip
            key={c}
            checked={values.storageClasses.includes(c)}
            onChange={() => toggleIn('storageClasses', c)}
            label={STORAGE_CLASS_LABEL[c]}
          />
        ))}
      </CheckboxGroup>

      {/* Hazmat */}
      <CheckboxGroup
        label="Hazmat allowed"
        hint="Leave everything unchecked for NONE-only (non-hazmat shipments)."
      >
        {HAZMAT_CLASSES.map((h) => (
          <CheckboxChip
            key={h}
            checked={values.hazmatAllowed.includes(h)}
            onChange={() => toggleIn('hazmatAllowed', h)}
            label={HAZMAT_LABEL[h]}
          />
        ))}
      </CheckboxGroup>

      {/* Numeric constraints */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Max weight (lb)" hint="Blank = no cap">
          <input
            type="number"
            min={1}
            value={values.maxWeightLb ?? ''}
            onChange={(e) =>
              set('maxWeightLb', e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
            }
            className={inputCls}
          />
        </Field>
        <Field label="Max transit (days)" hint="Frozen parcel ⇒ ≤2">
          <input
            type="number"
            min={1}
            value={values.maxTransitDays ?? ''}
            onChange={(e) =>
              set(
                'maxTransitDays',
                e.target.value === '' ? null : Number.parseInt(e.target.value, 10),
              )
            }
            className={inputCls}
          />
        </Field>
        <Field label="Priority" hint="Lower = tried first (fallback chain)">
          <input
            type="number"
            min={0}
            value={values.priority}
            onChange={(e) => set('priority', Number.parseInt(e.target.value, 10) || 0)}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Seasonal window */}
      <Field
        label="Seasonal window (JSON, optional)"
        hint='e.g. {"frozenShipDays":[1,2,3]} or {"meltablePause":{"from":"04-15","to":"10-15"}}'
      >
        <textarea
          value={values.seasonalWindowJson ?? ''}
          onChange={(e) => set('seasonalWindowJson', e.target.value || null)}
          rows={3}
          className={cn(inputCls, 'h-auto py-2 font-mono text-[12px]')}
        />
      </Field>

      {/* Toggles */}
      <div className="flex flex-wrap gap-6">
        <ToggleField
          label="Ground-only service"
          hint="LQ flammables / aerosols may only route to ground-capable rules."
          checked={values.groundOnly}
          onChange={(v) => set('groundOnly', v)}
        />
        <ToggleField
          label="Active"
          hint="Inactive rules are ignored by the eligibility engine."
          checked={values.active}
          onChange={(v) => set('active', v)}
        />
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          {pending ? 'Saving…' : ruleId ? 'Save rule' : 'Create rule'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/logistics/carriers')}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-full border border-ink-200 px-4 text-[12.5px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Small presentational helpers
// -----------------------------------------------------------------------------

const inputCls =
  'h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </label>
  )
}

function CheckboxGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <fieldset>
      <legend className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
        {label}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
    </fieldset>
  )
}

function CheckboxChip({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
        'focus-within:ring-2 focus-within:ring-pink-500 focus-within:ring-offset-1',
        checked
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={cn(
          'inline-flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]',
          checked ? 'border-white/60 bg-white/20 text-white' : 'border-ink-300 text-transparent',
        )}
        aria-hidden
      >
        ✓
      </span>
      {label}
    </label>
  )
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex max-w-[280px] cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-ink-200 transition-colors peer-checked:bg-success-500 peer-focus-visible:ring-2 peer-focus-visible:ring-pink-500 peer-focus-visible:ring-offset-1" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span>
        <span className="block text-[12.5px] font-semibold text-ink-900">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-ink-500">{hint}</span>}
      </span>
    </label>
  )
}
