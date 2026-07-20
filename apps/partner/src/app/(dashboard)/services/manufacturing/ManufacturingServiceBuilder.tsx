'use client'

// MB-4 — the manufacturing service builder (docs/PARTNER_SERVICE_BUILDER_FAMILY_PLAN §2 + the
// manufacturing service-builder prototype). Body follows the prototype; the stepper is the
// co-creation .stagebar (same family as the co-pack + print builders). Live check runs the REAL engine
// (@ilaunchify/orders/batch-economics).
//
// THE ONE ADAPTATION the prototype needed (Pavel's MOQ split, 2026-07-19): the SERVICE builder owns the
// LINES (equipment, reused across products), NOT the batch SIZE. Batch size is a per-product field
// (product builder), so MOQ is derived PER PRODUCT. The live check here therefore takes a HYPOTHETICAL
// batch size to demonstrate a line's economics; the real per-product size lives in the product builder.
//
// SCOPE (this slice, verifiable): Basics + Lines + Scope + Floors & live check + Review. Persistence
// (the writer + page) is the gated next slice (needs the MB-1 db:push). No em-dash anywhere.

import { useMemo, useState } from 'react'
import { assessBatchRun, type BatchConfigInput } from '@ilaunchify/orders/batch-economics'
import { saveManufacturingBuilder, type ManufacturingBuilderPayload } from './actions'

interface LineDraft {
  id: string
  name: string
  rate: string // $/h
  changeoverHours: string
  maxBatches: string
  allergen: string
  capacityHours: string
  active: boolean
}

export interface ManufacturingBuilderInitial {
  serviceId: string
  serviceName: string
  leadStock: string
  leadCustom: string
  minOrderValue: string
  overrunPolicyPct: string
  categories: string[]
  fillTypes: string[]
  containerFormats: string[]
  lines: LineDraft[]
}

const num = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0
const centsOf = (s: string) => Math.round(num(s) * 100)
const intOf = (s: string) => Math.round(num(s))
const f0 = (c: number) => '$' + Math.round(c / 100).toLocaleString()

const CATEGORIES = ['FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT', 'COSMETIC', 'PET']
const FILL_TYPES = ['Powder', 'Liquid', 'Capsule / tablet', 'Cream / gel', 'Gummy']
const CONTAINERS = ['Bottle', 'Jar', 'Tub', 'Pouch', 'Sachet', 'Stick pack', 'Can', 'Carton']

const STAGES = ['Basics', 'Lines', 'Scope', 'Floors & check', 'Publish'] as const

let SEQ = 0
const newId = () => `line-${SEQ++}-${Math.random().toString(36).slice(2, 6)}`
const blankLine = (): LineDraft => ({ id: newId(), name: '', rate: '', changeoverHours: '', maxBatches: '', allergen: '', capacityHours: '', active: true })

const inputCls = 'h-[38px] w-full rounded-md border border-ink-300 bg-white px-[11px] text-[13.5px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

