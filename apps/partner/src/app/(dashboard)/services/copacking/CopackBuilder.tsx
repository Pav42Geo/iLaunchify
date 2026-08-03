'use client'

// CP-4 — the co-pack Service Builder (docs/COPACK_SERVICE_SPEC §5, CP-4).
// Body ported 1:1 from design/copacker-service-builder-prototype.html; the
// stepper chrome is the co-creation .stagebar (design/co-creation-demo.html) so
// every builder in the product looks the same (Pavel 2026-07-19).
//
// The Live check runs the REAL engine — @ilaunchify/orders/copack-quote — not a
// re-implementation, so a co-packer sees exactly the crossover, amortization and
// order-value floor routing will use. Nothing here reaches an invoice yet (CP-3).
//
// HARD RULE (Pavel, memory): no invented defaults. The prototype's example
// numbers appear as PLACEHOLDERS, never as pre-saved values — saving fabricated
// pricing would quote the partner on fake numbers. Empty stays empty.

import { useMemo, useState } from 'react'
import {
  copackLineCostCents,
  selectCopackLine,
  quoteCopack,
  copackCrossoverUnits,
  type CopackLineInput,
  type CopackOperationInput,
} from '@ilaunchify/orders/copack-quote'
import {
  saveCopackBuilder,
  type CopackBuilderPayload,
  type CopackOpType,
  type CopackPricingUnit,
} from './actions'
import { inputCls, F, Hero, CoCreationStepper, builderSteps } from '../builder-kit'

// ─── shape passed from the server page ──────────────────────────────────────
export interface CopackBuilderInitial {
  serviceId: string
  canEdit: boolean
  facilities: { id: string; name: string }[]
  facilityId: string | null
  appliesLabels: boolean
  serviceName: string
  containerFormats: string[]
  fillTypes: string[]
  packStyles: string[]
  certifications: string[]
  suppliesContainer: boolean | null
  maxRushPerWeek: number | null
  config: {
    changeoverFeeCents: number | null
    minRunChargeCents: number | null
    repeatRunDiscountBps: number | null
    rushUpliftBps: number | null
    rushLeadTimeDays: number | null
    minOrderValueCents: number | null
    weeklyCapacityUnits: number | null
    baseLeadTimeDays: number | null
    supplyModel: 'FILL_ONLY' | 'SUPPLIES_CONTAINER'
  } | null
  lines: {
    name: string
    runSpeedUnitsPerHour: number
    changeoverMinutes: number
    lineRateCentsPerHour: number
    minRunUnits: number
    maxRunUnits: number | null
    allergenClass: string | null
    active: boolean
  }[]
  operations: { opType: string; pricingUnit: string; priceCents: number; on: boolean }[]
}

// ─── loose parsers (match the prototype's num()) ────────────────────────────
const num = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0
const centsOf = (s: string) => Math.round(num(s) * 100)
const bpsOf = (s: string) => Math.round(num(s) * 100)
const intOf = (s: string) => Math.round(num(s))
const fmt = (c: number) => '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f0 = (c: number) => '$' + Math.round(c / 100).toLocaleString()

// ─── option catalogs (prototype 1:1) ────────────────────────────────────────
const CONTAINER_FORMATS = [
  'Rigid jar', 'Rigid tub', 'Stand-up pouch', 'Flat pouch / sachet', 'Bottle · HDPE',
  'Bottle · glass', 'Carton / folding box', 'Stick pack', 'Can', 'Tube',
]
const FILL_TYPES = ['Powder', 'Granule', 'Capsule / tablet', 'Liquid · thin', 'Liquid · viscous', 'Gummy', 'Dry blend']
const PACK_STYLES = ['Single unit', 'Multipack (same flavour)', 'Variety pack (mixed)', 'Retail display / PDQ', 'Subscription box']
const CERTS = ['cGMP', 'FDA registered', 'SQF Level 2', 'Organic handler', 'Kosher', 'Halal', 'NSF Sport']

const UNIT_LABEL: Record<CopackPricingUnit, string> = {
  PER_UNIT: 'Per unit', PER_PACK: 'Per pack', PER_CASE: 'Per case',
  PER_PALLET: 'Per pallet', PER_RUN: 'Per run', PER_HOUR: 'Per hour',
}

interface OpTemplate {
  key: CopackOpType
  label: string
  desc: string
  units: CopackPricingUnit[]
  placeholder: string
}
const OP_TEMPLATE: OpTemplate[] = [
  { key: 'FILL_CLOSE', label: 'Fill & close', desc: 'The core operation. Meter, fill, cap, torque, induction seal.', units: ['PER_UNIT', 'PER_CASE', 'PER_HOUR'], placeholder: '0.34' },
  { key: 'LABEL_APPLY', label: 'Label application', desc: 'Pressure-sensitive apply at fill. The honey-problem step.', units: ['PER_UNIT', 'PER_CASE'], placeholder: '0.11' },
  { key: 'KIT_ASSEMBLY', label: 'Variety / kit assembly', desc: 'Mixed flavours into a parent carton. Priced per finished pack, not per unit.', units: ['PER_PACK', 'PER_UNIT', 'PER_HOUR'], placeholder: '0.85' },
  { key: 'INSERT', label: 'Insert placement', desc: 'Recipe card, scoop, sample, brand insert.', units: ['PER_UNIT', 'PER_PACK'], placeholder: '0.06' },
  { key: 'SHRINK_BUNDLE', label: 'Shrink / bundle', desc: 'Multipack banding or full shrink.', units: ['PER_PACK', 'PER_UNIT'], placeholder: '0.19' },
  { key: 'CASE_PACK', label: 'Case pack & palletize', desc: 'Into shippers, onto pallets, stretch wrapped.', units: ['PER_CASE', 'PER_PALLET'], placeholder: '1.40' },
  { key: 'QC_COA', label: 'QC hold & COA capture', desc: 'Retain samples, lot record, certificate of analysis.', units: ['PER_RUN'], placeholder: '0.00' },
  { key: 'REWORK', label: 'Rework / hand sort', desc: 'Salvage a bad lot. Quoted, never auto-routed.', units: ['PER_HOUR'], placeholder: '0.00' },
]

