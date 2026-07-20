'use client'

// PP-1 (UI half) — the print price-curve builder (docs/PRINT_PRICING_SPEC §3.1 + the print
// service-builder prototype). This is the ECONOMIC HEART of the print builder: a printer declares a
// per-process price curve, and the Live check runs the REAL engine (@ilaunchify/orders/print-price) so
// they see the digital-vs-flexo crossover EMERGE from their own two curves (never a typed threshold).
//
// SCOPE (this slice): Basics + Presses & pricing (curves) + Live check + Review. The prototype's
// richer steps (rush, formats/envelope, finished format, prepress fees) are PP-7 schema that does not
// exist yet and land as it does. Persistence (the curve writer + page) is PP-1's other half, gated on
// the PS-9-0 db:push (PartnerOfferingPriceCurve is not in the generated client yet).
//
// Stepper chrome = the co-creation .stagebar (same as the co-pack builder). No em-dash anywhere.

import { useMemo, useState } from 'react'
import {
  segmentPriceCents,
  selectPrintProcess,
  printCrossoverQty,
  type PriceCurveSegment,
} from '@ilaunchify/orders/print-price'

const PRINT_PROCESSES = ['DIGITAL', 'FLEXO', 'OFFSET', 'SCREEN', 'LETTERPRESS', 'GRAVURE'] as const
type PrintProcess = (typeof PRINT_PROCESSES)[number]

export interface CurveDraft {
  id: string
  process: PrintProcess
  baseQty: string
  basePrice: string // dollars
  incrementQty: string
  incrementPrice: string // dollars per increment
  maxQty: string
  quoteRequired: boolean
  active: boolean
}

export interface PrintBuilderInitial {
  serviceId: string
  serviceName: string
  standardLeadDays: string
  minOrderValue: string // dollars
  curves: CurveDraft[]
}

// loose parsers (match the prototype's num())
const num = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0
const centsOf = (s: string) => Math.round(num(s) * 100)
const intOf = (s: string) => Math.round(num(s))
const fmt = (c: number) => '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STAGES = ['Basics', 'Presses', 'Live check', 'Publish'] as const

let SEQ = 0
const newId = () => `curve-${SEQ++}-${Math.random().toString(36).slice(2, 6)}`
const blankCurve = (process: PrintProcess): CurveDraft => ({
  id: newId(), process, baseQty: '', basePrice: '', incrementQty: '1', incrementPrice: '', maxQty: '', quoteRequired: false, active: true,
})

const inputCls =
  'h-[38px] w-full rounded-md border border-ink-300 bg-white px-[11px] text-[13.5px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