export function ManufacturingServiceBuilder({ initial }: { initial: ManufacturingBuilderInitial }) {
  const [v, setV] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [serviceName, setServiceName] = useState(initial.serviceName)
  const [leadStock, setLeadStock] = useState(initial.leadStock)
  const [leadCustom, setLeadCustom] = useState(initial.leadCustom)
  const [minOrderValue, setMinOrderValue] = useState(initial.minOrderValue)
  const [overrunPolicyPct, setOverrunPolicyPct] = useState(initial.overrunPolicyPct)
  const [categories, setCategories] = useState<Set<string>>(new Set(initial.categories))
  const [fills, setFills] = useState<Set<string>>(new Set(initial.fillTypes))
  const [containers, setContainers] = useState<Set<string>>(new Set(initial.containerFormats))
  const [lines, setLines] = useState<LineDraft[]>(initial.lines.length ? initial.lines : [blankLine()])

  // Live check inputs — a HYPOTHETICAL product batch to demonstrate the lines.
  const [batchSize, setBatchSize] = useState('1000')
  const [batchTimeHours, setBatchTimeHours] = useState('3')
  const [q, setQ] = useState('800')
  const [unitPrice, setUnitPrice] = useState('4.20')

  const setLine = (id: string, patch: Partial<LineDraft>) => setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addLine = () => setLines((rows) => [...rows, blankLine()])
  const removeLine = (id: string) => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))
  const toggleIn = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) =>
    set((prev) => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n })

  // ── engine: each active line runs the HYPOTHETICAL batch ──
  const configs: (BatchConfigInput & { lineName: string })[] = useMemo(
    () =>
      lines
        .filter((l) => l.active && num(l.rate) > 0)
        .map((l) => ({
          id: l.id,
          lineName: l.name.trim() || 'Unnamed line',
          unitsPerBatch: intOf(batchSize),
          batchTimeMinutes: Math.round(num(batchTimeHours) * 60),
          changeoverMinutes: Math.round(num(l.changeoverHours) * 60),
          loadedRateCentsPerHour: centsOf(l.rate),
          maxBatchesPerRun: intOf(l.maxBatches) || 1,
          status: 'ACTIVE',
        })),
    [lines, batchSize, batchTimeHours],
  )

  const assessment = configs.length
    ? assessBatchRun(configs, {
        qty: intOf(q),
        unitPriceCents: centsOf(unitPrice),
        overrunPolicyPct: intOf(overrunPolicyPct) || 100,
        minOrderValueCents: minOrderValue.trim() ? centsOf(minOrderValue) : null,
      })
    : null
  const winnerLine = assessment?.selectedConfigId ? configs.find((c) => c.id === assessment.selectedConfigId)?.lineName : null

  function save() {
    setError(null)
    const payload: ManufacturingBuilderPayload = {
      serviceName: serviceName.trim() || null,
      leadStockDays: leadStock.trim() ? intOf(leadStock) : null,
      leadCustomDays: leadCustom.trim() ? intOf(leadCustom) : null,
      minOrderValueCents: minOrderValue.trim() ? centsOf(minOrderValue) : null,
      overrunPolicyPct: overrunPolicyPct.trim() ? intOf(overrunPolicyPct) : null,
      categories: [...categories],
      fillTypes: [...fills],
      containerFormats: [...containers],
      lines: lines
        .filter((l) => l.name.trim() || num(l.rate) > 0)
        .map((l) => ({
          name: l.name.trim() || 'Line',
          loadedRateCentsPerHour: centsOf(l.rate),
          changeoverMinutes: Math.round(num(l.changeoverHours) * 60),
          maxBatchesPerRun: intOf(l.maxBatches) || 1,
          weeklyCapacityHours: l.capacityHours.trim() ? intOf(l.capacityHours) : null,
          allergenClass: l.allergen.trim() || null,
          active: l.active,
        })),
    }
    setPending(true)
    void saveManufacturingBuilder(initial.serviceId, payload).then((res) => {
      setPending(false)
      if (res.ok) setSaved(true)
      else setError(res.error)
    })
  }

  return (
    <div className="mx-auto max-w-[1080px] pb-24">
      <div className="flex items-center gap-[5px] overflow-x-auto rounded-t-2xl border border-ink-200 bg-ink-50 px-5 py-[11px]">
        {STAGES.map((label, i) => {
          const state = i < v ? 'done' : i === v ? 'on' : ''
          return (
            <div key={label} className="flex items-center gap-[5px]">
              <button type="button" onClick={() => setV(i)} className={`flex items-center gap-2 whitespace-nowrap rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${state === 'on' ? 'border-pink-200 bg-white text-ink-900 shadow-sm' : state === 'done' ? 'border-transparent text-success-700' : 'border-transparent text-ink-500'}`}>
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-extrabold ${state === 'on' ? 'bg-pink-500 text-white' : state === 'done' ? 'bg-success-500 text-white' : 'bg-ink-200 text-ink-600'}`}>{i < v ? '✓' : i + 1}</span>
                {label}
              </button>
              {i < STAGES.length - 1 && <span className={`h-0.5 w-5 flex-none ${i < v ? 'bg-success-500' : 'bg-ink-200'}`} />}
            </div>
          )
        })}
        <span className="flex-1" />
        <button type="button" onClick={() => setV((x) => Math.min(STAGES.length - 1, x + 1))} disabled={v >= STAGES.length - 1} className="rounded-pill bg-ink-900 px-4 py-[9px] text-[12.5px] font-bold text-white hover:bg-black disabled:opacity-40">Next stage →</button>
      </div>

      <div className="rounded-b-2xl border border-t-0 border-ink-200 bg-ink-100 p-4">
        {v === 0 && (
          <Hero eyebrow="Manufacturing service" title="Service basics" desc="Who you are and your commercial floor. Creators see your Front Face, not this.">
            <div className="grid gap-[14px] sm:grid-cols-2">
              <F label="Service name" hint="Internal."><input className={inputCls} value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Rialto Formulations" /></F>
              <F label="Minimum order value" hint="Binds even when the unit count clears every MOQ."><input className={inputCls} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} placeholder="$2,500" /></F>
              <F label="Lead time, stock formula (days)"><input className={inputCls} value={leadStock} onChange={(e) => setLeadStock(e.target.value)} placeholder="21" /></F>
              <F label="Lead time, custom formula (days)" hint="Includes R&D + first-article."><input className={inputCls} value={leadCustom} onChange={(e) => setLeadCustom(e.target.value)} placeholder="45" /></F>
            </div>
          </Hero>
        )}

        {v === 1 && (
          <Hero eyebrow="Step 2" title="Your lines" desc="A line is your EQUIPMENT, reused across products: its rate, changeover and batch ceiling. The batch SIZE is a property of each product, set in the product builder, so a product's MOQ is derived from its batch on the line you assign it. That is why a maker runs sparkling water at a 30k batch and peanut packs at 5k from the same lines.">
            {lines.map((l) => (
              <div key={l.id} className={`mb-2.5 rounded-xl border px-4 py-3.5 ${l.active ? 'border-pink-200 bg-white shadow-[0_0_0_3px_rgba(255,46,99,0.07)]' : 'border-ink-200 bg-ink-50'}`}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <button type="button" onClick={() => setLine(l.id, { active: !l.active })} aria-label="Toggle line" className={`relative h-[22px] w-[38px] flex-none rounded-pill transition ${l.active ? 'bg-pink-500' : 'bg-ink-300'}`}>
                    <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${l.active ? 'left-[19px]' : 'left-[3px]'}`} />
                  </button>
                  <input className="min-w-0 flex-1 border-0 bg-transparent font-display text-[14px] font-bold text-ink-900 focus:outline-none" value={l.name} onChange={(e) => setLine(l.id, { name: e.target.value })} placeholder="Kettle line" />
                  {lines.length > 1 && <button type="button" onClick={() => removeLine(l.id)} className="text-[11.5px] font-semibold text-danger-500 hover:underline">Remove</button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <F label="Loaded rate ($ / hour)" hint="Labour + line."><input className={inputCls} value={l.rate} onChange={(e) => setLine(l.id, { rate: e.target.value })} placeholder="$310" /></F>
                  <F label="Changeover (hours)"><input className={inputCls} value={l.changeoverHours} onChange={(e) => setLine(l.id, { changeoverHours: e.target.value })} placeholder="2.5" /></F>
                  <F label="Max batches / run" hint="Beyond this it stops paying."><input className={inputCls} value={l.maxBatches} onChange={(e) => setLine(l.id, { maxBatches: e.target.value })} placeholder="40" /></F>
                  <F label="Weekly capacity (hours)" hint="Optional. The slice you give the platform."><input className={inputCls} value={l.capacityHours} onChange={(e) => setLine(l.id, { capacityHours: e.target.value })} placeholder="40" /></F>
                </div>
                <div className="mt-3 sm:w-1/2">
                  <F label="Allergen segregation"><input className={inputCls} value={l.allergen} onChange={(e) => setLine(l.id, { allergen: e.target.value })} placeholder="Nut-free segregated" /></F>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLine} className="mt-1 rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">+ Add a line</button>
          </Hero>
        )}

        {v === 2 && (
          <Hero eyebrow="Step 3" title="What you make" desc="Hard filters: routing will never send you a job outside this. A narrow, honest scope wins more work than a wide, hopeful one.">
            <Card title="Product categories"><Chips opts={CATEGORIES} value={categories} onToggle={toggleIn(setCategories)} labels={{ BEVERAGE_FUNCTIONAL: 'Beverage (functional)' }} /></Card>
            <Card title="Fill types"><Chips opts={FILL_TYPES} value={fills} onToggle={toggleIn(setFills)} /></Card>
            <Card title="Container formats"><Chips opts={CONTAINERS} value={containers} onToggle={toggleIn(setContainers)} /></Card>
          </Hero>
        )}

        {v === 3 && (
          <Hero eyebrow="Step 4" title="Floors & live check" desc="Your overrun policy, and a live check that runs the real engine. Enter a HYPOTHETICAL product batch to see how a product would run on your lines. The real per-product batch is set in the product builder.">
            <Card title="Overrun policy">
              <F label="Overrun policy (%)" hint="You cannot make half a batch. 100 = the creator buys the full batch (the honest default: you did not choose to make the extra). Below 100 = you absorb the rest.">
                <input className={`${inputCls} sm:w-40`} value={overrunPolicyPct} onChange={(e) => setOverrunPolicyPct(e.target.value)} placeholder="100" />
              </F>
            </Card>
            <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
              <div className="mb-3.5 flex flex-wrap items-end gap-3">
                <DarkF label="Hypothetical batch (units)" value={batchSize} onChange={setBatchSize} />
                <DarkF label="Batch time (hours)" value={batchTimeHours} onChange={setBatchTimeHours} />
                <DarkF label="Order quantity" value={q} onChange={setQ} />
                <DarkF label="Unit price you quote" value={unitPrice} onChange={setUnitPrice} />
              </div>
              {!assessment ? (
                <div className="rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">Add a line with a rate to run the check.</div>
              ) : !assessment.ok ? (
                <div className="rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-warning-500">No line can make this quantity of that batch (past its max-batches ceiling).</div>
              ) : (
                <>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <Stat label="Derived MOQ" value={assessment.moqUnits.toLocaleString()} sub="= one batch · derived, not typed" win />
                    <Stat label={`Made on ${winnerLine ?? 'a line'}`} value={`${assessment.run!.producedUnits.toLocaleString()} units`} sub={`${assessment.run!.batches} batch${assessment.run!.batches > 1 ? 'es' : ''}`} />
                    <Stat label="Creator billed" value={`${assessment.billedUnits.toLocaleString()} units`} sub={`${f0(assessment.billedUnits * centsOf(unitPrice))}`} />
                  </div>
                  <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">
                    {assessment.run!.overrunUnits > 0
                      ? <>The order asked for {intOf(q).toLocaleString()}, the kettle makes {assessment.run!.producedUnits.toLocaleString()}, so <b className="text-neon-500">{assessment.run!.overrunUnits.toLocaleString()} units</b> of overrun exist. At {intOf(overrunPolicyPct) || 100}% the creator is billed {assessment.billedUnits.toLocaleString()}.</>
                      : <>It lands on a batch multiple, so there is no overrun.</>}
                    {!assessment.onLattice && <> The quantity snaps up to <b className="text-neon-500">{assessment.latticeSnappedUnits.toLocaleString()}</b> (the lattice); routing quotes that, the number your floor actually produces.</>}
                    {assessment.belowOrderValueFloor && <> <b className="text-neon-500">This job is under your {minOrderValue} order-value floor</b>, so routing would not offer it.</>}
                  </div>
                </>
              )}
            </div>
          </Hero>
        )}

        {v === 4 && (
          <Hero eyebrow="Step 5" title="Review & standing" desc="What you declared, and what it turns on.">
            <div className="rounded-2xl border border-ink-200 bg-white px-5 py-[18px]">
              <RevRow good={lines.filter((l) => l.active && num(l.rate) > 0).length > 0} label="Lines declared" help={`${lines.filter((l) => l.active && num(l.rate) > 0).length} line(s) with rate + changeover. MOQ is derived per product from its batch on these.`} />
              <RevRow good={categories.size > 0} label="Scope is a hard filter" help={`${categories.size} categories · ${fills.size} fills · ${containers.size} containers.`} />
              <RevRow good={false} label="Persistence pending MB-1 db:push" help="This slice is the lines editor + live check. The writer (lines + config) + folding in ManufacturingEditor / product-defaults land after the MB-1 db:push. Per-product batch size lives in the product builder." />
            </div>
          </Hero>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4">
          <span className="text-[12.5px] font-semibold text-ink-500">{pending ? 'Saving…' : saved ? 'All changes saved' : error ? '' : 'Draft not yet saved'}</span>
          {error && <span className="text-[12px] font-semibold text-danger-500">{error}</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => setV((x) => Math.max(0, x - 1))} disabled={v === 0} className="rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-40">Back</button>
          <button type="button" onClick={save} disabled={pending} className="rounded-pill bg-pink-500 px-5 py-2 text-[12.5px] font-bold text-white hover:bg-pink-600 disabled:opacity-40">{v === STAGES.length - 1 ? 'Save & finish' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-ink-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-400">{hint}</span>}
    </label>
  )
}
function DarkF({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <label className="block">
      <span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">{label}</span>
      <input className="h-[38px] w-[130px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
function Stat({ label, value, sub, win }: { label: string; value: string; sub: string; win?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${win ? 'border-neon-500 bg-neon-500/10' : 'border-ink-700 bg-ink-800'}`}>
      <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${win ? 'text-neon-500' : 'text-ink-400'}`}>{label}</div>
      <div className="mt-1 font-display text-[20px] font-extrabold text-white">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-400">{sub}</div>
    </div>
  )
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-ink-200 bg-white px-5 py-[18px]">
      <h2 className="mb-3 font-display text-[15px] font-bold text-ink-900">{title}</h2>
      {children}
    </div>
  )
}
function Chips({ opts, value, onToggle, labels = {} }: { opts: string[]; value: Set<string>; onToggle: (v: string) => void; labels?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-[7px]">
      {opts.map((o) => {
        const on = value.has(o)
        return (
          <button key={o} type="button" onClick={() => onToggle(o)} className={`rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${on ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400'}`}>
            {labels[o] ?? o}
          </button>
        )
      })}
    </div>
  )
}
function Hero({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <>
      <div className="mb-3.5 rounded-2xl border border-ink-200 bg-white px-[22px] py-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-pink-700">{eyebrow}</div>
        <h1 className="mt-[5px] font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink-900">{title}</h1>
        <p className="mt-1 max-w-[780px] text-[13.5px] text-ink-500">{desc}</p>
      </div>
      {children}
    </>
  )
}
function RevRow({ good, label, help }: { good: boolean; label: string; help: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0">
      <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-extrabold text-white ${good ? 'bg-success-500' : 'bg-ink-300'}`}>{good ? '✓' : '!'}</span>
      <span><span className="text-[13.5px] font-semibold text-ink-900">{label}</span><br /><span className="text-[11.5px] text-ink-500">{help}</span></span>
    </div>
  )
}