// ─── local editable state shapes ────────────────────────────────────────────
interface LineState {
  id: string
  name: string
  sp: string
  co: string // hours
  rt: string // $/h
  mn: string
  mx: string
  allergen: string
  active: boolean
}
interface OpState {
  key: CopackOpType
  unit: CopackPricingUnit
  price: string
  on: boolean
}

let LINE_SEQ = 0
const newLineId = () => `line-${LINE_SEQ++}-${Math.random().toString(36).slice(2, 7)}`

const STAGES = ['Basics', 'Lines', 'Scope', 'Ops', 'Pricing', 'Publish'] as const

// ─── shared field primitives (prototype .f / .card) ─────────────────────────
// inputCls + F now come from ../builder-kit (shared across all three builders).
function Card({ title, tag, tagNew, sub, children }: { title: string; tag?: string; tagNew?: boolean; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-ink-200 bg-white px-5 py-[18px]">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink-900">
        {title}
        {tag && (
          <span className={`rounded-pill px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] ${tagNew ? 'bg-neon-500 text-ink-900' : 'bg-pink-50 text-pink-700'}`}>
            {tag}
          </span>
        )}
      </h2>
      {sub && <p className="mb-[14px] mt-[3px] max-w-[760px] text-[12.5px] text-ink-500">{sub}</p>}
      <div className={sub ? '' : 'mt-[14px]'}>{children}</div>
    </div>
  )
}
function Chips({ opts, value, onToggle }: { opts: string[]; value: Set<string>; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[7px]">
      {opts.map((o) => {
        const on = value.has(o)
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${
              on ? 'border-success-500 bg-success-50 text-success-800' : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="mb-[14px] px-1 text-[12px] leading-[1.6] text-ink-500 [&_b]:text-ink-700">{children}</p>
}

// ═════════════════════════════════════════════════════════════════════════════
export function CopackBuilder({ initial }: { initial: CopackBuilderInitial }) {
  const [v, setV] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dirtyAll = () => { setSaved(false); setError(null) }

  // Basics + rush + run charges (strings; empty → placeholder, never fabricated).
  const c = initial.config
  const [serviceName, setServiceName] = useState(initial.serviceName)
  const [facilityId, setFacilityId] = useState(initial.facilityId ?? '')
  const [baseLead, setBaseLead] = useState(c?.baseLeadTimeDays != null ? String(c.baseLeadTimeDays) : '')
  const [mov, setMov] = useState(c?.minOrderValueCents != null ? (c.minOrderValueCents / 100).toFixed(0) : '')
  const [weekly, setWeekly] = useState(c?.weeklyCapacityUnits != null ? String(c.weeklyCapacityUnits) : '')
  const [rush, setRush] = useState(c?.rushUpliftBps != null ? (c.rushUpliftBps / 100).toString() : '')
  const [rushLead, setRushLead] = useState(c?.rushLeadTimeDays != null ? String(c.rushLeadTimeDays) : '')
  const [maxRush, setMaxRush] = useState(initial.maxRushPerWeek != null ? String(initial.maxRushPerWeek) : '')
  const [changeoverFee, setChangeoverFee] = useState(c?.changeoverFeeCents != null ? (c.changeoverFeeCents / 100).toFixed(0) : '')
  const [minRun, setMinRun] = useState(c?.minRunChargeCents != null ? (c.minRunChargeCents / 100).toFixed(0) : '')
  const [repeatDisc, setRepeatDisc] = useState(c?.repeatRunDiscountBps != null ? (c.repeatRunDiscountBps / 100).toString() : '')

  // Scope
  const [containers, setContainers] = useState<Set<string>>(new Set(initial.containerFormats))
  const [fills, setFills] = useState<Set<string>>(new Set(initial.fillTypes))
  const [packs, setPacks] = useState<Set<string>>(new Set(initial.packStyles))
  const [certs, setCerts] = useState<Set<string>>(new Set(initial.certifications))
  const [supplies, setSupplies] = useState<'FILL_ONLY' | 'SUPPLIES_CONTAINER'>(c?.supplyModel ?? 'FILL_ONLY')
  const [appliesLabels, setAppliesLabels] = useState(initial.appliesLabels)

  // Lines — saved rows, else one blank line so the layout matches the prototype.
  const [lines, setLines] = useState<LineState[]>(
    initial.lines.length > 0
      ? initial.lines.map((l) => ({
          id: newLineId(),
          name: l.name,
          sp: String(l.runSpeedUnitsPerHour),
          co: String(l.changeoverMinutes / 60),
          rt: (l.lineRateCentsPerHour / 100).toString(),
          mn: String(l.minRunUnits),
          mx: l.maxRunUnits != null ? String(l.maxRunUnits) : '',
          allergen: l.allergenClass ?? '',
          active: l.active,
        }))
      : [{ id: newLineId(), name: '', sp: '', co: '', rt: '', mn: '', mx: '', allergen: '', active: true }],
  )

  // Operations — template merged with saved rows.
  const [ops, setOps] = useState<OpState[]>(
    OP_TEMPLATE.map((t) => {
      const savedOp = initial.operations.find((o) => o.opType === t.key)
      return {
        key: t.key,
        unit: (savedOp?.pricingUnit as CopackPricingUnit) ?? t.units[0]!,
        price: savedOp ? (savedOp.priceCents / 100).toString() : '',
        on: savedOp?.on ?? false,
      }
    }),
  )

  // Live-check controls
  const [q, setQ] = useState('2400')
  const [upp, setUpp] = useState('12')
  const [upc, setUpc] = useState('24')

  const readOnly = !initial.canEdit

  // ── mutators ──
  const setLine = (id: string, patch: Partial<LineState>) => {
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    dirtyAll()
  }
  const addLine = () => {
    setLines((rows) => [...rows, { id: newLineId(), name: '', sp: '', co: '', rt: '', mn: '', mx: '', allergen: '', active: true }])
    dirtyAll()
  }
  const removeLine = (id: string) => {
    setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))
    dirtyAll()
  }
  const setOp = (key: CopackOpType, patch: Partial<OpState>) => {
    setOps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    dirtyAll()
  }

  // ── engine inputs (Live check + review use the REAL engine) ──
  const lineInputs: (CopackLineInput & { label: string })[] = useMemo(
    () =>
      lines
        .filter((l) => l.active && num(l.sp) > 0 && num(l.rt) > 0)
        .map((l) => ({
          id: l.id,
          label: l.name.trim() || 'Unnamed line',
          runSpeedUnitsPerHour: intOf(l.sp),
          changeoverMinutes: Math.round(num(l.co) * 60),
          lineRateCentsPerHour: centsOf(l.rt),
          minRunUnits: intOf(l.mn),
          maxRunUnits: l.mx.trim() ? intOf(l.mx) : null,
          allergenClass: null,
          containerFormats: [],
          fillTypes: [],
          status: 'ACTIVE',
        })),
    [lines],
  )
  const opInputs: CopackOperationInput[] = useMemo(
    () => ops.filter((o) => o.on).map((o) => ({ opType: o.key, pricingUnit: o.unit, priceCents: centsOf(o.price), status: 'ACTIVE' })),
    [ops],
  )
  const configInput = useMemo(
    () => ({
      changeoverFeeCents: changeoverFee.trim() ? centsOf(changeoverFee) : null,
      minRunChargeCents: minRun.trim() ? centsOf(minRun) : null,
      repeatRunDiscountBps: repeatDisc.trim() ? bpsOf(repeatDisc) : null,
      rushUpliftBps: rush.trim() ? bpsOf(rush) : null,
      minOrderValueCents: mov.trim() ? centsOf(mov) : null,
    }),
    [changeoverFee, minRun, repeatDisc, rush, mov],
  )

  const qN = intOf(q), uppN = Math.max(1, intOf(upp)), upcN = Math.max(1, intOf(upc))
  const job = { qty: qN, unitsPerPack: uppN, unitsPerCase: upcN }
  const perLine = lineInputs.map((li) => ({ li, cost: copackLineCostCents(li, qN) }))
  const winner = selectCopackLine(lineInputs, job)
  const priced = lineInputs.length ? quoteCopack(lineInputs, opInputs, configInput, job) : null

  // Crossover between the two most competitive active lines.
  const crossover = useMemo(() => {
    if (lineInputs.length < 2) return null
    const sorted = [...perLine].sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity)).map((x) => x.li)
    return copackCrossoverUnits(sorted[0]!, sorted[1]!)
  }, [lineInputs, perLine])

  const derived = lineInputs[0]
    ? `Derived from ${lineInputs[0].label}: ${(lineInputs[0].changeoverMinutes / 60)}h × ${fmt(lineInputs[0].lineRateCentsPerHour)}/h = ${fmt(
        Math.round((lineInputs[0].changeoverMinutes / 60) * lineInputs[0].lineRateCentsPerHour),
      )}`
    : 'Add a line to derive your changeover cost.'

  // ── save ──
  function save() {
    setError(null)
    const payload: CopackBuilderPayload = {
      serviceName: serviceName.trim() || null,
      facilityId: facilityId || null,
      baseLeadTimeDays: baseLead.trim() ? intOf(baseLead) : null,
      minOrderValueCents: mov.trim() ? centsOf(mov) : null,
      weeklyCapacityUnits: weekly.trim() ? intOf(weekly) : null,
      rushUpliftBps: rush.trim() ? bpsOf(rush) : null,
      rushLeadTimeDays: rushLead.trim() ? intOf(rushLead) : null,
      maxRushPerWeek: maxRush.trim() ? intOf(maxRush) : null,
      changeoverFeeCents: changeoverFee.trim() ? centsOf(changeoverFee) : null,
      minRunChargeCents: minRun.trim() ? centsOf(minRun) : null,
      repeatRunDiscountBps: repeatDisc.trim() ? bpsOf(repeatDisc) : null,
      supplyModel: supplies,
      appliesLabels,
      containerFormats: [...containers],
      fillTypes: [...fills],
      packStyles: [...packs],
      certifications: [...certs],
      suppliesContainer: supplies === 'SUPPLIES_CONTAINER',
      lines: lines
        .filter((l) => l.name.trim() || num(l.sp) > 0)
        .map((l) => ({
          name: l.name.trim() || 'Line',
          runSpeedUnitsPerHour: intOf(l.sp),
          changeoverMinutes: Math.round(num(l.co) * 60),
          lineRateCentsPerHour: centsOf(l.rt),
          minRunUnits: intOf(l.mn),
          maxRunUnits: l.mx.trim() ? intOf(l.mx) : null,
          allergenClass: l.allergen.trim() || null,
          active: l.active,
        })),
      operations: ops.map((o) => ({ opType: o.key, pricingUnit: o.unit, priceCents: centsOf(o.price), on: o.on })),
    }
    setPending(true)
    void saveCopackBuilder(initial.serviceId, payload).then((res) => {
      setPending(false)
      if (res.ok) setSaved(true)
      else setError(res.error)
    })
  }

  // ═══ render ═══
  return (
    <>
      {/* Co-creation stepper — full-bleed, hugging the sidebar, right under the header. */}
      <CoCreationStepper className="col-span-full -mt-6 mb-s-5" steps={builderSteps(STAGES, v)} onStepClick={setV} />
      <div className="pb-24">
        <a href="/services" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 transition hover:text-ink-900">
          <span aria-hidden="true">←</span> Back to services
        </a>

      <div>
        {readOnly && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning-100 bg-warning-50 px-3.5 py-3 text-[12.5px] text-warning-700">
            <span>This builder becomes editable once your application is approved. Values below are read-only.</span>
          </div>
        )}

        {v === 0 && <StepBasics {...{ serviceName, setServiceName, facilityId, setFacilityId, facilities: initial.facilities, baseLead, setBaseLead, mov, setMov, weekly, setWeekly, rush, setRush, rushLead, setRushLead, maxRush, setMaxRush, dirtyAll }} />}
        {v === 1 && <StepLines {...{ lines, setLine, addLine, removeLine }} />}
        {v === 2 && <StepScope {...{ containers, fills, packs, certs, supplies, setSupplies, appliesLabels, setAppliesLabels, toggleIn: { setContainers, setFills, setPacks, setCerts }, dirtyAll }} />}
        {v === 3 && <StepOps {...{ ops, setOp }} />}
        {v === 4 && (
          <StepPricing
            {...{ changeoverFee, setChangeoverFee, minRun, setMinRun, repeatDisc, setRepeatDisc, derived, q, setQ, upp, setUpp, upc, setUpc, dirtyAll }}
            perLine={perLine}
            winnerId={winner?.line.id ?? null}
            priced={priced}
            crossover={crossover}
            movCents={mov.trim() ? centsOf(mov) : 0}
            qty={qN}
          />
        )}
        {v === 5 && <StepReview {...{ lines: lineInputs.length, containers: containers.size, fills: fills.size, packs: packs.size, opsOn: ops.filter((o) => o.on).length, changeoverFee, minRun, mov, appliesLabels }} />}
      </div>

      {/* save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[72rem] items-center gap-3 px-6">
          <span className="text-[12.5px] font-semibold text-ink-500">
            {pending ? 'Saving…' : saved ? 'All changes saved' : error ? '' : 'Draft not yet saved'}
          </span>
          {error && <span className="text-[12px] font-semibold text-danger-500">{error}</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => setV((x) => Math.max(0, x - 1))} disabled={v === 0} className="rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-40">
            Back
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || readOnly}
            className="rounded-pill bg-pink-500 px-5 py-2 text-[12.5px] font-bold text-white hover:bg-pink-600 disabled:opacity-40"
          >
            {v === STAGES.length - 1 ? 'Save & finish' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

// ═══ STEP 0 · BASICS ═════════════════════════════════════════════════════════
function StepBasics(p: {
  serviceName: string; setServiceName: (s: string) => void
  facilityId: string; setFacilityId: (s: string) => void
  facilities: { id: string; name: string }[]
  baseLead: string; setBaseLead: (s: string) => void
  mov: string; setMov: (s: string) => void
  weekly: string; setWeekly: (s: string) => void
  rush: string; setRush: (s: string) => void
  rushLead: string; setRushLead: (s: string) => void
  maxRush: string; setMaxRush: (s: string) => void
  dirtyAll: () => void
}) {
  const t = (fn: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { fn(e.target.value); p.dirtyAll() }
  return (
    <>
      <Hero eyebrow="Co-packing service" title="Service basics" desc="You fill, assemble and pack other people's products. This builder captures what your floor can actually do, and what you charge to do it, so routing can quote you without a phone call." />
      <Card title="Identity" sub="This is service-scoped. If you also manufacture or print, those are separate services with their own capabilities, on the same login.">
        <div className="grid gap-[14px] sm:grid-cols-2">
          <F label="Service name" hint="Internal. Creators never see a co-packer's name.">
            <input className={inputCls} value={p.serviceName} onChange={t(p.setServiceName)} placeholder="Rialto Fill & Pack · Line 2/3" />
          </F>
          <F label="Facility">
            <select className={inputCls} value={p.facilityId} onChange={t(p.setFacilityId)}>
              <option value="">Not set</option>
              {p.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </F>
        </div>
        <div className="mt-[14px] grid gap-3 sm:grid-cols-3">
          <F label="Base lead time (business days)" hint="From components on-hand to case-ready."><input className={inputCls} value={p.baseLead} onChange={t(p.setBaseLead)} placeholder="12" /></F>
          <F label="Minimum order value" hint="A commercial floor. Binds even when the unit count clears every MOQ."><input className={inputCls} value={p.mov} onChange={t(p.setMov)} placeholder="$750" /></F>
          <F label="Weekly capacity (units)"><input className={inputCls} value={p.weekly} onChange={t(p.setWeekly)} placeholder="240000" /></F>
        </div>
      </Card>
      <Card title="Rush & expediting" tag="Monetized" tagNew sub="Rush is partner-set and creator-paid, so it enters the production subtotal and carries the platform fee like any other line. Leave it off and rush jobs simply route elsewhere.">
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Rush uplift" hint="Applied to the co-pack subtotal."><input className={inputCls} value={p.rush} onChange={t(p.setRush)} placeholder="22%" /></F>
          <F label="Cuts lead time to" hint="business days"><input className={inputCls} value={p.rushLead} onChange={t(p.setRushLead)} placeholder="5" /></F>
          <F label="Max rush jobs / week"><input className={inputCls} value={p.maxRush} onChange={t(p.setMaxRush)} placeholder="2" /></F>
        </div>
      </Card>
    </>
  )
}

// ═══ STEP 1 · LINES ══════════════════════════════════════════════════════════
function StepLines(p: {
  lines: LineState[]
  setLine: (id: string, patch: Partial<LineState>) => void
  addLine: () => void
  removeLine: (id: string) => void
}) {
  const active = p.lines.filter((l) => l.active).length
  return (
    <>
      <Hero eyebrow="Step 2" title="Your lines" desc="A line is the unit of truth on a co-pack floor, the way a press is in a print shop. Speed and changeover live here, not on your price list. Declare the line once and every quote, MOQ and lead time falls out of it." />
      <Note>
        <b>Why this exists.</b> Your cost is dominated by <b>changeover</b>, not by running. A 4-hour changeover on 500 units is punishing; on 50,000 it disappears. That is the whole reason co-packers have minimums. Declare the changeover honestly and the engine derives your floor for you, instead of you guessing a round number and losing the jobs just under it.
      </Note>
      <Card title="Lines on your floor" tag={`${active} active`}>
        {p.lines.map((l) => (
          <div key={l.id} className={`mb-2.5 rounded-xl border px-4 py-3.5 ${l.active ? 'border-success-300 bg-white shadow-[0_0_0_3px_rgb(var(--success-500-rgb) / 0.10)]' : 'border-ink-200 bg-ink-50'}`}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <button type="button" onClick={() => p.setLine(l.id, { active: !l.active })} aria-label="Toggle line" className={`relative h-[22px] w-[38px] flex-none rounded-pill transition ${l.active ? 'bg-pink-500' : 'bg-ink-300'}`}>
                <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${l.active ? 'left-[19px]' : 'left-[3px]'}`} />
              </button>
              <input className="min-w-0 flex-1 border-0 bg-transparent font-display text-[14px] font-bold text-ink-900 focus:outline-none" value={l.name} onChange={(e) => p.setLine(l.id, { name: e.target.value })} placeholder="Line 2 · Auger fill" />
              {p.lines.length > 1 && (
                <button type="button" onClick={() => p.removeLine(l.id)} className="text-[11.5px] font-semibold text-danger-500 hover:underline">Remove</button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <F label="Run speed (units / hour)"><input className={inputCls} value={l.sp} onChange={(e) => p.setLine(l.id, { sp: e.target.value })} placeholder="3600" /></F>
              <F label="Changeover (hours)"><input className={inputCls} value={l.co} onChange={(e) => p.setLine(l.id, { co: e.target.value })} placeholder="4" /></F>
              <F label="Line rate ($ / hour)" hint="Fully loaded: labour + line."><input className={inputCls} value={l.rt} onChange={(e) => p.setLine(l.id, { rt: e.target.value })} placeholder="$165" /></F>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <F label="Min run (units)"><input className={inputCls} value={l.mn} onChange={(e) => p.setLine(l.id, { mn: e.target.value })} placeholder="1500" /></F>
              <F label="Max run (units)" hint="Leave blank for no ceiling."><input className={inputCls} value={l.mx} onChange={(e) => p.setLine(l.id, { mx: e.target.value })} placeholder="120000" /></F>
              <F label="Allergen class"><input className={inputCls} value={l.allergen} onChange={(e) => p.setLine(l.id, { allergen: e.target.value })} placeholder="Segregated · nut-free" /></F>
            </div>
          </div>
        ))}
        <button type="button" onClick={p.addLine} className="mt-1 rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">
          + Add a line
        </button>
      </Card>
    </>
  )
}

// ═══ STEP 2 · SCOPE ══════════════════════════════════════════════════════════
function StepScope(p: {
  containers: Set<string>; fills: Set<string>; packs: Set<string>; certs: Set<string>
  supplies: 'FILL_ONLY' | 'SUPPLIES_CONTAINER'; setSupplies: (v: 'FILL_ONLY' | 'SUPPLIES_CONTAINER') => void
  appliesLabels: boolean; setAppliesLabels: (v: boolean) => void
  toggleIn: {
    setContainers: React.Dispatch<React.SetStateAction<Set<string>>>
    setFills: React.Dispatch<React.SetStateAction<Set<string>>>
    setPacks: React.Dispatch<React.SetStateAction<Set<string>>>
    setCerts: React.Dispatch<React.SetStateAction<Set<string>>>
  }
  dirtyAll: () => void
}) {
  const tog = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) => {
    set((prev) => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n }); p.dirtyAll()
  }
  return (
    <>
      <Hero eyebrow="Step 3" title="What you run" desc="Formats and fills are hard filters: routing will never send you a job you cannot physically run. Say no here freely. A narrow, honest scope wins more work than a wide, hopeful one." />
      <Card title="Container formats" sub="What your lines can hold and index. Anything unticked is invisible to you.">
        <Chips opts={CONTAINER_FORMATS} value={p.containers} onToggle={tog(p.toggleIn.setContainers)} />
        <h3 className="mb-2 mt-[18px] font-display text-[15px] font-bold text-ink-900">Fill types</h3>
        <Chips opts={FILL_TYPES} value={p.fills} onToggle={tog(p.toggleIn.setFills)} />
        <h3 className="mb-1 mt-[18px] font-display text-[15px] font-bold text-ink-900">Pack styles</h3>
        <p className="mb-2 max-w-[760px] text-[12.5px] text-ink-500">Variety and multipack are the styles that make routing emit a co-pack leg at all. Without a carton or shipper in the graph, there is no assembly step and no co-packer.</p>
        <Chips opts={PACK_STYLES} value={p.packs} onToggle={tog(p.toggleIn.setPacks)} />
      </Card>
      <Card title="Supply model" tag="Routing-critical" tagNew sub="This one answer changes the shape of the whole order graph.">
        <div className="grid gap-[14px] sm:grid-cols-2">
          <F label="Do you supply the container?" hint="Fill only means routing adds a separate packaging leg and ships components to you. That is normal, and it is why your inbound view matters.">
            <select className={inputCls} value={p.supplies} onChange={(e) => { p.setSupplies(e.target.value as 'FILL_ONLY' | 'SUPPLIES_CONTAINER'); p.dirtyAll() }}>
              <option value="FILL_ONLY">Fill only: components arrive from elsewhere</option>
              <option value="SUPPLIES_CONTAINER">I supply the container</option>
            </select>
          </F>
          <F label="Do you apply labels?" hint="Saying yes is what lets us print labels digitally at low volume and apply them at your fill step, which is how a creator dodges a printer's 10,000-piece minimum entirely.">
            <select className={inputCls} value={p.appliesLabels ? 'yes' : 'no'} onChange={(e) => { p.setAppliesLabels(e.target.value === 'yes'); p.dirtyAll() }}>
              <option value="yes">Yes: application is our trade</option>
              <option value="no">No: arrive pre-labelled</option>
            </select>
          </F>
        </div>
        <h3 className="mb-2 mt-[18px] font-display text-[15px] font-bold text-ink-900">Certifications</h3>
        <Chips opts={CERTS} value={p.certs} onToggle={tog(p.toggleIn.setCerts)} />
      </Card>
    </>
  )
}

// ═══ STEP 3 · OPERATIONS ═════════════════════════════════════════════════════
function StepOps(p: { ops: OpState[]; setOp: (key: CopackOpType, patch: Partial<OpState>) => void }) {
  return (
    <>
      <Hero eyebrow="Step 4" title="Operations" desc="A printer sells a thing. You sell a set of operations performed on someone else's things. Each one gets its own switch, its own unit and its own price. This menu is what you actually get paid for." />
      <Note>
        <b>Read this before you price.</b> Every operation you switch on is <b>partner-set and creator-paid</b>, so it sits inside the production subtotal and carries the platform fee, exactly like manufacturing or print. It is not a side charge and it is not hidden. Nothing here can be quietly moved outside the fee base to dodge the fee, and nothing here gets shaved off your payout.
      </Note>
      <Card title="Your operation menu" tag="New" tagNew sub="Switch on only what you do. Unit matters: it is what the quantity multiplies.">
        <div>
          {OP_TEMPLATE.map((t) => {
            const st = p.ops.find((o) => o.key === t.key)!
            return (
              <div key={t.key} className={`grid grid-cols-[1fr_46px_150px_120px] items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0 ${st.on ? '' : 'opacity-45'}`}>
                <div>
                  <div className="text-[13px] font-semibold text-ink-900">{t.label}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">{t.desc}</div>
                </div>
                <button type="button" onClick={() => p.setOp(t.key, { on: !st.on })} aria-label="Toggle operation" className={`relative h-[22px] w-[38px] flex-none rounded-pill transition ${st.on ? 'bg-success-500' : 'bg-ink-300'}`}>
                  <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${st.on ? 'left-[19px]' : 'left-[3px]'}`} />
                </button>
                <select className="h-[34px] w-full rounded-md border border-ink-300 bg-white px-[9px] text-[13px] focus:border-pink-500 focus:outline-none" value={st.unit} onChange={(e) => p.setOp(t.key, { unit: e.target.value as CopackPricingUnit })}>
                  {t.units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
                <input className="h-[34px] w-full rounded-md border border-ink-300 bg-white px-[9px] text-[13px] focus:border-pink-500 focus:outline-none" value={st.price} onChange={(e) => p.setOp(t.key, { price: e.target.value })} placeholder={`$${t.placeholder}`} />
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )
}

// ═══ STEP 4 · PRICING + LIVE CHECK ══════════════════════════════════════════
function StepPricing(p: {
  changeoverFee: string; setChangeoverFee: (s: string) => void
  minRun: string; setMinRun: (s: string) => void
  repeatDisc: string; setRepeatDisc: (s: string) => void
  derived: string
  q: string; setQ: (s: string) => void
  upp: string; setUpp: (s: string) => void
  upc: string; setUpc: (s: string) => void
  dirtyAll: () => void
  perLine: { li: CopackLineInput & { label: string }; cost: number | null }[]
  winnerId: string | null
  priced: ReturnType<typeof quoteCopack> | null
  crossover: number | null
  movCents: number
  qty: number
}) {
  const t = (fn: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { fn(e.target.value); p.dirtyAll() }
  const { perLine, priced, qty } = p
  const oob = (li: CopackLineInput) => (qty < li.minRunUnits ? `below its ${li.minRunUnits.toLocaleString()} minimum` : `above its ${(li.maxRunUnits ?? 0).toLocaleString()} ceiling`)

  let xMsg: React.ReactNode = 'Add at least one line to run the check.'
  if (perLine.length) {
    if (!priced?.ok) xMsg = 'No line on your floor can run this quantity. The job routes to another co-packer, or the manufacturer self-assembles.'
    else if (p.crossover && p.crossover > 0) xMsg = <>Your changeover crossover is <b className="text-neon-500">{Math.round(p.crossover).toLocaleString()} units</b>. Below it, the shorter-changeover line wins because the faster line's changeover cannot amortize. Above it, speed wins. You did not set that number: it fell out of your own lines.</>
    else xMsg = 'Only one line qualifies at this quantity, so there is no contest to resolve.'
    if (priced?.ok && p.movCents > 0 && priced.totalCents < p.movCents) xMsg = <>{xMsg} <b className="text-neon-500">This job is under your {f0(p.movCents)} order-value floor</b>, so routing would not offer it to you at all.</>
  }

  return (
    <>
      <Hero eyebrow="Step 5" title="Pricing" desc="You already priced the operations. This step prices the thing operations cannot see: the run itself. Changeover is the number that decides which jobs are worth taking, and it is the number co-packers most often leave implicit." />
      <Card title="Run charges" sub="Charged once per production run, whatever the quantity.">
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="Changeover / setup" hint={p.derived}><input className={inputCls} value={p.changeoverFee} onChange={t(p.setChangeoverFee)} placeholder="derive from line" /></F>
          <F label="Minimum run charge" hint="The floor a short run cannot go under."><input className={inputCls} value={p.minRun} onChange={t(p.setMinRun)} placeholder="$450" /></F>
          <F label="Repeat-run discount" hint="Same SKU inside 90 days: no re-qualification."><input className={inputCls} value={p.repeatDisc} onChange={t(p.setRepeatDisc)} placeholder="35%" /></F>
        </div>
      </Card>

      {/* Live check — dark sim card */}
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
        <h3 className="flex items-center gap-2 font-display text-[15px] font-bold text-white">
          Live check
          <span className="rounded-pill bg-neon-500 px-[7px] py-[2px] text-[10px] font-extrabold uppercase tracking-[0.04em] text-ink-900">what routing will actually do</span>
        </h3>
        <p className="mt-1 text-[12.5px] text-ink-400">Type a quantity. This runs the same maths the engine runs.</p>

        <div className="my-3.5 flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">Order quantity (units)</span><input className="h-[38px] w-[130px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={p.q} onChange={t(p.setQ)} /></label>
          <label className="block"><span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">Units per pack</span><input className="h-[38px] w-[110px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={p.upp} onChange={t(p.setUpp)} /></label>
          <label className="block"><span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">Units per case</span><input className="h-[38px] w-[110px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={p.upc} onChange={t(p.setUpc)} /></label>
          <span className="self-center pb-1 text-[12px] text-ink-400">try 300 · 2,400 · 20,000 · 90,000</span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {perLine.map(({ li, cost }) => {
            const win = p.winnerId === li.id
            return (
              <div key={li.id} className={`rounded-xl border p-3 ${win ? 'border-neon-500 bg-neon-500/10' : cost == null ? 'border-ink-700 bg-ink-800 opacity-45' : 'border-ink-700 bg-ink-800'}`}>
                <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${win ? 'text-neon-500' : 'text-ink-400'}`}>{li.label}</div>
                <div className="mt-1 font-display text-[20px] font-extrabold text-white">{cost == null ? '—' : fmt(cost)}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-400">{cost == null ? '' : `${fmt(cost / qty)} / unit`}</div>
                {cost == null && <div className="mt-1.5 text-[11px] font-semibold text-warning-500">{oob(li)}</div>}
              </div>
            )
          })}
          <div className={`rounded-xl border p-3 ${priced?.ok ? 'border-neon-500 bg-neon-500/10' : 'border-ink-700 bg-ink-800 opacity-45'}`}>
            <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${priced?.ok ? 'text-neon-500' : 'text-ink-400'}`}>Your co-pack fee</div>
            <div className="mt-1 font-display text-[20px] font-extrabold text-white">{priced?.ok ? f0(priced.totalCents) : '—'}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-400">{priced?.ok ? `${(priced.totalCents / qty / 100).toFixed(3)} / unit` : 'no line can run this'}</div>
            {priced?.ok && priced.minRunApplied && <div className="mt-1.5 text-[11px] font-semibold text-warning-500">minimum run charge applied</div>}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">{xMsg}</div>

        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px]">
          <div className="mb-0.5 font-bold text-white">Where your fee lands in the creator's bill</div>
          <FeeBar totalCents={priced?.ok ? priced.totalCents : null} qty={qty} />
        </div>
      </div>
    </>
  )
}

// Illustrative goods/print values; the POINT is the RULE (co-pack is partner-set
// + creator-paid → inside the production subtotal and the platform-fee base).
function FeeBar({ totalCents, qty }: { totalCents: number | null; qty: number }) {
  if (totalCents == null || qty <= 0) return <p className="mt-2 text-[12px] text-ink-400">No quote at this quantity.</p>
  const goods = Math.round(qty * 0.62 * 100), print = Math.round(qty * 0.09 * 100)
  const base = goods + print + totalCents, fee = Math.round(base * 0.12), ship = Math.round(base * 0.14)
  const grand = base + fee + ship
  const seg: [string, number, string, boolean][] = [
    ['Goods', goods, '#6B6D78', false],
    ['Print', print, '#7FB3FF', false],
    ['Co-pack', totalCents, '#FF2E63', false],
    ['Platform fee 12%', fee, '#B5FF3D', true],
    ['Shipping', ship, '#33343C', false],
  ]
  return (
    <>
      <div className="mt-2.5 flex h-[30px] overflow-hidden rounded-md border border-ink-700">
        {seg.map(([n, cval, col, dark]) => {
          const pct = (cval / grand) * 100
          return (
            <div key={n} title={`${n}: ${f0(cval)}`} style={{ width: `${pct}%`, background: col, color: dark ? '#18181A' : '#fff' }} className="grid place-items-center overflow-hidden whitespace-nowrap text-[10.5px] font-bold">
              {pct > 9 ? n : ''}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] text-ink-400">
        Your <b className="text-pink-300">{f0(totalCents)}</b> co-pack fee is inside the production subtotal, so the creator's tier fee is charged on it like every other partner-set line. The platform fee comes off the <i>creator</i>, not out of your payout. Shipping sits outside the base: we quote it from the carrier and keep that margin, so nobody can shift a production price into freight to shrink the take rate.
      </p>
    </>
  )
}

// ═══ STEP 5 · REVIEW ═════════════════════════════════════════════════════════
function StepReview(p: { lines: number; containers: number; fills: number; packs: number; opsOn: number; changeoverFee: string; minRun: string; mov: string; appliesLabels: boolean }) {
  const ok = (b: boolean) => (
    <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-extrabold text-white ${b ? 'bg-success-500' : 'bg-ink-300'}`}>{b ? '✓' : '!'}</span>
  )
  const Row = ({ good, label, help }: { good: boolean; label: string; help: string }) => (
    <div className="flex items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0">
      {ok(good)}
      <span><span className="text-[13.5px] font-semibold text-ink-900">{label}</span><br /><span className="text-[11.5px] text-ink-500">{help}</span></span>
    </div>
  )
  return (
    <>
      <Hero eyebrow="Step 6" title="Review & publish" desc="What you have declared, and exactly what it turns on." />
      <Card title="Completeness">
        <Row good={p.lines > 0} label="Lines declared" help={`${p.lines} active line${p.lines === 1 ? '' : 's'} with speed + changeover + rate.`} />
        <Row good={p.containers > 0 && p.fills > 0} label="Scope is a hard filter" help={`${p.containers} formats · ${p.fills} fills · ${p.packs} pack styles. Jobs outside this never reach you.`} />
        <Row good={p.opsOn > 0} label="Operation menu priced" help={`${p.opsOn} of 8 operations on.`} />
        <Row good={Boolean(p.minRun.trim() || p.changeoverFee.trim())} label="Run charges set" help={`Changeover ${p.changeoverFee.trim() ? p.changeoverFee : '(derived)'} · minimum run ${p.minRun.trim() || '—'} · order-value floor ${p.mov.trim() || '—'}.`} />
      </Card>
      <Card title="You also run" tag="Service composition" sub="One login, one company, separate services. Each carries its own capabilities, its own rating and its own rules.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['🏭', 'Manufacturing', 'Owner-pinned to your templates. Never rotated, never shopped.'],
            ['📦', 'Co-packing', 'Auto-derived legs when a carton or shipper is in the graph.'],
            ['🖨', 'Label printing', 'Prints for your own routed jobs and co-partners who nominate you.'],
            ['🏢', 'Warehouse', 'Selected per order by fit: temp class, location, capacity.'],
          ].map(([ic, tt, ss]) => (
            <div key={tt} className="rounded-xl border border-ink-200 bg-white p-3 text-center">
              <div className="text-[18px]">{ic}</div>
              <div className="mt-1.5 font-display text-[12.5px] font-bold text-ink-900">{tt}</div>
              <div className="mt-1 text-[10.5px] leading-[1.4] text-ink-500">{ss}</div>
            </div>
          ))}
        </div>
        <Note>
          <b>Why your press is not in the print rotation.</b> The public print pool is for pure print providers. Because you also run co-packing, your print service is excluded from the fair-share lottery by design, and that is a protection, not a demotion: it stops a full-service partner from vacuuming up rotation awards that keep independent printers alive. Your press still prints every label for jobs you already hold, and any co-partner can still nominate you directly.
        </Note>
      </Card>
      <Card title="The honest gap, stated plainly">
        <p className="text-[12.5px] leading-[1.7] text-ink-600">
          What you priced here is now stored on your service. It does not yet reach a creator's invoice: wiring the co-pack quote into the order price is CP-3, and it ships behind a shadow (compute, log, charge unchanged) before it ever moves money. Until then a co-pack leg is still paid a flat 7% of the creator's unit price. This builder is the first half: a real price a co-packer can finally author.
        </p>
      </Card>
    </>
  )
}

// ─── hero ───────────────────────────────────────────────────────────────────
