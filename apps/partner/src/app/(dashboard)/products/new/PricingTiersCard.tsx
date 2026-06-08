'use client'

// Step 5 — volume pricing tiers (#35). Editable rows persisted to
// ProductTemplatePricingTier via savePricingTiers (replace). Manufacturer sets
// per-unit cost + hard floor + optional lead time per quantity band; the
// marketplace adds platform fee/shipping/accessories to reach the creator price.
// Rendered inside GuidedBuilder's `.gb` style scope.

import { useEffect, useRef, useState } from 'react'
import { savePricingTiers, type PricingTierInput } from './build-actions'

interface TierRow { minQty: number; maxQty: number | null; perUnitCents: number; floorCents: number; leadTimeDays: number | null }

const dollars = (cents: number) => (cents / 100).toFixed(2)
const toCents = (s: string) => Math.round((parseFloat(s.replace(/[^0-9.]/g, '')) || 0) * 100)

// Mirrors apps/marketing/src/lib/pricing.ts: creator price = manufacturer unit
// cost + platform fee. 15% is the Maker headline rate (FALLBACK_FEE_PERCENT);
// Builder/Agency discount the FEE, not the unit cost. Shipping + accessories are
// added at checkout (destination/qty-dependent), so they're excluded here.
const MAKER_FEE_PCT = 15
const marketplaceCents = (perUnitCents: number) => perUnitCents + Math.round((perUnitCents * MAKER_FEE_PCT) / 100)

export function PricingTiersCard({ draftId }: { draftId: string | null }) {
  const [tiers, setTiers] = useState<TierRow[]>([
    { minQty: 500, maxQty: 2499, perUnitCents: 110, floorCents: 95, leadTimeDays: 21 },
    { minQty: 2500, maxQty: 9999, perUnitCents: 98, floorCents: 90, leadTimeDays: 18 },
    { minQty: 10000, maxQty: null, perUnitCents: 86, floorCents: 82, leadTimeDays: 28 },
  ])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const payload: PricingTierInput[] = tiers.map((t, i) => ({
        minQty: t.minQty, maxQty: t.maxQty, perUnitCostCents: t.perUnitCents,
        perUnitFloorCents: t.floorCents, leadTimeDays: t.leadTimeDays, sortOrder: i,
      }))
      void savePricingTiers(draftId, payload)
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers, draftId])

  function patch(i: number, p: Partial<TierRow>) { setTiers(tiers.map((t, j) => (j === i ? { ...t, ...p } : t))) }
  const lowest = tiers.reduce((m, t) => Math.min(m, t.perUnitCents), Infinity)

  return (
    <div className="card">
      <div className="section-title" style={{ fontSize: 15 }}><span className="ic">$</span> Volume price tiers</div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        Your per-unit price &amp; hard floor per quantity band. iLaunchify adds platform fee, shipping, and
        accessories to compute the creator&apos;s landed price.
      </p>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Min qty</th><th>Max qty</th><th>Your per unit ($)</th><th>Hard floor ($)</th><th>Lead (days)</th><th>Marketplace ($) <span className="tiny muted" style={{ fontWeight: 400 }}>· what the creator sees</span></th><th /></tr></thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td><input className="input" type="number" min={1} value={t.minQty} onChange={(e) => patch(i, { minQty: Math.max(1, parseInt(e.target.value, 10) || 1) })} style={{ width: 84 }} /></td>
              <td><input className="input" type="number" min={1} value={t.maxQty ?? ''} placeholder="∞" onChange={(e) => patch(i, { maxQty: e.target.value ? parseInt(e.target.value, 10) : null })} style={{ width: 84 }} /></td>
              <td><input className="input" defaultValue={dollars(t.perUnitCents)} onBlur={(e) => patch(i, { perUnitCents: toCents(e.target.value) })} style={{ width: 76 }} /></td>
              <td><input className="input" defaultValue={dollars(t.floorCents)} onBlur={(e) => patch(i, { floorCents: toCents(e.target.value) })} style={{ width: 76 }} /></td>
              <td><input className="input" type="number" min={0} value={t.leadTimeDays ?? ''} placeholder="—" onChange={(e) => patch(i, { leadTimeDays: e.target.value ? parseInt(e.target.value, 10) : null })} style={{ width: 64 }} /></td>
              <td><b>${dollars(marketplaceCents(t.perUnitCents))}</b></td>
              <td>{tiers.length > 1 && <button className="del" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>🗑</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note grey" style={{ marginTop: 10 }}>
        <b>Marketplace price</b> = your per-unit + platform fee (15% at Maker tier; Builder/Agency creators get a
        lower fee). Shipping &amp; accessories are added at checkout, so the final landed price is a little higher.
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
        <button className="rb-btn-add" onClick={() => { const last = tiers[tiers.length - 1]; setTiers([...tiers, { minQty: (last?.maxQty ?? last?.minQty ?? 0) + 1, maxQty: null, perUnitCents: last?.perUnitCents ?? 100, floorCents: last?.floorCents ?? 90, leadTimeDays: last?.leadTimeDays ?? 21 }]) }}>+ Add tier</button>
        {Number.isFinite(lowest) && <span className="tiny muted">You from ${dollars(lowest)} · marketplace from ${dollars(marketplaceCents(lowest))}/unit</span>}
      </div>
      <style>{`.gb .rb-btn-add{background:#fff;color:var(--pink-700);border:1px solid var(--pink-100);border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.gb .rb-btn-add:hover{background:var(--pink-50)}.gb .del{color:#e24b4a;cursor:pointer;background:none;border:0;font-size:12px;padding:0}`}</style>
    </div>
  )
}
