'use client'

// Section 3 — "What you can do"
// Per docs/PARTNER_ONBOARDING.md §7.4 + Layer 2 (Operational Capability).
//
// One sub-card per selected ServiceType from Section 1. We render a tabbed
// stack rather than four side-by-side cards so the form fits on a phone.
//
// Save behavior: per-card save-on-blur via saveServiceCapabilities. The
// capability shape is duck-typed per type (validated server-side in admin
// verification queue, not here — partners can save partial data).

import { useMemo, useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import type { ServiceType } from '@ilaunchify/db'
import { MANUFACTURING_PROCESS_OPTIONS } from '@ilaunchify/types'
import { saveServiceCapabilities } from '../../../app/(onboarding)/onboarding/actions'

// Manufacturer match key = ProductCategory (findRouting reads capabilities.categories).
const MFG_CATEGORIES: [string, string][] = [
  ['FOOD', 'Food'],
  ['BEVERAGE_FUNCTIONAL', 'Beverage'],
  ['SUPPLEMENT', 'Supplement'],
  ['COSMETIC', 'Cosmetic'],
  ['PET', 'Pet'],
]
import type {
  ManufacturingCaps,
  CopackingCaps,
  LabelPrintingCaps,
  WarehouseCaps,
  CapsByType,
} from './capabilities'

// Re-export the shared types so existing imports of this module keep working.
export type {
  ManufacturingCaps,
  CopackingCaps,
  LabelPrintingCaps,
  WarehouseCaps,
  CapsByType,
}

interface WhatYouCanDoSectionProps {
  selectedTypes: ServiceType[]
  initialCaps: CapsByType
  onChange: (caps: CapsByType) => void
}

const TYPE_LABELS: Record<ServiceType, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Packaging printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

export function WhatYouCanDoSection({
  selectedTypes,
  initialCaps,
  onChange,
}: WhatYouCanDoSectionProps) {
  // Default to the first selected type tab.
  const [activeTab, setActiveTab] = useState<ServiceType | null>(selectedTypes[0] ?? null)
  const [caps, setCaps] = useState<CapsByType>(initialCaps)

  function patchType<T extends ServiceType>(type: T, patch: Partial<NonNullable<CapsByType[T]>>) {
    const current = (caps[type] ?? {}) as NonNullable<CapsByType[T]>
    const next = { ...caps, [type]: { ...current, ...patch } as CapsByType[T] }
    setCaps(next)
    onChange(next)
  }

  if (selectedTypes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-warning-300 bg-warning-50 p-4 text-sm text-warning-900">
        Pick at least one partner type in <strong>Your business</strong> above. This section
        will then show one tab per type so you can fill in your capabilities.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-ink-200" role="tablist">
        {selectedTypes.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={activeTab === t}
            onClick={() => setActiveTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === t
                ? 'border-success-500 text-success-700'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Body */}
      <div role="tabpanel">
        {activeTab === 'MANUFACTURING' && (
          <ManufacturingForm
            value={caps.MANUFACTURING ?? blankManufacturing()}
            onPatch={(p) => patchType('MANUFACTURING', p)}
          />
        )}
        {activeTab === 'COPACKING' && (
          <CopackingForm
            value={caps.COPACKING ?? blankCopacking()}
            onPatch={(p) => patchType('COPACKING', p)}
          />
        )}
        {activeTab === 'LABEL_PRINTING' && (
          <LabelPrintingForm
            value={caps.LABEL_PRINTING ?? blankLabelPrinting()}
            onPatch={(p) => patchType('LABEL_PRINTING', p)}
          />
        )}
        {activeTab === 'WAREHOUSE' && (
          <WarehouseForm
            value={caps.WAREHOUSE ?? blankWarehouse()}
            onPatch={(p) => patchType('WAREHOUSE', p)}
          />
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Per-type forms
// -----------------------------------------------------------------------------

function ManufacturingForm({
  value,
  onPatch,
}: {
  value: ManufacturingCaps
  onPatch: (p: Partial<ManufacturingCaps>) => void
}) {
  const [, startTransition] = useTransition()
  function persist(next: ManufacturingCaps) {
    startTransition(() => {
      void saveServiceCapabilities({ type: 'MANUFACTURING', capabilities: normaliseMfg(next) })
    })
  }
  function toggleArr(field: 'categories' | 'processes', val: string) {
    const cur = value[field]
    const nextArr = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
    onPatch({ [field]: nextArr } as Partial<ManufacturingCaps>)
    persist({ ...value, [field]: nextArr })
  }
  return (
    <div className="space-y-4">
      <Field
        id="mfg-cats"
        label="Product categories you make"
        hint="Drives matching — we route you orders in the categories you pick."
      >
        <Chips>
          {MFG_CATEGORIES.map(([v, l]) => (
            <Chip key={v} on={value.categories.includes(v)} onClick={() => toggleArr('categories', v)}>
              {l}
            </Chip>
          ))}
        </Chips>
      </Field>
      <Field
        id="mfg-proc"
        label="Processes you run"
        hint="How you make it — used to match products that need these processes."
      >
        <ChipSelect
          placeholder="Add a process…"
          options={MANUFACTURING_PROCESS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={value.processes}
          onToggle={(v) => toggleArr('processes', v)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="mfg-moqmin" label="Minimum order (units)">
          <Input
            id="mfg-moqmin"
            type="number"
            min={0}
            value={value.moqMin}
            onChange={(e) => onPatch({ moqMin: e.target.value })}
            onBlur={() => persist(value)}
          />
        </Field>
        <Field id="mfg-moqmax" label="Maximum order (units, optional)">
          <Input
            id="mfg-moqmax"
            type="number"
            min={0}
            value={value.moqMax}
            onChange={(e) => onPatch({ moqMax: e.target.value })}
            onBlur={() => persist(value)}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="mfg-lt-min" label="Lead time (days, min)">
          <Input
            id="mfg-lt-min"
            type="number"
            min={0}
            value={value.leadTimeDaysMin}
            onChange={(e) => onPatch({ leadTimeDaysMin: e.target.value })}
            onBlur={() => persist(value)}
          />
        </Field>
        <Field id="mfg-lt-max" label="Lead time (days, max)">
          <Input
            id="mfg-lt-max"
            type="number"
            min={0}
            value={value.leadTimeDaysMax}
            onChange={(e) => onPatch({ leadTimeDaysMax: e.target.value })}
            onBlur={() => persist(value)}
          />
        </Field>
      </div>
    </div>
  )
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ' +
        (on
          ? 'border-pink-500 bg-pink-50 text-pink-700'
          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300')
      }
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  )
}

// Compact "pick from a dropdown → adds a removable chip" control. Keeps long
// option lists (processes, formats) tidy instead of a wall of chips.
function ChipSelect({
  options,
  selected,
  onToggle,
  placeholder = 'Add…',
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (v: string) => void
  placeholder?: string
}) {
  const available = options.filter((o) => !selected.includes(o.value))
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v
  return (
    <div className="space-y-2">
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onToggle(e.target.value)
        }}
        disabled={available.length === 0}
        className="block w-full rounded-[12px] border-[1.5px] border-ink-200 bg-white px-3 py-2.5 text-[13px] text-ink-700 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:opacity-50"
      >
        <option value="">{available.length === 0 ? 'All added' : placeholder}</option>
        {available.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[12.5px] font-semibold text-pink-700"
            >
              {labelFor(v)}
              <button
                type="button"
                onClick={() => onToggle(v)}
                aria-label={`Remove ${labelFor(v)}`}
                className="text-pink-400 hover:text-pink-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CopackingForm({
  value,
  onPatch,
}: {
  value: CopackingCaps
  onPatch: (p: Partial<CopackingCaps>) => void
}) {
  const commit = useCommit('COPACKING', () => normaliseCopack(value))
  return (
    <div className="space-y-4">
      <Field
        id="cop-formats"
        label="Packaging formats you support"
        hint="Comma-separated. e.g., 12oz_slim_can, 16oz_pet_bottle, 8oz_jar"
      >
        <Input
          id="cop-formats"
          value={value.packagingFormats}
          onChange={(e) => onPatch({ packagingFormats: e.target.value })}
          onBlur={commit}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="cop-moq" label="Typical MOQ (units)">
          <Input
            id="cop-moq"
            type="number"
            min={0}
            value={value.moqUnitsTypical}
            onChange={(e) => onPatch({ moqUnitsTypical: e.target.value })}
            onBlur={commit}
          />
        </Field>
        <Field id="cop-lt-min" label="Lead time (days, min)">
          <Input
            id="cop-lt-min"
            type="number"
            min={0}
            value={value.leadTimeDaysMin}
            onChange={(e) => onPatch({ leadTimeDaysMin: e.target.value })}
            onBlur={commit}
          />
        </Field>
        <Field id="cop-lt-max" label="Lead time (days, max)">
          <Input
            id="cop-lt-max"
            type="number"
            min={0}
            value={value.leadTimeDaysMax}
            onChange={(e) => onPatch({ leadTimeDaysMax: e.target.value })}
            onBlur={commit}
          />
        </Field>
      </div>
    </div>
  )
}

function LabelPrintingForm({
  value,
  onPatch,
}: {
  value: LabelPrintingCaps
  onPatch: (p: Partial<LabelPrintingCaps>) => void
}) {
  const commit = useCommit('LABEL_PRINTING', () => normaliseLabel(value))
  return (
    <div className="space-y-4">
      <Field id="lp-substrates" label="Substrates" hint="Comma-separated. e.g., paper, BOPP, vinyl, foil">
        <Input
          id="lp-substrates"
          value={value.substrates}
          onChange={(e) => onPatch({ substrates: e.target.value })}
          onBlur={commit}
        />
      </Field>
      <Field
        id="lp-colormodes"
        label="Color modes"
        hint="Comma-separated. e.g., CMYK, CMYK+W, Pantone, foil stamping"
      >
        <Input
          id="lp-colormodes"
          value={value.colorModes}
          onChange={(e) => onPatch({ colorModes: e.target.value })}
          onBlur={commit}
        />
      </Field>
      <Field id="lp-diecuts" label="Die-cuts supported" hint="Comma-separated. e.g., rectangle, oval, custom">
        <Input
          id="lp-diecuts"
          value={value.dieCuts}
          onChange={(e) => onPatch({ dieCuts: e.target.value })}
          onBlur={commit}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="lp-lt-min" label="Lead time (days, min)">
          <Input
            id="lp-lt-min"
            type="number"
            min={0}
            value={value.leadTimeDaysMin}
            onChange={(e) => onPatch({ leadTimeDaysMin: e.target.value })}
            onBlur={commit}
          />
        </Field>
        <Field id="lp-lt-max" label="Lead time (days, max)">
          <Input
            id="lp-lt-max"
            type="number"
            min={0}
            value={value.leadTimeDaysMax}
            onChange={(e) => onPatch({ leadTimeDaysMax: e.target.value })}
            onBlur={commit}
          />
        </Field>
      </div>
    </div>
  )
}

function WarehouseForm({
  value,
  onPatch,
}: {
  value: WarehouseCaps
  onPatch: (p: Partial<WarehouseCaps>) => void
}) {
  const commit = useCommit('WAREHOUSE', () => normaliseWh(value))
  return (
    <div className="space-y-4">
      <Field
        id="wh-storage"
        label="Storage types"
        hint="Comma-separated. e.g., ambient, refrigerated, frozen"
      >
        <Input
          id="wh-storage"
          value={value.storageType}
          onChange={(e) => onPatch({ storageType: e.target.value })}
          onBlur={commit}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="wh-pallets" label="Pallet capacity">
          <Input
            id="wh-pallets"
            type="number"
            min={0}
            value={value.palletCapacity}
            onChange={(e) => onPatch({ palletCapacity: e.target.value })}
            onBlur={commit}
          />
        </Field>
        <Field id="wh-fee" label="Pick & pack fee (US cents per order)">
          <Input
            id="wh-fee"
            type="number"
            min={0}
            value={value.pickPackFeeCents}
            onChange={(e) => onPatch({ pickPackFeeCents: e.target.value })}
            onBlur={commit}
          />
        </Field>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Save hook — one per service type; shared status indicator below the tabs.
// -----------------------------------------------------------------------------

function useCommit(type: ServiceType, getCaps: () => Record<string, unknown>) {
  const [, startTransition] = useTransition()
  return useMemo(
    () => () => {
      startTransition(async () => {
        await saveServiceCapabilities({ type, capabilities: getCaps() })
      })
    },
    // We intentionally re-create the closure each render so the latest `getCaps`
    // is used; the function itself is harmless to recreate.
    [type, getCaps],
  )
}

// -----------------------------------------------------------------------------
// Field helper (matches Section 2 style)
// -----------------------------------------------------------------------------

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-ink-900">
        {label}
      </Label>
      {hint && <p className="text-ui-caption text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Blank state + normalisation helpers
// -----------------------------------------------------------------------------

function blankManufacturing(): ManufacturingCaps {
  return { categories: [], processes: [], moqMin: '', moqMax: '', leadTimeDaysMin: '', leadTimeDaysMax: '' }
}
function blankCopacking(): CopackingCaps {
  return { packagingFormats: '', moqUnitsTypical: '', leadTimeDaysMin: '', leadTimeDaysMax: '' }
}
function blankLabelPrinting(): LabelPrintingCaps {
  return { substrates: '', colorModes: '', dieCuts: '', leadTimeDaysMin: '', leadTimeDaysMax: '' }
}
function blankWarehouse(): WarehouseCaps {
  return { storageType: '', palletCapacity: '', pickPackFeeCents: '' }
}

// Comma-string → trimmed array; '' → undefined; numeric strings → int.
function csv(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function intOrNull(v: string): number | null {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function normaliseMfg(v: ManufacturingCaps) {
  return {
    categories: v.categories, // ProductCategory[] — the routing match key
    manufacturingProcesses: v.processes,
    moqMin: intOrNull(v.moqMin),
    moqMax: intOrNull(v.moqMax),
    leadTimeDaysMin: intOrNull(v.leadTimeDaysMin),
    leadTimeDaysMax: intOrNull(v.leadTimeDaysMax),
  }
}
function normaliseCopack(v: CopackingCaps) {
  return {
    packagingFormats: csv(v.packagingFormats),
    moqUnitsTypical: intOrNull(v.moqUnitsTypical),
    leadTimeDaysMin: intOrNull(v.leadTimeDaysMin),
    leadTimeDaysMax: intOrNull(v.leadTimeDaysMax),
  }
}
function normaliseLabel(v: LabelPrintingCaps) {
  return {
    substrates: csv(v.substrates),
    colorModes: csv(v.colorModes),
    dieCuts: csv(v.dieCuts),
    leadTimeDaysMin: intOrNull(v.leadTimeDaysMin),
    leadTimeDaysMax: intOrNull(v.leadTimeDaysMax),
  }
}
function normaliseWh(v: WarehouseCaps) {
  return {
    storageType: csv(v.storageType),
    palletCapacity: intOrNull(v.palletCapacity),
    pickPackFeeCents: intOrNull(v.pickPackFeeCents),
  }
}

// capsFromJson + arrToStr/numToStr live in ./capabilities.ts (non-client) so
// the server-side onboarding/page.tsx loader can call them too.
