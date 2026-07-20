'use client'

// MB-4 — the manufacturing service builder, ported 1:1 from
// design/manufacturing-service-builder-prototype.html (Pavel: match the prototype 1:1). Stepper = the
// co-creation .stagebar (same family as co-pack + print). Live check runs the REAL engine
// (@ilaunchify/orders/batch-economics): per-batch results, derived MOQ, the order lattice, the chart.
//
// THE MOQ SPLIT is honored by the prototype's OWN framing: a batch config is a DEFAULT that flows into
// every product; the product inherits + may override (ProductTemplate.unitsPerBatch), so MOQ is derived
// PER PRODUCT. Nothing here is hardcoded: every field is wired to saveManufacturingBuilder. No em-dash.

import { useMemo, useState } from 'react'
import { runBatches, selectBatchConfig, deriveBatchMoq, batchLattice, billedUnits, type BatchConfigInput } from '@ilaunchify/orders/batch-economics'
import { saveManufacturingBuilder, type ManufacturingBuilderPayload } from './actions'

interface BatchDraft {
  id: string
  name: string
  meta: string
  unitsPerBatch: string
  batchTimeHours: string
  rate: string
  changeoverHours: string
  maxBatches: string
  allergen: string
  capacityHours: string
  active: boolean
}

export interface ManufacturingBuilderInitial {
  serviceId: string
  serviceName: string
  facilityId: string
  facilities: { id: string; name: string }[]
  leadStock: string
  leadCustom: string
  minOrderValue: string
  overrunPolicyPct: string
  toolingFirstArticle: string
  changeoverFee: string
  rndFormulation: string
  rushUplift: string
  rushLeadDays: string
  maxRushPerWeek: string
  repeatDiscount: string
  categories: string[]
  fillTypes: string[]
  containerFormats: string[]
  certifications: string[]
  batches: BatchDraft[]
}

const num = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0
const centsOf = (s: string) => Math.round(num(s) * 100)
const bpsOf = (s: string) => Math.round(num(s) * 100)
const intOf = (s: string) => Math.round(num(s))
const fmt = (c: number) => '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f0 = (c: number) => '$' + Math.round(c / 100).toLocaleString()

const CATEGORIES: [string, string][] = [['FOOD', 'Food'], ['SUPPLEMENT', 'Supplement'], ['BEVERAGE_FUNCTIONAL', 'Functional beverage'], ['PET', 'Pet'], ['COSMETIC', 'Cosmetic']]
const FILL_TYPES = ['Powder', 'Dry blend', 'Capsule', 'Tablet', 'Softgel', 'Liquid · thin', 'Gummy']
const CONTAINERS = ['Tub', 'Bottle · HDPE', 'Stand-up pouch', 'Sachet', 'Stick pack', 'Jar · glass']
const CERTS = ['cGMP', 'FDA registered', 'NSF', 'USDA Organic', 'Kosher', 'Halal', 'Non-GMO Project']

const STAGES = ['Basics', 'Batches', 'Scope', 'Defaults', 'Floors & check', 'Publish'] as const

let SEQ = 0
const newId = () => `batch-${SEQ++}-${Math.random().toString(36).slice(2, 6)}`
const blankBatch = (): BatchDraft => ({ id: newId(), name: '', meta: '', unitsPerBatch: '', batchTimeHours: '', rate: '', changeoverHours: '', maxBatches: '', allergen: '', capacityHours: '', active: true })

const inputCls = 'h-[38px] w-full rounded-md border border-ink-300 bg-white px-[11px] text-[13.5px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

