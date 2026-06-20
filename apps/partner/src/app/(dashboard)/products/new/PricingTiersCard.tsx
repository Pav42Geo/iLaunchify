'use client'

// Step 5 — volume pricing tiers (#35). Persisted to ProductTemplatePricingTier
// via savePricingTiers (replace). Two fulfillment modes — Bulk (default) and
// On-demand — each its own band set, both saved together. The per-band cost is
// the manufacturer's; the Maker/Builder/Agency columns show the creator's all-in
// price (cost + that tier's platform fee), so the partner sees how price changes
// per subscription tier. Same fee source as the marketplace modal. `.gb` scope.

import { useEffect, useRef, useState } from 'react'
import { savePricingTiers, getCreatorFeePercents, type PricingTierInput } from './build-actions'

type Mode = 'BULK_PRODUCTION' | 'ON_DEMAND'
interface TierRow { minQty: number; maxQty: number | null; perUnitCents: number; floorCents: number; leadTimeDays: number | null }
interface InitialTier { minQty: number; maxQty: number | null; perUnitCostCents: number; perUnitFloorCents: number; leadTimeDays: number | null; fulfillmentMode?: Mode }
interface FeePct { maker: number; builder: number; agency: number }

const dollars = (cents: number) => (cents / 100).toFixed(2)
const toCents = (s: string) => Math.round((parseFloat(s.replace(/[^0-9.]/g, '')) || 0) * 100)
// Creator all-in = manufacturer per-unit + that tier's platform fee. Builder/
// Agency discount the FEE, not the unit cost.
const withFee = (perUnitCents: number, pct: number) => perUnitCents + Math.round((perUnitCents * pct) / 100)

const DEFAULT_BULK: TierRow[] = [
  { minQty: 500, maxQty: 2499, perUnitCents: 110, floorCents: 95, leadTimeDays: 21 },
  { minQty: 2500, maxQty: 9999, perUnitCents: 98, floorCents: 90, leadTimeDays: 18 },
  { minQty: 10000, maxQty: null, perUnitCents: 86, floorCents: 82, leadTimeDays: 28 },
]
// On-demand starts at qty 1 (no MOQ), priced higher than bulk.
const DEFAULT_ONDEMAND: TierRow[] = [
  { minQty: 1, maxQty: 99, perUnitCents: 180, floorCents: 150, leadTimeDays: 7 },
  { minQty: 100, maxQty: null, perUnitCents: 150, floorCents: 130, leadTimeDays: 10 },
]

function split(initial: InitialTier[] | undefined): { bulk: TierRow[]; onDemand: TierRow[] } {
  if (!initial || !initial.length) return { bulk: DEFAULT_BULK, onDemand: [] }
  const map = (t: InitialTier): TierRow => ({ minQty: t.minQty, maxQty: t.maxQty, perUnitCents: t.perUnitCostCents, floorCents: t.perUnitFloorCents, leadTimeDays: t.leadTimeDays })
  const bulk = initial.filter((t) => (t.fulfillmentMode ?? 'BULK_PRODUCTION') === 'BULK_PRODUCTION').map(map)
  const onDemand = initial.filter((t) => t.fulfillmentMode === 'ON_DEMAND').map(map)
  return { bulk: bulk.length ? bulk : DEFAULT_BULK, onDemand }
}

