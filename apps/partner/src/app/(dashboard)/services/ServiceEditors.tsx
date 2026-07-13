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
import { Check, ExternalLink, FlaskConical, Layers, Loader2, Printer, Truck, Warehouse } from 'lucide-react'
import {
  saveCapabilities,
  saveStorageOffering,
  setAppliesLabels,
  type SaveResult,
} from './actions'

// ---------------------------------------------------------------------------
// Option catalogs — value = the stored enum-ish string, label = display.
// Values follow the existing capability conventions (MFG_CAPS / COPACK_CAPS /
// ContainerCategory / StorageClass) — no new spellings invented.
// ---------------------------------------------------------------------------

const DOMAIN_OPTS = [
  { v: 'FOOD', l: 'Food' },
  { v: 'BEVERAGE_FUNCTIONAL', l: 'Beverage — functional' },
  { v: 'SUPPLEMENT', l: 'Supplement' },
  { v: 'COSMETIC', l: 'Cosmetic' },
  { v: 'PET', l: 'Pet' },
]
const FORMULATION_OPTS = [
  { v: 'CUSTOM_FORMULATION', l: 'Custom formulation' },
  { v: 'REFORMULATION', l: 'Reformulation' },
  { v: 'STABILITY_TESTING', l: 'Stability testing' },
]
const CONTAINER_OPTS = [
  { v: 'BOTTLE', l: 'Bottle' },
  { v: 'CAN', l: 'Can' },
  { v: 'POUCH', l: 'Pouch' },
  { v: 'JAR', l: 'Jar' },
  { v: 'SACHET', l: 'Sachet' },
  { v: 'STICK_PACK', l: 'Stick pack' },
  { v: 'CARTON', l: 'Carton' },
]
const FILL_OPTS = [
  { v: 'LIQUID', l: 'Liquid' },
  { v: 'POWDER', l: 'Powder' },
  { v: 'CAPSULE_TABLET', l: 'Capsule / tablet' },
  { v: 'CREAM_GEL', l: 'Cream / gel' },
  { v: 'GUMMY', l: 'Gummy' },
]
const PROCESS_OPTS = [
  { v: 'DIGITAL', l: 'Digital' },
  { v: 'FLEXO', l: 'Flexo' },
  { v: 'OFFSET', l: 'Offset' },
  { v: 'SCREEN', l: 'Screen' },
]
const COLOR_OPTS = [
  { v: 'CMYK', l: 'CMYK' },
  { v: 'PANTONE', l: 'Pantone' },
  { v: 'WHITE_INK', l: 'White ink' },
  { v: 'ICC_PROFILE', l: 'ICC profile' },
]
const FINISH_OPTS = [
  { v: 'MATTE_LAMINATE', l: 'Matte laminate' },
  { v: 'GLOSS_LAMINATE', l: 'Gloss laminate' },
  { v: 'SPOT_UV', l: 'Spot UV' },
  { v: 'FOIL_STAMP', l: 'Foil stamp' },
]
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

/** Real strings from an unknown capabilities value — [] when absent. */
const strArr = (caps: Record<string, unknown>, k: string): string[] =>
  Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
/** Real finite number or '' — the input renders EMPTY when unset. */
const numOr = (caps: Record<string, unknown>, k: string): string =>
  typeof caps[k] === 'number' && Number.isFinite(caps[k]) ? String(caps[k]) : ''

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
                ? 'border-pink-200 bg-pink-50 font-semibold text-pink-700'
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
        on ? 'bg-pink-500' : 'bg-ink-300',
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
// ① MANUFACTURING
// ---------------------------------------------------------------------------