export function ManufacturingServiceBuilder({ initial }: { initial: ManufacturingBuilderInitial }) {
  const [v, setV] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [serviceName, setServiceName] = useState(initial.serviceName)
  const [facilityId, setFacilityId] = useState(initial.facilityId)
  const [leadStock, setLeadStock] = useState(initial.leadStock)
  const [leadCustom, setLeadCustom] = useState(initial.leadCustom)
  const [minOrderValue, setMinOrderValue] = useState(initial.minOrderValue)
  const [overrunPolicyPct, setOverrunPolicyPct] = useState(initial.overrunPolicyPct)
  const [toolingFirstArticle, setTooling] = useState(initial.toolingFirstArticle)
  const [changeoverFee, setChangeoverFee] = useState(initial.changeoverFee)
  const [rndFormulation, setRnd] = useState(initial.rndFormulation)
  const [rushUplift, setRushUplift] = useState(initial.rushUplift)
  const [rushLeadDays, setRushLeadDays] = useState(initial.rushLeadDays)
  const [maxRushPerWeek, setMaxRush] = useState(initial.maxRushPerWeek)
  const [repeatDiscount, setRepeatDiscount] = useState(initial.repeatDiscount)
  const [categories, setCategories] = useState<Set<string>>(new Set(initial.categories))
  const [fills, setFills] = useState<Set<string>>(new Set(initial.fillTypes))
  const [containers, setContainers] = useState<Set<string>>(new Set(initial.containerFormats))
  const [certs, setCerts] = useState<Set<string>>(new Set(initial.certifications))
  const [batches, setBatches] = useState<BatchDraft[]>(initial.batches.length ? initial.batches : [blankBatch()])

  const [q, setQ] = useState('800')
  const [unitPrice, setUnitPrice] = useState('4.20')

  const setBatch = (id: string, patch: Partial<BatchDraft>) => setBatches((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const addBatch = () => setBatches((r) => [...r, blankBatch()])
  const removeBatch = (id: string) => setBatches((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r))
  const tog = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (val: string) => set((p) => { const n = new Set(p); n.has(val) ? n.delete(val) : n.add(val); return n })

  // ── engine: each active batch config with a size ──
  const configs: (BatchConfigInput & { label: string })[] = useMemo(
    () =>
      batches
        .filter((b) => b.active && num(b.unitsPerBatch) > 0 && num(b.rate) > 0)
        .map((b) => ({
          id: b.id,
          label: b.name.trim() || `${intOf(b.unitsPerBatch).toLocaleString()}/batch`,
          unitsPerBatch: intOf(b.unitsPerBatch),
          batchTimeMinutes: Math.round(num(b.batchTimeHours) * 60),
          changeoverMinutes: Math.round(num(b.changeoverHours) * 60),
          loadedRateCentsPerHour: centsOf(b.rate),
          maxBatchesPerRun: intOf(b.maxBatches) || 1,
          status: 'ACTIVE',
        })),
    [batches],
  )
  const qN = intOf(q)
  const unitC = centsOf(unitPrice)
  const overPct = intOf(overrunPolicyPct) || 100
  const perConfig = configs.map((c) => ({ c, run: runBatches(c, qN) }))
  const winner = selectBatchConfig(configs, qN)
  const moq = deriveBatchMoq(configs)
  const winBilled = winner ? billedUnits(winner.run.overrunUnits, qN, overPct) : 0
  const winLattice = winner ? batchLattice(winner.config, qN) : null
  const mov = minOrderValue.trim() ? centsOf(minOrderValue) : 0
  const belowFloor = winner ? mov > 0 && winBilled * unitC < mov : false

  function save() {
    setError(null)
    const payload: ManufacturingBuilderPayload = {
      serviceName: serviceName.trim() || null,
      facilityId: facilityId || null,
      leadStockDays: leadStock.trim() ? intOf(leadStock) : null,
      leadCustomDays: leadCustom.trim() ? intOf(leadCustom) : null,
      minOrderValueCents: minOrderValue.trim() ? centsOf(minOrderValue) : null,
      overrunPolicyPct: overrunPolicyPct.trim() ? intOf(overrunPolicyPct) : null,
      toolingFirstArticleCents: toolingFirstArticle.trim() ? centsOf(toolingFirstArticle) : null,
      changeoverFeeCents: changeoverFee.trim() ? centsOf(changeoverFee) : null,
      rndFormulationCents: rndFormulation.trim() ? centsOf(rndFormulation) : null,
      rushUpliftBps: rushUplift.trim() ? bpsOf(rushUplift) : null,
      rushLeadTimeDays: rushLeadDays.trim() ? intOf(rushLeadDays) : null,
      maxRushJobsPerWeek: maxRushPerWeek.trim() ? intOf(maxRushPerWeek) : null,
      repeatRunDiscountBps: repeatDiscount.trim() ? bpsOf(repeatDiscount) : null,
      categories: [...categories],
      fillTypes: [...fills],
      containerFormats: [...containers],
      certifications: [...certs],
      lines: batches
        .filter((b) => b.name.trim() || num(b.rate) > 0)
        .map((b) => ({
          name: b.name.trim() || 'Batch',
          loadedRateCentsPerHour: centsOf(b.rate),
          changeoverMinutes: Math.round(num(b.changeoverHours) * 60),
          maxBatchesPerRun: intOf(b.maxBatches) || 1,
          unitsPerBatch: b.unitsPerBatch.trim() ? intOf(b.unitsPerBatch) : null,
          batchTimeMinutes: b.batchTimeHours.trim() ? Math.round(num(b.batchTimeHours) * 60) : null,
          weeklyCapacityHours: b.capacityHours.trim() ? intOf(b.capacityHours) : null,
          allergenClass: b.allergen.trim() || null,
          active: b.active,
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
          const st = i < v ? 'done' : i === v ? 'on' : ''
          return (
            <div key={label} className="flex items-center gap-[5px]">
              <button type="button" onClick={() => setV(i)} className={`flex items-center gap-2 whitespace-nowrap rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${st === 'on' ? 'border-pink-200 bg-white text-ink-900 shadow-sm' : st === 'done' ? 'border-transparent text-success-700' : 'border-transparent text-ink-500'}`}>
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-extrabold ${st === 'on' ? 'bg-pink-500 text-white' : st === 'done' ? 'bg-success-500 text-white' : 'bg-ink-200 text-ink-600'}`}>{i < v ? '✓' : i + 1}</span>
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
          <Hero eyebrow="Manufacturing service" title="Service basics" desc="You make the formula. This builder captures your floor and your defaults, not your prices: a formula's price is product-specific, so it belongs on the product. Everything here flows into every product you build.">
            <Note><b>How this differs from the print and co-pack builders, on purpose.</b> A printer sells a piece, so they price a curve. A co-packer sells operations, so they price a menu. You sell a formula, and no two formulas cost the same, so your prices live on your products. What lives HERE is what every product inherits: your batch physics, your hard filters, your commercial defaults, and your standing.</Note>
            <Card title="Identity">
              <div className="grid gap-[14px] sm:grid-cols-2">
                <F label="Service name" hint="Internal. Creators see your Front Face, not this."><input className={inputCls} value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Cascade Nutrition · Blending & Fill" /></F>
                <F label="Facility"><select className={inputCls} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}><option value="">Not set</option>{initial.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></F>
              </div>
              <div className="mt-[14px] grid gap-3 sm:grid-cols-3">
                <F label="Lead time, stock formula (days)"><input className={inputCls} value={leadStock} onChange={(e) => setLeadStock(e.target.value)} placeholder="18" /></F>
                <F label="Lead time, custom formula (days)" hint="Includes R&D + first-article."><input className={inputCls} value={leadCustom} onChange={(e) => setLeadCustom(e.target.value)} placeholder="45" /></F>
                <F label="Minimum order value" hint="Binds even when the unit count clears every MOQ."><input className={inputCls} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} placeholder="$2,500" /></F>
              </div>
            </Card>
          </Hero>
        )}

        {v === 1 && (
          <Hero eyebrow="Step 2" title="Your batches" desc="The batch is the unit of truth on a blending floor, the way a press is in a print shop. You cannot make half a batch. That single fact is where your MOQ comes from, and it is why orders land on multiples.">
            <Note><b>Do not type an MOQ.</b> Your minimum is not a number you choose, it is a number your kettle chooses. Declare the batch honestly and the floor falls out, along with the lattice. The batch size here is the DEFAULT every product inherits; a product overrides it when it genuinely differs.</Note>
            <Card title={`Batch configurations — ${configs.length} active`}>
              {batches.map((b) => (
                <div key={b.id} className={`mb-2.5 rounded-xl border px-4 py-3.5 ${b.active ? 'border-pink-200 bg-white shadow-[0_0_0_3px_rgba(255,46,99,0.07)]' : 'border-ink-200 bg-ink-50'}`}>
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <button type="button" onClick={() => setBatch(b.id, { active: !b.active })} aria-label="Toggle batch" className={`relative h-[22px] w-[38px] flex-none rounded-pill transition ${b.active ? 'bg-pink-500' : 'bg-ink-300'}`}><span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${b.active ? 'left-[19px]' : 'left-[3px]'}`} /></button>
                    <input className="min-w-0 flex-1 border-0 bg-transparent font-display text-[14px] font-bold text-ink-900 focus:outline-none" value={b.name} onChange={(e) => setBatch(b.id, { name: e.target.value })} placeholder="Ribbon blender · 500 kg" />
                    {batches.length > 1 && <button type="button" onClick={() => removeBatch(b.id)} className="text-[11.5px] font-semibold text-danger-500 hover:underline">Remove</button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <F label="Units per batch" hint="The default every product inherits."><input className={inputCls} value={b.unitsPerBatch} onChange={(e) => setBatch(b.id, { unitsPerBatch: e.target.value })} placeholder="1000" /></F>
                    <F label="Batch time (hours)"><input className={inputCls} value={b.batchTimeHours} onChange={(e) => setBatch(b.id, { batchTimeHours: e.target.value })} placeholder="3" /></F>
                    <F label="Loaded rate ($ / hour)"><input className={inputCls} value={b.rate} onChange={(e) => setBatch(b.id, { rate: e.target.value })} placeholder="$310" /></F>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <F label="Changeover (hours)" hint="Full wet clean between formulas."><input className={inputCls} value={b.changeoverHours} onChange={(e) => setBatch(b.id, { changeoverHours: e.target.value })} placeholder="2.5" /></F>
                    <F label="Max batches / run"><input className={inputCls} value={b.maxBatches} onChange={(e) => setBatch(b.id, { maxBatches: e.target.value })} placeholder="40" /></F>
                    <F label="Allergen segregation"><input className={inputCls} value={b.allergen} onChange={(e) => setBatch(b.id, { allergen: e.target.value })} placeholder="Segregated · nut-free" /></F>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addBatch} className="mt-1 rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">+ Add a batch configuration</button>
            </Card>
          </Hero>
        )}

        {v === 2 && (
          <Hero eyebrow="Step 3" title="What you make" desc="Hard filters. Routing will never send you a formula you cannot run, and a creator will never see you for one. Say no freely.">
            <Card title="Categories"><p className="mb-3 text-[12.5px] text-ink-500">The regulated domains you are set up for. Each carries its own label law.</p><Chips opts={CATEGORIES.map((c) => c[0])} labels={Object.fromEntries(CATEGORIES)} value={categories} onToggle={tog(setCategories)} /></Card>
            <Card title="Fill types"><Chips opts={FILL_TYPES} value={fills} onToggle={tog(setFills)} /></Card>
            <Card title="Container formats"><Chips opts={CONTAINERS} value={containers} onToggle={tog(setContainers)} /></Card>
            <Card title="Certifications"><p className="mb-3 text-[12.5px] text-ink-500">Admin verifies each one. A false claim here is a platform loss, so they stay pending until proven.</p><Chips opts={CERTS} value={certs} onToggle={tog(setCerts)} /></Card>
          </Hero>
        )}

        {v === 3 && (
          <Hero eyebrow="Step 4" title="Commercial defaults" desc="Set once here, inherited by every product you build. Override any on an individual product when it genuinely differs. This is the retyping you never have to do again.">
            <Note><b>Every line below is partner-set and creator-paid</b>, so it sits inside the production subtotal and carries the platform fee like your unit price does. Anything you leave at zero simply is not charged.</Note>
            <Card title="Defaults inherited by every product">
              <Dflt title="Tooling / first-article" desc="One-off per new formula: scale-up, first-article, retains." value={toolingFirstArticle} onChange={setTooling} placeholder="$850" foot="Charged once, on the first run of a formula." />
              <Dflt title="Changeover / setup" desc="Per run, whatever the quantity." value={changeoverFee} onChange={setChangeoverFee} placeholder="$775" />
              <Dflt title="R&D / formulation" desc="Custom formula development. Quoted, not auto-charged." value={rndFormulation} onChange={setRnd} placeholder="$2,400" foot="Only on custom-formula products." />
              <div className="grid gap-3 border-b border-ink-100 py-2.5 sm:grid-cols-3">
                <F label="Rush uplift" hint="Applied to the production subtotal."><input className={inputCls} value={rushUplift} onChange={(e) => setRushUplift(e.target.value)} placeholder="18%" /></F>
                <F label="Cuts stock lead to (days)"><input className={inputCls} value={rushLeadDays} onChange={(e) => setRushLeadDays(e.target.value)} placeholder="9" /></F>
                <F label="Max rush runs / week"><input className={inputCls} value={maxRushPerWeek} onChange={(e) => setMaxRush(e.target.value)} placeholder="2" /></F>
              </div>
              <Dflt title="Repeat-run discount" desc="Same formula inside 120 days: no re-qualification, no first-article." value={repeatDiscount} onChange={setRepeatDiscount} placeholder="40%" foot="Applied to changeover, not to units." />
              <Dflt title="Overrun policy" desc="A batch makes what a batch makes. Who owns the remainder?" value={overrunPolicyPct} onChange={setOverrunPolicyPct} placeholder="100%" foot="Share of overrun units the creator pays for. 100% = they buy the full batch. See step 5." />
            </Card>
          </Hero>
        )}

        {v === 4 && (
          <Hero eyebrow="Step 5" title="Floors & live check" desc="Your MOQ and your order lattice are DERIVED, not typed. Here is what they are, and what routing will do with them.">
            <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
              <div className="mb-3.5 flex flex-wrap items-end gap-3">
                <DarkF label="Order quantity (units)" value={q} onChange={setQ} />
                <DarkF label="Unit price you quote" value={unitPrice} onChange={setUnitPrice} />
                <span className="self-center pb-1 text-[12px] text-ink-400">try 60 · 800 · 2,600 · 24,000</span>
              </div>
              {configs.length === 0 ? (
                <div className="rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">Add a batch configuration with a size and rate to run the check.</div>
              ) : (
                <>
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {perConfig.map(({ c, run }) => {
                      const win = winner?.config.id === c.id
                      return (
                        <div key={c.id} className={`rounded-xl border p-3 ${win ? 'border-neon-500 bg-neon-500/10' : run == null ? 'border-ink-700 bg-ink-800 opacity-45' : 'border-ink-700 bg-ink-800'}`}>
                          <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${win ? 'text-neon-500' : 'text-ink-400'}`}>{c.label}</div>
                          <div className="mt-1 font-display text-[20px] font-extrabold text-white">{run == null ? '—' : fmt(run.costCents)}</div>
                          <div className="mt-0.5 text-[11.5px] text-ink-400">{run == null ? `past its ${c.maxBatchesPerRun}-batch ceiling` : `${run.batches} batch${run.batches > 1 ? 'es' : ''} → ${run.producedUnits.toLocaleString()} units`}</div>
                          {run && run.overrunUnits > 0 && <div className="mt-1 text-[11px] font-semibold text-warning-500">{run.overrunUnits.toLocaleString()} overrun</div>}
                        </div>
                      )
                    })}
                    <div className={`rounded-xl border p-3 ${moq ? 'border-neon-500 bg-neon-500/10' : 'border-ink-700 bg-ink-800 opacity-45'}`}>
                      <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${moq ? 'text-neon-500' : 'text-ink-400'}`}>Derived floor</div>
                      <div className="mt-1 font-display text-[20px] font-extrabold text-white">{moq ? moq.toLocaleString() : '—'}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-400">{moq ? 'units · derived, not typed' : ''}</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">
                    {!winner ? 'No batch configuration can make this quantity.' : (
                      <>Your kettle makes <b className="text-neon-500">{winner.run.producedUnits.toLocaleString()}</b> units in {winner.run.batches} batch{winner.run.batches > 1 ? 'es' : ''}. {winner.run.overrunUnits > 0
                        ? <>The order asked for {qN.toLocaleString()}, so {winner.run.overrunUnits.toLocaleString()} units of overrun exist. At {overPct}% the creator is billed for <b className="text-neon-500">{winBilled.toLocaleString()}</b> units ({f0(winBilled * unitC)}).</>
                        : <>It lands exactly on a batch multiple, so there is no overrun.</>}
                        {belowFloor && <> <b className="text-neon-500">This job is under your {minOrderValue} order-value floor</b>, so routing would not offer it.</>}</>
                    )}
                  </div>
                  {winner && (
                    <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px]">
                      <div className="mb-1 font-bold text-white">Your order lattice</div>
                      <div className="mb-2 text-[12px] text-ink-400">An order can only land on a batch multiple. Amber is what your quantity rounds up to.</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: Math.min(winner.config.maxBatchesPerRun, 10) }, (_, i) => {
                          const u = (i + 1) * winner.config.unitsPerBatch
                          const hit = u === qN
                          const rounded = winLattice && u === winLattice.snappedUnits && !winLattice.onLattice
                          return <span key={u} className={`rounded-md px-2 py-1 text-[11.5px] font-semibold ${hit ? 'bg-neon-500 text-ink-900' : rounded ? 'bg-warning-500 text-ink-900' : 'border border-ink-700 text-ink-300'}`}>{u.toLocaleString()}</span>
                        })}
                      </div>
                      {winLattice && !winLattice.onLattice && <div className="mt-2 text-[12px] text-ink-300"><b className="text-white">{qN.toLocaleString()}</b> is not on the lattice, so it rounds up to <b className="text-neon-500">{winLattice.snappedUnits.toLocaleString()}</b>. Routing quotes the lattice quantity, the number your floor actually produces.</div>}
                    </div>
                  )}
                </>
              )}
            </div>
          </Hero>
        )}

        {v === 5 && (
          <Hero eyebrow="Step 6" title="Review & standing" desc="What you declared, and the badge it earns.">
            <div className="rounded-2xl border border-ink-200 bg-white px-5 py-[18px]">
              <RevRow good={configs.length > 0} label="Batch configurations declared" help={`${configs.length} active. MOQ is derived per product from its batch on these.`} />
              <RevRow good={categories.size > 0} label="Scope is a hard filter" help={`${categories.size} categories · ${fills.size} fills · ${containers.size} containers · ${certs.size} certs.`} />
              <RevRow good={Boolean(changeoverFee.trim() || toolingFirstArticle.trim())} label="Commercial defaults set" help={`Every product inherits these; override per product.`} />
            </div>
            <Card title="Your standing — Merit">
              <p className="mb-3 text-[12.5px] text-ink-500">Your badge is EARNED, never bought, and it belongs to THIS service: manufacturing standing, judged on manufacturing work. It sets the merit fee withheld from your payout.</p>
              <div className="flex items-center gap-3.5 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-pink-500 text-[18px] text-white">★</span>
                <div className="min-w-0 flex-1"><div className="font-display text-[14px] font-bold text-ink-900">Earned per-service</div><div className="text-[11.5px] text-ink-500">Judged on your PRODUCT legs only: rating, on-time rate, accept rate, defects per 100, months active. The badge sets the merit fee withheld from your payout.</div></div>
              </div>
              <Note><b>Merit is a manufacturing instrument, and only a manufacturing instrument.</b> It judges the leg where the creator picked you and pinned you. Your other services are not judged by it: a printer is rotated on rating, a fulfillment center is selected on fit, a co-pack leg is derived from the graph. You will not see a co-packing badge here, and that is deliberate.</Note>
            </Card>
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
  return <label className="block"><span className="mb-[5px] block text-[11px] font-bold uppercase tracking-[0.05em] text-ink-600">{label}</span>{children}{hint && <span className="mt-1 block text-[11.5px] text-ink-400">{hint}</span>}</label>
}
function DarkF({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return <label className="block"><span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">{label}</span><input className="h-[38px] w-[140px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} /></label>
}
function Dflt({ title, desc, value, onChange, placeholder, foot }: { title: string; desc: string; value: string; onChange: (s: string) => void; placeholder: string; foot?: string }) {
  return (
    <div className="grid grid-cols-[1fr_140px] items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0">
      <div><div className="text-[13px] font-semibold text-ink-900">{title}</div><div className="text-[11.5px] text-ink-400">{desc}</div>{foot && <div className="mt-0.5 text-[11px] text-ink-400">{foot}</div>}</div>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mb-3 rounded-2xl border border-ink-200 bg-white px-5 py-[18px]"><h2 className="mb-3 font-display text-[15px] font-bold text-ink-900">{title}</h2>{children}</div>
}
function Chips({ opts, value, onToggle, labels = {} }: { opts: string[]; value: Set<string>; onToggle: (v: string) => void; labels?: Record<string, string> }) {
  return <div className="flex flex-wrap gap-[7px]">{opts.map((o) => { const on = value.has(o); return <button key={o} type="button" onClick={() => onToggle(o)} className={`rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${on ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400'}`}>{labels[o] ?? o}</button> })}</div>
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="mb-[14px] px-1 text-[12px] leading-[1.6] text-ink-500 [&_b]:text-ink-700">{children}</p>
}
function Hero({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc: string; children: React.ReactNode }) {
  return <><div className="mb-3.5 rounded-2xl border border-ink-200 bg-white px-[22px] py-5"><div className="text-[11px] font-bold uppercase tracking-[0.08em] text-pink-700">{eyebrow}</div><h1 className="mt-[5px] font-display text-[22px] font-extrabold tracking-[-0.02em] text-ink-900">{title}</h1><p className="mt-1 max-w-[780px] text-[13.5px] text-ink-500">{desc}</p></div>{children}</>
}
function RevRow({ good, label, help }: { good: boolean; label: string; help: string }) {
  return <div className="flex items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0"><span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-extrabold text-white ${good ? 'bg-success-500' : 'bg-ink-300'}`}>{good ? '✓' : '!'}</span><span><span className="text-[13.5px] font-semibold text-ink-900">{label}</span><br /><span className="text-[11.5px] text-ink-500">{help}</span></span></div>
}