export function PrintServiceBuilder({ initial }: { initial: PrintBuilderInitial }) {
  const [v, setV] = useState(0)
  const [serviceName, setServiceName] = useState(initial.serviceName)
  const [leadDays, setLeadDays] = useState(initial.standardLeadDays)
  const [minOrderValue, setMinOrderValue] = useState(initial.minOrderValue)
  const [curves, setCurves] = useState<CurveDraft[]>(
    initial.curves.length > 0 ? initial.curves : [blankCurve('DIGITAL'), blankCurve('FLEXO')],
  )
  const [q, setQ] = useState('15000')

  const setCurve = (id: string, patch: Partial<CurveDraft>) => setCurves((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addCurve = () => setCurves((rows) => [...rows, blankCurve('OFFSET')])
  const removeCurve = (id: string) => setCurves((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))

  // ── engine inputs: the active, parseable curves ──
  const segments: (PriceCurveSegment & { id: string })[] = useMemo(
    () =>
      curves
        .filter((c) => c.active && num(c.baseQty) > 0 && num(c.incrementQty) > 0)
        .map((c) => ({
          id: c.id,
          printProcess: c.process,
          baseQty: intOf(c.baseQty),
          basePriceCents: centsOf(c.basePrice),
          incrementQty: intOf(c.incrementQty),
          incrementPriceCents: centsOf(c.incrementPrice),
          maxQty: c.maxQty.trim() ? intOf(c.maxQty) : Number.MAX_SAFE_INTEGER,
          quoteRequired: c.quoteRequired,
        })),
    [curves],
  )

  const qN = intOf(q)
  const perCurve = segments.map((s) => ({ seg: s, cents: segmentPriceCents(s, qN) }))
  const winner = selectPrintProcess(segments, qN)
  // Crossover between the two most competitive curves (the prototype shows digital vs flexo).
  const crossover = useMemo(() => {
    const sorted = [...perCurve].sort((a, b) => (a.cents ?? Infinity) - (b.cents ?? Infinity)).map((x) => x.seg)
    return sorted.length >= 2 ? printCrossoverQty(sorted[0]!, sorted[1]!) : null
  }, [perCurve])

  return (
    <div className="mx-auto max-w-[1080px] pb-24">
      {/* stagebar */}
      <div className="flex items-center gap-[5px] overflow-x-auto rounded-t-2xl border border-ink-200 bg-ink-50 px-5 py-[11px]">
        {STAGES.map((label, i) => {
          const state = i < v ? 'done' : i === v ? 'on' : ''
          return (
            <div key={label} className="flex items-center gap-[5px]">
              <button
                type="button"
                onClick={() => setV(i)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-pill border px-[13px] py-[7px] text-[12.5px] font-semibold transition ${
                  state === 'on' ? 'border-pink-200 bg-white text-ink-900 shadow-sm' : state === 'done' ? 'border-transparent text-success-700' : 'border-transparent text-ink-500'
                }`}
              >
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-extrabold ${state === 'on' ? 'bg-pink-500 text-white' : state === 'done' ? 'bg-success-500 text-white' : 'bg-ink-200 text-ink-600'}`}>
                  {i < v ? '✓' : i + 1}
                </span>
                {label}
              </button>
              {i < STAGES.length - 1 && <span className={`h-0.5 w-5 flex-none ${i < v ? 'bg-success-500' : 'bg-ink-200'}`} />}
            </div>
          )
        })}
        <span className="flex-1" />
        <button type="button" onClick={() => setV((x) => Math.min(STAGES.length - 1, x + 1))} disabled={v >= STAGES.length - 1} className="rounded-pill bg-ink-900 px-4 py-[9px] text-[12.5px] font-bold text-white hover:bg-black disabled:opacity-40">
          Next stage →
        </button>
      </div>

      <div className="rounded-b-2xl border border-t-0 border-ink-200 bg-ink-100 p-4">
        {v === 0 && (
          <Hero eyebrow="Print production service" title="Service basics" desc="What creators see on your provider card, and the commercial floor every quote respects.">
            <div className="grid gap-[14px] sm:grid-cols-3">
              <F label="Service name" hint="Shown on provider cards."><input className={inputCls} value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Rialto Label & Print" /></F>
              <F label="Standard lead time (business days)" hint="Ex-proof."><input className={inputCls} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} placeholder="7" /></F>
              <F label="Minimum order value" hint="No MOQ, but our minimum order is ~$X. Binds even when the piece count clears."><input className={inputCls} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} placeholder="$200" /></F>
            </div>
          </Hero>
        )}

        {v === 1 && (
          <Hero eyebrow="Step 2" title="Presses & pricing" desc="One price curve per press you own. A converter with digital AND flexo declares both, and thereby serves a 100-piece job and a 50,000-piece job from the same service. Setup and plates fold into the base price at the base quantity (PrintTalk); you do not enter them separately.">
            {curves.map((c) => (
              <div key={c.id} className={`mb-2.5 rounded-xl border px-4 py-3.5 ${c.active ? 'border-pink-200 bg-white shadow-[0_0_0_3px_rgba(255,46,99,0.07)]' : 'border-ink-200 bg-ink-50'}`}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <button type="button" onClick={() => setCurve(c.id, { active: !c.active })} aria-label="Toggle press" className={`relative h-[22px] w-[38px] flex-none rounded-pill transition ${c.active ? 'bg-pink-500' : 'bg-ink-300'}`}>
                    <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${c.active ? 'left-[19px]' : 'left-[3px]'}`} />
                  </button>
                  <select className="rounded-md border border-ink-300 bg-white px-2 py-1 text-[13px] font-semibold" value={c.process} onChange={(e) => setCurve(c.id, { process: e.target.value as PrintProcess })}>
                    {PRINT_PROCESSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {curves.length > 1 && <button type="button" onClick={() => removeCurve(c.id)} className="ml-auto text-[11.5px] font-semibold text-danger-500 hover:underline">Remove</button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-5">
                  <F label="Base qty (real MOQ)"><input className={inputCls} value={c.baseQty} onChange={(e) => setCurve(c.id, { baseQty: e.target.value })} placeholder="100" /></F>
                  <F label="Price at base qty" hint="Setup + plates included."><input className={inputCls} value={c.basePrice} onChange={(e) => setCurve(c.id, { basePrice: e.target.value })} placeholder="$45.00" /></F>
                  <F label="Increment (lattice)"><input className={inputCls} value={c.incrementQty} onChange={(e) => setCurve(c.id, { incrementQty: e.target.value })} placeholder="1" /></F>
                  <F label="Price / increment"><input className={inputCls} value={c.incrementPrice} onChange={(e) => setCurve(c.id, { incrementPrice: e.target.value })} placeholder="$0.35" /></F>
                  <F label="Max run (beyond it stops paying)" hint="Blank = and up."><input className={inputCls} value={c.maxQty} onChange={(e) => setCurve(c.id, { maxQty: e.target.value })} placeholder="20000" /></F>
                </div>
                <label className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-600">
                  <input type="checkbox" checked={c.quoteRequired} onChange={(e) => setCurve(c.id, { quoteRequired: e.target.checked })} />
                  Price is indicative (route to a quote, never auto-bind)
                </label>
              </div>
            ))}
            <button type="button" onClick={addCurve} className="mt-1 rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">+ Add a press</button>
          </Hero>
        )}

        {v === 2 && (
          <Hero eyebrow="Step 3" title="Live check" desc="Type a quantity. This runs the same engine routing runs: the cheapest feasible curve wins, and the crossover falls out of your own curves.">
            <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
              <div className="mb-3.5 flex flex-wrap items-end gap-3">
                <label className="block"><span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">Order quantity (pieces)</span><input className="h-[38px] w-[150px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <span className="self-center pb-1 text-[12px] text-ink-400">try 100 · 2,000 · 11,444 · 50,000</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {perCurve.map(({ seg, cents }) => {
                  const win = winner?.segment.printProcess === seg.printProcess && winner?.cents === cents
                  return (
                    <div key={seg.id} className={`rounded-xl border p-3 ${win ? 'border-neon-500 bg-neon-500/10' : cents == null ? 'border-ink-700 bg-ink-800 opacity-45' : 'border-ink-700 bg-ink-800'}`}>
                      <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${win ? 'text-neon-500' : 'text-ink-400'}`}>{seg.printProcess}</div>
                      <div className="mt-1 font-display text-[20px] font-extrabold text-white">{cents == null ? '—' : fmt(cents)}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-400">{cents == null ? 'out of this press’s range / off-lattice' : `${fmt(cents / Math.max(1, qN))} / piece`}</div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">
                {segments.length < 2
                  ? 'Add a second press to see your crossover.'
                  : crossover && crossover > 0
                    ? <>Your crossover is <b className="text-neon-500">{crossover.toLocaleString()} pieces</b>. Below it the low-setup press wins; above it the low-per-piece press does. You did not set that number: it fell out of your own two curves.</>
                    : 'Only one press is feasible at this quantity, so there is no contest to resolve.'}
                {winner?.segment.quoteRequired && <> The winning curve is indicative, so this routes to a quote.</>}
              </div>
            </div>
          </Hero>
        )}

        {v === 3 && (
          <Hero eyebrow="Step 4" title="Review & publish" desc="What you declared, and what it turns on.">
            <div className="rounded-2xl border border-ink-200 bg-white px-5 py-[18px]">
              <Row good={segments.length > 0} label="Price curves declared" help={`${segments.length} press curve${segments.length === 1 ? '' : 's'} — routing prices your leg from these, so a creator sees one number.`} />
              <Row good={num(minOrderValue) > 0} label="Order-value floor set" help={minOrderValue.trim() ? `${minOrderValue} minimum` : 'no floor set'} />
              <Row good={false} label="Persistence pending PS-9-0" help="This slice is the curve editor + live check. Saving curves needs the PartnerOfferingPriceCurve db:push (PS-9-0) + the offering it attaches to. Wiring into the charge/payout is PP-1's other half." />
            </div>
            <p className="mt-3 px-1 text-[12px] leading-[1.6] text-ink-500">
              The richer steps from the prototype (rush &amp; capacity, formats &amp; envelope, finished format, prepress fees) land as their PP-7 schema does. This builder is the economic core: the curves and the crossover.
            </p>
          </Hero>
        )}
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
function Row({ good, label, help }: { good: boolean; label: string; help: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-ink-100 py-2.5 last:border-b-0">
      <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11px] font-extrabold text-white ${good ? 'bg-success-500' : 'bg-ink-300'}`}>{good ? '✓' : '!'}</span>
      <span><span className="text-[13.5px] font-semibold text-ink-900">{label}</span><br /><span className="text-[11.5px] text-ink-500">{help}</span></span>
    </div>
  )
}