export function PricingTiersCard({ draftId, initialTiers, registerFlush }: { draftId: string | null; initialTiers?: InitialTier[]; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const init = split(initialTiers)
  const [bulk, setBulk] = useState<TierRow[]>(init.bulk)
  const [onDemand, setOnDemand] = useState<TierRow[]>(init.onDemand)
  const [tab, setTab] = useState<Mode>('BULK_PRODUCTION')
  const [fee, setFee] = useState<FeePct>({ maker: 15, builder: 15, agency: 15 })

  useEffect(() => { void getCreatorFeePercents().then(setFee).catch(() => {}) }, [])

  const buildPayload = (): PricingTierInput[] => [
    ...bulk.map((t, i) => ({ fulfillmentMode: 'BULK_PRODUCTION' as const, minQty: t.minQty, maxQty: t.maxQty, perUnitCostCents: t.perUnitCents, perUnitFloorCents: t.floorCents, leadTimeDays: t.leadTimeDays, sortOrder: i })),
    ...onDemand.map((t, i) => ({ fulfillmentMode: 'ON_DEMAND' as const, minQty: t.minQty, maxQty: t.maxQty, perUnitCostCents: t.perUnitCents, perUnitFloorCents: t.floorCents, leadTimeDays: t.leadTimeDays, sortOrder: i })),
  ]

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void savePricingTiers(draftId, buildPayload()) }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulk, onDemand, draftId])

  // Immediate flush before navigation (registry).
  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (timer.current) clearTimeout(timer.current)
    if (draftId) await savePricingTiers(draftId, buildPayload())
  }
  useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  const rows = tab === 'BULK_PRODUCTION' ? bulk : onDemand
  const setRows = tab === 'BULK_PRODUCTION' ? setBulk : setOnDemand
  const patch = (i: number, p: Partial<TierRow>) => setRows(rows.map((t, j) => (j === i ? { ...t, ...p } : t)))

  return (
    <div className="card">
      <div className="section-title" style={{ fontSize: 15 }}><span className="ic">$</span> Volume price tiers</div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        Your per-unit cost &amp; hard floor per quantity band. The Maker / Builder / Agency columns show the
        creator&apos;s all-in price at each subscription tier (your cost + that tier&apos;s platform fee).
      </p>

      {/* Bulk / On-demand tabs — default Bulk */}
      <div className="ptabs" style={{ marginTop: 10 }}>
        <button className={tab === 'BULK_PRODUCTION' ? 'pt on' : 'pt'} onClick={() => setTab('BULK_PRODUCTION')}>Bulk</button>
        <button className={tab === 'ON_DEMAND' ? 'pt on' : 'pt'} onClick={() => setTab('ON_DEMAND')}>On-demand</button>
      </div>

      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Min qty</th><th>Max qty</th><th>Your cost ($)</th><th>Floor ($)</th><th>Lead</th>
            <th>Maker <span className="tiny muted" style={{ fontWeight: 400 }}>{fee.maker}%</span></th>
            <th>Builder <span className="tiny muted" style={{ fontWeight: 400 }}>{fee.builder}%</span></th>
            <th>Agency <span className="tiny muted" style={{ fontWeight: 400 }}>{fee.agency}%</span></th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={9} className="tiny muted" style={{ padding: '10px 4px' }}>No {tab === 'ON_DEMAND' ? 'on-demand' : 'bulk'} bands yet — add one below.</td></tr>
          )}
          {rows.map((t, i) => (
            <tr key={i}>
              <td><input className="input" type="number" min={1} value={t.minQty} onChange={(e) => patch(i, { minQty: Math.max(1, parseInt(e.target.value, 10) || 1) })} style={{ width: 76 }} /></td>
              <td><input className="input" type="number" min={1} value={t.maxQty ?? ''} placeholder="∞" onChange={(e) => patch(i, { maxQty: e.target.value ? parseInt(e.target.value, 10) : null })} style={{ width: 76 }} /></td>
              <td><input className="input" defaultValue={dollars(t.perUnitCents)} onBlur={(e) => patch(i, { perUnitCents: toCents(e.target.value) })} style={{ width: 72 }} /></td>
              <td><input className="input" defaultValue={dollars(t.floorCents)} onBlur={(e) => patch(i, { floorCents: toCents(e.target.value) })} style={{ width: 68 }} /></td>
              <td><input className="input" type="number" min={0} value={t.leadTimeDays ?? ''} placeholder="—" onChange={(e) => patch(i, { leadTimeDays: e.target.value ? parseInt(e.target.value, 10) : null })} style={{ width: 56 }} /></td>
              <td className="tnum">${dollars(withFee(t.perUnitCents, fee.maker))}</td>
              <td className="tnum">${dollars(withFee(t.perUnitCents, fee.builder))}</td>
              <td className="tnum"><b>${dollars(withFee(t.perUnitCents, fee.agency))}</b></td>
              <td>{rows.length > 1 && <button className="del" onClick={() => setRows(rows.filter((_, j) => j !== i))}>🗑</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="note grey" style={{ marginTop: 10 }}>
        Unit cost is the same across creator tiers — Builder &amp; Agency creators just pay a lower platform fee,
        so their all-in price is lower. Shipping &amp; accessories are added at checkout.
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
        <button className="rb-btn-add" onClick={() => { const last = rows[rows.length - 1]; setRows([...rows, { minQty: (last?.maxQty ?? last?.minQty ?? 0) + 1, maxQty: null, perUnitCents: last?.perUnitCents ?? (tab === 'ON_DEMAND' ? 150 : 100), floorCents: last?.floorCents ?? (tab === 'ON_DEMAND' ? 130 : 90), leadTimeDays: last?.leadTimeDays ?? (tab === 'ON_DEMAND' ? 7 : 21) }]) }}>+ Add {tab === 'ON_DEMAND' ? 'on-demand' : 'bulk'} band</button>
      </div>

      <style>{`
        .gb .ptabs{display:inline-flex;gap:2px;background:var(--ink-100,#eee);border-radius:9px;padding:2px}
        .gb .pt{background:none;border:0;border-radius:7px;padding:5px 14px;font:inherit;font-size:12px;font-weight:600;color:var(--ink-600,#666);cursor:pointer}
        .gb .pt.on{background:#fff;color:var(--pink-700);box-shadow:0 1px 2px rgba(0,0,0,.08)}
        .gb .tnum{text-align:right;font-variant-numeric:tabular-nums;font-size:12.5px;padding-right:8px}
        .gb .rb-btn-add{background:#fff;color:var(--pink-700);border:1px solid var(--pink-100);border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
        .gb .rb-btn-add:hover{background:var(--pink-50)}
        .gb .del{color:#e24b4a;cursor:pointer;background:none;border:0;font-size:12px;padding:0}
      `}</style>
    </div>
  )
}