export function ManufacturingEditor({
  serviceId,
  capabilities,
}: {
  serviceId: string
  capabilities: Record<string, unknown>
}) {
  const caps = capabilities
  const [categories, setCategories] = useState(strArr(caps, 'categories'))
  const [formulation, setFormulation] = useState(strArr(caps, 'formulationCapabilities'))
  const [sampleCapable, setSampleCapable] = useState(caps.sampleCapable === true)
  const [sampleLead, setSampleLead] = useState(numOr(caps, 'sampleLeadDays'))
  const [moqMin, setMoqMin] = useState(numOr(caps, 'moqMin'))
  const [moqMax, setMoqMax] = useState(numOr(caps, 'moqMax'))
  const [increment, setIncrement] = useState(numOr(caps, 'orderIncrement'))
  const [monthly, setMonthly] = useState(numOr(caps, 'monthlyCapacity'))
  const [leadStock, setLeadStock] = useState(numOr(caps, 'leadTimeStockDays'))
  const [leadCustom, setLeadCustom] = useState(numOr(caps, 'leadTimeCustomDays'))
  const s = useSave()
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    s.setDirty(true)
  }

  const save = () =>
    s.run(() =>
      saveCapabilities(serviceId, {
        categories,
        formulationCapabilities: formulation,
        sampleCapable,
        sampleLeadDays: parseNum(sampleLead),
        moqMin: parseNum(moqMin),
        moqMax: parseNum(moqMax),
        orderIncrement: parseNum(increment),
        monthlyCapacity: parseNum(monthly),
        leadTimeStockDays: parseNum(leadStock),
        leadTimeCustomDays: parseNum(leadCustom),
      }),
    )

  return (
    <div>
      <FieldsetBox icon={<Layers />} title="What you make" hint="capabilities.categories">
        <FieldL label="Product domains">
          <ChipGroup opts={DOMAIN_OPTS} value={categories} onChange={touch(setCategories)} />
        </FieldL>
        <RouteTags tags={['Matching engine', 'Marketplace facets']} />
      </FieldsetBox>

      <FieldsetBox icon={<FlaskConical />} title="Formulation & samples" hint="owner-pin eligibility">
        <FieldL label="Formulation capability">
          <ChipGroup opts={FORMULATION_OPTS} value={formulation} onChange={touch(setFormulation)} />
        </FieldL>
        <div className="mt-3 flex items-center gap-3.5 border-t border-ink-100 pt-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink-900">Sample runs</div>
            <div className="text-[11.5px] text-ink-500">
              Pre-production samples for creators (credit-toward-first-order applies)
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {sampleCapable && (
              <input
                value={sampleLead}
                onChange={(e) => touch(setSampleLead)(e.target.value)}
                placeholder="Sample lead (days)"
                className={cn(inputCls, 'w-40')}
              />
            )}
            <Toggle on={sampleCapable} onClick={() => touch(setSampleCapable)(!sampleCapable)} />
          </div>
        </div>
        <RouteTags tags={['Product builder', 'Owner-pin eligibility', 'Sample orders']} />
      </FieldsetBox>

      <FieldsetBox icon={<Truck />} title="Runs, lead times & capacity" hint="moqMin/Max · leadTime* · monthlyCapacity">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FieldL label="MOQ min">
            <input value={moqMin} onChange={(e) => touch(setMoqMin)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="MOQ max">
            <input value={moqMax} onChange={(e) => touch(setMoqMax)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Lead — stock formulations (days)">
            <input value={leadStock} onChange={(e) => touch(setLeadStock)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Lead — custom (days)">
            <input value={leadCustom} onChange={(e) => touch(setLeadCustom)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Order increment">
            <input value={increment} onChange={(e) => touch(setIncrement)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Monthly capacity (units)">
            <input value={monthly} onChange={(e) => touch(setMonthly)(e.target.value)} className={inputCls} />
          </FieldL>
        </div>
        <RouteTags tags={['Checkout ETA', 'Capacity gate', 'Risk Center capacity accuracy']} />
      </FieldsetBox>

      <SaveBar dirty={s.dirty} pending={s.pending} error={s.error} onSave={save} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ② CO-PACKING
// ---------------------------------------------------------------------------

export function CopackEditor({
  serviceId,
  capabilities,
}: {
  serviceId: string
  capabilities: Record<string, unknown>
}) {
  const caps = capabilities
  const [containers, setContainers] = useState(strArr(caps, 'containerFormats'))
  const [fills, setFills] = useState(strArr(caps, 'fillTypes'))
  const [supplies, setSupplies] = useState<boolean | null>(
    typeof caps.suppliesContainer === 'boolean' ? (caps.suppliesContainer as boolean) : null,
  )
  const [lines, setLines] = useState(numOr(caps, 'fillingLines'))
  const [changeover, setChangeover] = useState(numOr(caps, 'changeoverDays'))
  const [moqMin, setMoqMin] = useState(numOr(caps, 'moqMin'))
  const [moqMax, setMoqMax] = useState(numOr(caps, 'moqMax'))
  const [lead, setLead] = useState(numOr(caps, 'leadTimeDays'))
  const s = useSave()
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    s.setDirty(true)
  }

  const save = () =>
    s.run(() =>
      saveCapabilities(serviceId, {
        containerFormats: containers,
        fillTypes: fills,
        suppliesContainer: supplies === null ? null : supplies,
        fillingLines: parseNum(lines),
        changeoverDays: parseNum(changeover),
        moqMin: parseNum(moqMin),
        moqMax: parseNum(moqMax),
        leadTimeDays: parseNum(lead),
      }),
    )

  return (
    <div>
      <FieldsetBox icon={<Layers />} title="What you fill" hint="ContainerCategory · fillTypes">
        <FieldL label="Container formats">
          <ChipGroup opts={CONTAINER_OPTS} value={containers} onChange={touch(setContainers)} />
        </FieldL>
        <div className="mt-3">
          <FieldL label="Fill types">
            <ChipGroup opts={FILL_OPTS} value={fills} onChange={touch(setFills)} />
          </FieldL>
        </div>
        <RouteTags tags={['Matching engine', 'Routing']} />
      </FieldsetBox>

      <FieldsetBox icon={<Warehouse />} title="Supply model" hint="suppliesContainer → routing graph">
        <FieldL
          label="For the formats above, do you…"
          help="Fill-only means routing adds a separate packaging leg (containers ship to you before filling)."
        >
          <div className="inline-flex w-fit overflow-hidden rounded-md border border-ink-300">
            {(
              [
                [true, 'We supply the container'],
                [false, 'Fill-only (container supplied to us)'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => touch(setSupplies)(v)}
                className={cn(
                  'px-4 py-2 text-[12.5px] font-semibold transition-colors',
                  supplies === v ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50',
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </FieldL>
        <RouteTags tags={['Routing (packaging leg)']} />
      </FieldsetBox>

      <FieldsetBox icon={<Truck />} title="Lines & runs" hint="changeover feeds multi-flavor lead time">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <FieldL label="Filling lines">
            <input value={lines} onChange={(e) => touch(setLines)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Changeover (days)">
            <input value={changeover} onChange={(e) => touch(setChangeover)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Run min">
            <input value={moqMin} onChange={(e) => touch(setMoqMin)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Run max">
            <input value={moqMax} onChange={(e) => touch(setMoqMax)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Lead (days)">
            <input value={lead} onChange={(e) => touch(setLead)(e.target.value)} className={inputCls} />
          </FieldL>
        </div>
        <RouteTags tags={['Variety-pack lead time (D5)', 'Capacity gate']} />
      </FieldsetBox>

      <SaveBar dirty={s.dirty} pending={s.pending} error={s.error} onSave={save} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ③ PRINT PRODUCTION
// ---------------------------------------------------------------------------

export function PrintEditor({
  serviceId,
  capabilities,
  appliesLabels,
  substrateCount,
  dielineCount,
}: {
  serviceId: string
  capabilities: Record<string, unknown>
  appliesLabels: boolean
  substrateCount: number
  dielineCount: number
}) {
  const caps = capabilities
  const [processes, setProcesses] = useState(strArr(caps, 'processes'))
  const [colors, setColors] = useState(strArr(caps, 'colorModes'))
  const [finishes, setFinishes] = useState(strArr(caps, 'finishes'))
  const [maxArea, setMaxArea] = useState(typeof caps.maxPrintArea === 'string' ? (caps.maxPrintArea as string) : '')
  const [moqMin, setMoqMin] = useState(numOr(caps, 'moqMin'))
  const [lead, setLead] = useState(numOr(caps, 'leadTimeDays'))
  const [applies, setApplies] = useState(appliesLabels)
  const s = useSave()
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    s.setDirty(true)
  }

  const save = () =>
    s.run(async () => {
      const a = await saveCapabilities(serviceId, {
        processes,
        colorModes: colors,
        finishes,
        maxPrintArea: maxArea.trim() || null,
        moqMin: parseNum(moqMin),
        leadTimeDays: parseNum(lead),
      })
      if (!a.ok) return a
      if (applies !== appliesLabels) return setAppliesLabels(serviceId, applies)
      return a
    })

  return (
    <div>
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-info-100 bg-info-50 px-3.5 py-3 text-[12.5px] text-info-800">
        <Printer className="mt-0.5 h-4 w-4 flex-none" />
        <span>
          You print for your <b>own production runs</b> (in-house cycle). Public print rotation is
          only for pure Print Providers — your print service never rotates to other partners&rsquo;
          jobs.
        </span>
      </div>

      <FieldsetBox icon={<Layers />} title="Materials & die-lines" hint="PartnerServiceSubstrate · PackagingDieline">
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="/packaging/offerings"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            {substrateCount} substrate{substrateCount === 1 ? '' : 's'} · manage
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="/packaging/dielines"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            {dielineCount} die-line{dielineCount === 1 ? '' : 's'} · manage
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-[11.5px] text-ink-500">
            Substrates &amp; die-lines live in Packaging — these counts are your real records.
          </span>
        </div>
      </FieldsetBox>

      <FieldsetBox icon={<Printer />} title="Print specs" hint="print-eligibility filter">
        <FieldL label="Processes">
          <ChipGroup opts={PROCESS_OPTS} value={processes} onChange={touch(setProcesses)} />
        </FieldL>
        <div className="mt-3">
          <FieldL label="Color">
            <ChipGroup opts={COLOR_OPTS} value={colors} onChange={touch(setColors)} />
          </FieldL>
        </div>
        <div className="mt-3">
          <FieldL label="Finishes">
            <ChipGroup opts={FINISH_OPTS} value={finishes} onChange={touch(setFinishes)} />
          </FieldL>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FieldL label="Max print area">
            <input
              value={maxArea}
              onChange={(e) => touch(setMaxArea)(e.target.value)}
              placeholder={'e.g. 14 in × 20 in'}
              className={inputCls}
            />
          </FieldL>
          <FieldL label="Print MOQ">
            <input value={moqMin} onChange={(e) => touch(setMoqMin)(e.target.value)} className={inputCls} />
          </FieldL>
          <FieldL label="Print lead (days)">
            <input value={lead} onChange={(e) => touch(setLead)(e.target.value)} className={inputCls} />
          </FieldL>
        </div>
        <div className="mt-3 flex items-center gap-3.5 border-t border-ink-100 pt-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-900">We apply labels in-house</div>
            <div className="text-[11.5px] text-ink-500">
              appliesLabels — no separate application leg after printing
            </div>
          </div>
          <div className="ml-auto">
            <Toggle on={applies} onClick={() => touch(setApplies)(!applies)} />
          </div>
        </div>
        <RouteTags tags={['Print-eligibility filter', 'Design Studio die-lines', 'Dispatch docs']} />
      </FieldsetBox>

      <SaveBar dirty={s.dirty} pending={s.pending} error={s.error} onSave={save} />
    </div>
  )
}

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
            <RouteTags tags={['On-demand channel orders', 'EasyPost rate shop']} />
          </FieldsetBox>
        </>
      )}

      <SaveBar dirty={s.dirty} pending={s.pending} error={s.error} onSave={save} />
    </div>
  )
}
