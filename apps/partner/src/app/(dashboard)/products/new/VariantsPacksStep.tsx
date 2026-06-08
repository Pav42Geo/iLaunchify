'use client'

// Step "Variants & packs" — led by the Product Type picker (a space-saving
// dropdown that opens admin-curated packing-taxonomy cards grouped by bucket),
// then a SHARED Production & availability block (every type) plus the
// type-specific config (single / flavors / pack composition) and conditional
// add-ons (subscription cadence, pick-N count). Rendered inside GuidedBuilder's
// `.gb` style scope.
//
// Dynamic dependencies wired here (2026-06-08, Pavel):
//  • Product type drives which config + label columns appear.
//  • Fulfillment = Make-to-order (on-demand) → MOQ + order increment forced to 1
//    and disabled (no batch minimum); Bulk/Both → editable.
//  • Monthly capacity < MOQ → inline impossible-to-fulfill warning.
//  • isSubscription type → delivery cadence + rotation count.
//  • isCustomizable type → "customer picks N of M" min/max.
//  • Multi-flavor → optional per-flavor capacity override.
//  • Single pack (packs-per-bundle = 1) → bundle copy + units collapse.

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateBasics, saveFlavors, saveFees, type FeeInput } from './build-actions'
import { OptionAxesCard, type OptionAxisUI } from './OptionAxesCard'
import type { PackingProfileOption } from './ProductTypeGate'

interface FacilityOption { id: string; name: string }

const BUCKETS: Array<{ title: string; groups: string[] }> = [
  { title: 'Single flavor', groups: ['SINGLE_FLAVOR_SINGLE_PACK', 'SINGLE_FLAVOR_MULTIPACK', 'VALUE_BULK_SINGLE'] },
  { title: 'Multiple flavors', groups: ['MULTI_FLAVOR_MIXED_PACK', 'MULTI_FLAVOR_COMPARTMENT_PACK', 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', 'VALUE_BULK_VARIETY'] },
  { title: 'Curated & custom', groups: ['CUSTOMIZABLE_PICK_N', 'SAMPLER_MINI', 'GIFT_PREMIUM', 'SEASONAL_LIMITED', 'PAIRING_FUNCTIONAL', 'RETAIL_COUNTER_DISPLAY', 'REFILL_ECO'] },
  { title: 'Recurring', groups: ['SUBSCRIPTION_ROTATING'] },
]

const PACK_STRUCTS = ['OUTER_WITH_INNERS', 'INDIVIDUAL_IN_OUTER', 'CUSTOMIZABLE']

export interface Flavor { name: string; ingId: string; soi: string }

export function VariantsPacksStep({
  packingProfiles, facilities, baseSku, draftId, selected, onSelect, flavors, onFlavors, axes, onAxes,
}: {
  packingProfiles: PackingProfileOption[]
  facilities: FacilityOption[]
  baseSku: string
  draftId: string | null
  selected: PackingProfileOption | null
  onSelect: (p: PackingProfileOption) => void
  flavors: Flavor[]
  onFlavors: (f: Flavor[]) => void
  axes: OptionAxisUI[]
  onAxes: (a: OptionAxisUI[]) => void
}) {
  const [, start] = useTransition()
  const [open, setOpen] = useState(false)

  function choose(p: PackingProfileOption) {
    onSelect(p)
    setOpen(false)
    if (draftId) {
      start(async () => {
        const res = await updateBasics(draftId, { packingProfileId: p.id })
        if (!res.ok) toast.error(res.error)
      })
    }
  }

  const kind = !selected ? null
    : selected.flavorMode === 'SINGLE' ? 'single'
    : PACK_STRUCTS.includes(selected.packStructure) ? 'pack' : 'multi'

  // M (available flavors) for the pick-N config.
  const flavorCount = flavors.filter((f) => f.name.trim()).length

  return (
    <div>
      <p className="muted small" style={{ marginBottom: 14 }}>
        Pick the product type first — it shapes the recipe (one recipe vs base + flavor presets),
        the label columns, and pack composition. Then set the production spec.
      </p>

      {/* Product type — space-saving dropdown that opens grouped cards */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title"><span className="ic">▦</span> Product type</div>
        <button type="button" className="pt-trigger" data-open={open ? 'on' : undefined} onClick={() => setOpen((v) => !v)} style={{ marginTop: 10 }}>
          {selected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</b>
              <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>{selected.flavorMode === 'MULTI' ? 'base + presets' : 'one recipe'}</span>
              {selected.labelColumns > 1 && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>≤{selected.labelColumns}-col</span>}
              {selected.isSubscription && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>subscription</span>}
              {selected.isCustomizable && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>pick-N</span>}
            </span>
          ) : <span className="muted">Choose a product type…</span>}
          <span className="pt-caret">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="pt-panel">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
              {BUCKETS.map((b) => {
                const items = b.groups
                  .map((g) => packingProfiles.find((p) => p.group === g))
                  .filter((p): p is PackingProfileOption => !!p)
                if (items.length === 0) return null
                return (
                  <div key={b.title}>
                    <div className="eyebrow" style={{ marginBottom: 7 }}>{b.title}</div>
                    <div className="grid" style={{ gap: 7 }}>
                      {items.map((p) => {
                        const on = selected?.id === p.id
                        return (
                          <button key={p.id} type="button" onClick={() => choose(p)} className="ptcard" data-on={on ? 'on' : undefined}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <b>{p.name}</b>{on && <span className="pill pink" style={{ padding: '1px 8px' }}>✓</span>}
                            </div>
                            {p.example && <div className="tiny muted" style={{ marginTop: 3 }}>{p.example}</div>}
                            <div className="row" style={{ gap: 6, marginTop: 7 }}>
                              <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>{p.flavorMode === 'MULTI' ? 'base + presets' : 'one recipe'}</span>
                              {p.labelColumns > 1 && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>≤{p.labelColumns}-col</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            {packingProfiles.length === 0 && <p className="tiny muted" style={{ marginTop: 10 }}>No packing types seeded yet — run the DB seed.</p>}
          </div>
        )}
      </div>

      {/* Shared production block — applies to EVERY product type */}
      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SharedProduction draftId={draftId} facilities={facilities} baseSku={baseSku} />
        </div>
      )}

      {/* Fees — one-time / per-unit / per-order (#3) */}
      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <FeesCard draftId={draftId} />
        </div>
      )}

      {/* Type-specific config for the chosen type */}
      {kind && (
        <div className="card">
          {kind === 'single' && <SinglePack />}
          {kind === 'multi' && <MultiFlavor draftId={draftId} facilities={facilities} baseSku={baseSku} maxColumns={selected!.labelColumns} flavors={flavors} onFlavors={onFlavors} />}
          {kind === 'pack' && <MultiPack />}

          {/* Conditional add-ons (stack under the base config) */}
          {selected?.isSubscription && <SubscriptionConfig />}
          {selected?.isCustomizable && <PickNConfig flavorCount={flavorCount} />}
        </div>
      )}

      {/* Configurable axes beyond flavor (sweetener / strength / caffeine / …) */}
      {selected && <OptionAxesCard axes={axes} onAxes={onAxes} />}

      <style>{`
        .gb .pt-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:1px solid var(--ink-200);border-radius:12px;background:#fff;padding:11px 14px;font:inherit;color:var(--ink-900);cursor:pointer;transition:.12s}
        .gb .pt-trigger:hover{border-color:var(--pink-100)}
        .gb .pt-trigger[data-open=on]{border-color:var(--pink);background:var(--pink-50)}
        .gb .pt-caret{color:var(--ink-500);font-size:11px}
        .gb .pt-panel{margin-top:12px;padding-top:12px;border-top:1px dashed var(--ink-200)}
        .gb .ptcard{border:1px solid var(--ink-200);border-radius:12px;background:#fff;padding:11px 13px;text-align:left;cursor:pointer;font:inherit;color:var(--ink-900);transition:.12s;width:100%}
        .gb .ptcard:hover{border-color:var(--pink-100)}
        .gb .ptcard[data-on=on]{border-color:var(--pink);background:var(--pink-50)}
        .gb .rb-btn-add{background:#fff;color:var(--pink-700);border:1px solid var(--pink-100);border-radius:8px;padding:5px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
        .gb .rb-btn-add:hover{background:var(--pink-50)}
        .gb .del{color:#e24b4a;cursor:pointer;background:none;border:0;font-size:12px;padding:0}
        .gb .warn{margin-top:10px;border:1px solid #f0c36d;background:#fdf6e6;color:#8a6418;border-radius:10px;padding:8px 12px;font-size:12px}
        .gb .addon{margin-top:16px;padding-top:14px;border-top:1px dashed var(--ink-200)}
        .gb input:disabled,.gb .sel:disabled{background:var(--ink-50);color:var(--ink-500);cursor:not-allowed}
      `}</style>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}{hint && <span className="muted" style={{ fontWeight: 400 }}> · {hint}</span>}</label>
      {children}
    </div>
  )
}

/** Production & availability — shared across all product types. Fulfillment mode
 *  drives MOQ/increment; capacity vs MOQ raises a warning. */
function SharedProduction({ draftId, facilities, baseSku }: { draftId: string | null; facilities: FacilityOption[]; baseSku: string }) {
  const [fulfillment, setFulfillment] = useState<'bulk' | 'mto' | 'both'>('bulk')
  const [moq, setMoq] = useState(500)
  const [increment, setIncrement] = useState(100)
  const [capacity, setCapacity] = useState(50000)
  const [leadRepeat, setLeadRepeat] = useState(21)
  const [leadFirstRun, setLeadFirstRun] = useState(35)
  const [storageClass, setStorageClass] = useState<'AMBIENT' | 'CHILLED' | 'FROZEN'>('AMBIENT')
  const [tempMin, setTempMin] = useState<number | ''>(55)
  const [tempMax, setTempMax] = useState<number | ''>(75)

  // Persist ProductTemplate-level fields (storage + lead split) — debounced.
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => {
      void updateBasics(draftId, {
        storageClass,
        storageTempMinF: tempMin === '' ? null : tempMin,
        storageTempMaxF: tempMax === '' ? null : tempMax,
        leadTimeRepeatDays: leadRepeat,
        leadTimeFirstRunDays: leadFirstRun,
      })
    }, 800)
    return () => { if (t.current) clearTimeout(t.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageClass, tempMin, tempMax, leadRepeat, leadFirstRun, draftId])

  const onDemand = fulfillment === 'mto'
  // On-demand has no batch minimum → MOQ + increment are 1 and locked.
  const effMoq = onDemand ? 1 : moq
  const effInc = onDemand ? 1 : increment
  const capacityTooLow = !onDemand && capacity > 0 && effMoq > capacity

  return (
    <>
      <div className="section-title"><span className="ic">▦</span> Production &amp; availability</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 12 }}>
        <Field label="Fulfillment mode">
          <select className="sel" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as 'bulk' | 'mto' | 'both')}>
            <option value="bulk">Bulk production</option>
            <option value="mto">Make-to-order (on-demand)</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="MOQ" hint={onDemand ? 'on-demand: no minimum' : undefined}>
          <input className="input" type="number" min={1} value={effMoq} disabled={onDemand} onChange={(e) => setMoq(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </Field>
        <Field label="Order increment" hint={onDemand ? 'per order' : undefined}>
          <input className="input" type="number" min={1} value={effInc} disabled={onDemand} onChange={(e) => setIncrement(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </Field>
        <Field label="Repeat lead time (days)" hint="re-orders">
          <input className="input" type="number" min={0} value={leadRepeat} onChange={(e) => setLeadRepeat(Math.max(0, parseInt(e.target.value, 10) || 0))} />
        </Field>
        <Field label="New-SKU lead time (days)" hint="first run · incl. stability testing">
          <input className="input" type="number" min={0} value={leadFirstRun} onChange={(e) => setLeadFirstRun(Math.max(0, parseInt(e.target.value, 10) || 0))} />
        </Field>
        <Field label="Monthly capacity"><input className="input" type="number" min={0} value={capacity} onChange={(e) => setCapacity(Math.max(0, parseInt(e.target.value, 10) || 0))} /></Field>
        <Field label="Shelf life (days)"><input className="input" type="number" min={1} defaultValue={365} /></Field>
        <Field label="Storage class">
          <select className="sel" value={storageClass} onChange={(e) => setStorageClass(e.target.value as 'AMBIENT' | 'CHILLED' | 'FROZEN')}>
            <option value="AMBIENT">Ambient (shelf-stable)</option>
            <option value="CHILLED">Chilled (refrigerated)</option>
            <option value="FROZEN">Frozen</option>
          </select>
        </Field>
        <Field label="Storage temp °F · min"><input className="input" type="number" value={tempMin} onChange={(e) => setTempMin(e.target.value === '' ? '' : parseInt(e.target.value, 10))} /></Field>
        <Field label="Storage temp °F · max"><input className="input" type="number" value={tempMax} onChange={(e) => setTempMax(e.target.value === '' ? '' : parseInt(e.target.value, 10))} /></Field>
        <Field label="Base SKU"><input className="input" defaultValue={baseSku} /></Field>
        <Field label="Lot / batch tracking"><select className="sel"><option>On (recommended)</option><option>Off</option></select></Field>
        <Field label="Facility · Manufactured by">
          <select className="sel">
            {facilities.length === 0 && <option>Onboarding address (default)</option>}
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
      </div>
      {storageClass !== 'AMBIENT' && (
        <div className="warn">❄ {storageClass === 'FROZEN' ? 'Frozen' : 'Chilled'} storage requires cold-chain fulfillment — only warehouses with that capability can be matched. Confirm your facility supports it.</div>
      )}
      {capacityTooLow && (
        <div className="warn">⚠ Monthly capacity ({capacity.toLocaleString()}) is below your MOQ ({effMoq.toLocaleString()}) — you couldn’t fulfill a single minimum order in a month. Raise capacity or lower MOQ.</div>
      )}
      {onDemand && (
        <p className="tiny muted" style={{ marginTop: 8 }}>On-demand: each order is produced to order, so there’s no batch minimum (MOQ = 1). Lead time is typically longer than bulk.</p>
      )}
      <p className="tiny muted" style={{ marginTop: 8 }}>Net weight, servings &amp; container live in Recipe + Packaging — not here.</p>
    </>
  )
}

/** Fees — one-time / per-unit / per-order. PER_SKU_ONE_TIME fees can waive at a
 *  volume threshold (e.g. QA batch testing waived above 12,500 units). */
function FeesCard({ draftId }: { draftId: string | null }) {
  interface FeeRow { label: string; basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'; amountCents: number; waivedAboveQty: number | null }
  const [fees, setFees] = useState<FeeRow[]>([])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const payload: FeeInput[] = fees.map((f, i) => ({ ...f, sortOrder: i }))
      void saveFees(draftId, payload)
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fees, draftId])

  function patch(i: number, p: Partial<FeeRow>) {
    setFees(fees.map((f, j) => (j === i ? { ...f, ...p } : f)))
  }

  return (
    <>
      <div className="section-title"><span className="ic">$</span> Fees</div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        One-time, per-unit, or per-order charges on top of the unit price — tooling, QA batch testing,
        palletization. One-time per-SKU fees can waive above a volume threshold.
      </p>
      {fees.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Fee</th><th>Basis</th><th>Amount (¢)</th><th>Waive above qty</th><th /></tr></thead>
          <tbody>
            {fees.map((f, i) => (
              <tr key={i}>
                <td><input className="input" value={f.label} placeholder="e.g. QA batch testing" onChange={(e) => patch(i, { label: e.target.value })} /></td>
                <td>
                  <select className="sel" value={f.basis} onChange={(e) => patch(i, { basis: e.target.value as FeeRow['basis'] })}>
                    <option value="PER_UNIT">Per unit</option>
                    <option value="PER_SKU_ONE_TIME">Per SKU · one-time</option>
                    <option value="PER_ORDER">Per order</option>
                  </select>
                </td>
                <td><input className="input" type="number" min={0} value={f.amountCents} onChange={(e) => patch(i, { amountCents: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ width: 100 }} /></td>
                <td><input className="input" type="number" min={1} value={f.waivedAboveQty ?? ''} placeholder={f.basis === 'PER_SKU_ONE_TIME' ? '—' : 'n/a'} disabled={f.basis !== 'PER_SKU_ONE_TIME'} onChange={(e) => patch(i, { waivedAboveQty: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null })} style={{ width: 110 }} /></td>
                <td><button className="del" onClick={() => setFees(fees.filter((_, j) => j !== i))}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="rb-btn-add" style={{ marginTop: 10 }} onClick={() => setFees([...fees, { label: '', basis: 'PER_UNIT', amountCents: 0, waivedAboveQty: null }])}>+ Add fee</button>
    </>
  )
}

/** Single-flavor bundle config. Units + bundle copy collapse when packs = 1. */
function SinglePack() {
  const [packsPerBundle, setPacksPerBundle] = useState(1)
  const isBundle = packsPerBundle > 1
  return (
    <>
      <div className="section-title"><span className="ic">▦</span> Pack</div>
      <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Packs per bundle" hint="you choose">
          <input className="input" type="number" min={1} value={packsPerBundle} onChange={(e) => setPacksPerBundle(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 90 }} />
        </Field>
        {isBundle && <Field label="Units (pcs) per pack"><input className="input" type="number" min={1} defaultValue={1} style={{ width: 90 }} /></Field>}
        <span className="tiny muted" style={{ paddingBottom: 9 }}>{isBundle ? `A ${packsPerBundle}-pack bundle of the same flavor.` : 'A single pack.'}</span>
      </div>
    </>
  )
}

function MultiFlavor({ draftId, facilities, baseSku, maxColumns, flavors, onFlavors }: { draftId: string | null; facilities: FacilityOption[]; baseSku: string; maxColumns: number; flavors: Flavor[]; onFlavors: (f: Flavor[]) => void }) {
  const list = flavors.length ? flavors : [{ name: '', ingId: 'cane', soi: '' }]
  const [perFlavorCap, setPerFlavorCap] = useState(false)
  // Manufacturer's ceiling: how many DISTINCT flavors a Creator may combine into
  // a single pack. null = no cap (Creator can use the whole pool).
  const [maxPerPack, setMaxPerPack] = useState<number | null>(null)
  const pool = list.length
  const effCap = Math.min(maxPerPack ?? pool, pool)
  function set(i: number, p: Partial<Flavor>) {
    onFlavors(list.map((f, j) => (j === i ? { ...f, ...p } : f)))
  }

  // Persist flavor pool → FlavorPreset rows (debounced).
  const flavorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (flavorTimer.current) clearTimeout(flavorTimer.current)
    flavorTimer.current = setTimeout(() => {
      void saveFlavors(draftId, list.map((f, i) => ({ name: f.name, statementOfIdentity: f.soi, sortOrder: i })))
    }, 900)
    return () => { if (flavorTimer.current) clearTimeout(flavorTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flavors, draftId])

  // Persist the variety cap → ProductTemplate.maxFlavorsPerPack (debounced).
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (capTimer.current) clearTimeout(capTimer.current)
    capTimer.current = setTimeout(() => {
      // effCap === pool means "no cap" → persist null.
      void updateBasics(draftId, { maxFlavorsPerPack: maxPerPack == null || maxPerPack >= pool ? null : maxPerPack })
    }, 700)
    return () => { if (capTimer.current) clearTimeout(capTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPerPack, pool, draftId])
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div className="section-title"><span className="ic">❀</span> Flavors <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· you set how many · each becomes its own recipe in the next step · ≤{maxColumns}-column label</span></div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={perFlavorCap} onChange={(e) => setPerFlavorCap(e.target.checked)} /> Per-flavor capacity
          </label>
          <button className="rb-btn-add" onClick={() => onFlavors([...list, { name: '', ingId: 'cane', soi: '' }])}>+ Add flavor</button>
        </div>
      </div>

      {/* Manufacturer caps how many distinct flavors a Creator can mix per pack */}
      <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Flavor pool" hint="flavors you list">
          <input className="input" value={pool} disabled style={{ width: 90 }} />
        </Field>
        <Field label="Max flavors per pack" hint="Creator picks up to this">
          <input
            className="input" type="number" min={1} max={pool}
            value={maxPerPack ?? pool}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setMaxPerPack(Number.isNaN(v) ? null : Math.min(Math.max(1, v), pool))
            }}
            style={{ width: 120 }}
          />
        </Field>
        <span className="tiny muted" style={{ paddingBottom: 9 }}>
          {effCap >= pool
            ? `No cap — a Creator can build a pack from all ${pool} flavor${pool === 1 ? '' : 's'}.`
            : `A Creator can mix up to ${effCap} of your ${pool} flavors in one pack.`}
        </span>
      </div>
      <table style={{ marginTop: 14 }}>
        <thead><tr><th>#</th><th>Flavor name</th><th>SKU</th><th>Statement of Identity</th>{perFlavorCap && <><th>MOQ</th><th>Capacity</th></>}<th>Facility</th><th /></tr></thead>
        <tbody>
          {list.map((f, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input className="input" value={f.name} placeholder={`Flavor ${i + 1}`} onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td className="muted">{baseSku ? `${baseSku}-F${i + 1}` : `F${i + 1}`}</td>
              <td><input className="input" value={f.soi} placeholder="e.g. Sparkling yuzu soda" onChange={(e) => set(i, { soi: e.target.value })} /></td>
              {perFlavorCap && <><td><input className="input" type="number" min={1} placeholder="inherit" style={{ width: 80 }} /></td><td><input className="input" type="number" min={1} placeholder="inherit" style={{ width: 90 }} /></td></>}
              <td>
                <select className="sel">
                  {facilities.length === 0 && <option>Default</option>}
                  {facilities.map((fa) => <option key={fa.id}>{fa.name}</option>)}
                </select>
              </td>
              <td>{list.length > 1 && <button className="del" onClick={() => onFlavors(list.filter((_, j) => j !== i))}>🗑</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted" style={{ marginTop: 8 }}>
        List all {list.length} flavor{list.length === 1 ? '' : 's'} the product can carry — the Creator chooses which (up to {effCap}) go in a pack in the marketplace. Each flavor carries into the Recipe step as its own recipe + single-column label; the pack gets a combined multi-column label.
        {perFlavorCap && ' Blank MOQ/capacity inherits the shared production values above.'}
      </p>
    </>
  )
}

function MultiPack() {
  const [unitsPerOuter, setUnitsPerOuter] = useState(12)
  const [components, setComponents] = useState<Array<{ name: string; printed: boolean }>>([
    { name: 'Primary · Can', printed: true },
    { name: 'Secondary · Carton', printed: true },
  ])
  return (
    <>
      <div className="section-title"><span className="ic">▣</span> Pack composition</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 12 }}>
        <Field label="Pack type"><select className="sel"><option>Variety multipack</option><option>Single-flavor multipack</option><option>Sampler</option></select></Field>
        <Field label="Outer pack"><select className="sel"><option>Paper carton (printed)</option><option>Shrink (no print)</option></select></Field>
        <Field label="Units per outer" hint="you choose"><input className="input" type="number" min={1} value={unitsPerOuter} onChange={(e) => setUnitsPerOuter(Math.max(1, parseInt(e.target.value, 10) || 1))} /></Field>
      </div>
      <div className="compbar">
        {components.map((c, i) => (
          <div key={i} className="compcard" style={c.printed ? undefined : { opacity: 0.7 }}>
            <b>{c.name}</b>
            <div className="muted small">{c.printed ? 'printed · die-line required' : 'not decorated'}</div>
            <button className="del" style={{ fontSize: 10 }} onClick={() => setComponents(components.filter((_, j) => j !== i))}>remove</button>
          </div>
        ))}
        <button className="rb-btn-add" onClick={() => setComponents([...components, { name: `Component ${components.length + 1}`, printed: true }])}>+ Component</button>
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>{unitsPerOuter} units per outer · {components.length} component{components.length === 1 ? '' : 's'}. Each printed component gets a die-line in Packaging.</p>
    </>
  )
}

/** Subscription-rotating add-on — delivery cadence + how many flavors rotate in. */
function SubscriptionConfig() {
  const [cadence, setCadence] = useState('monthly')
  const [rotation, setRotation] = useState(3)
  return (
    <div className="addon">
      <div className="section-title"><span className="ic">↻</span> Subscription &amp; rotation</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 12 }}>
        <Field label="Delivery cadence">
          <select className="sel" value={cadence} onChange={(e) => setCadence(e.target.value)}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </Field>
        <Field label="Flavors per shipment" hint="rotation size">
          <input className="input" type="number" min={1} value={rotation} onChange={(e) => setRotation(Math.max(1, parseInt(e.target.value, 10) || 1))} />
        </Field>
        <Field label="Min. commitment">
          <select className="sel"><option>None (cancel anytime)</option><option>3 shipments</option><option>6 shipments</option><option>12 shipments</option></select>
        </Field>
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Ships {rotation} rotating flavor{rotation === 1 ? '' : 's'} {cadence}. Each shipment draws from the flavors defined above.</p>
    </div>
  )
}

/** Customizable pick-N add-on — customer picks between min and max of M flavors. */
function PickNConfig({ flavorCount }: { flavorCount: number }) {
  const [min, setMin] = useState(1)
  const [max, setMax] = useState(6)
  const M = flavorCount || 0
  const exceedsPool = M > 0 && max > M
  return (
    <div className="addon">
      <div className="section-title"><span className="ic">☑</span> Customer choice (pick-N)</div>
      <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Min picks"><input className="input" type="number" min={1} value={min} onChange={(e) => setMin(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 90 }} /></Field>
        <Field label="Max picks"><input className="input" type="number" min={1} value={max} onChange={(e) => setMax(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 90 }} /></Field>
        <span className="tiny muted" style={{ paddingBottom: 9 }}>Customer picks {min === max ? min : `${min}–${max}`} of {M || 'the'} available flavor{M === 1 ? '' : 's'}.</span>
      </div>
      {exceedsPool && <div className="warn">⚠ Max picks ({max}) is more than the {M} flavor{M === 1 ? '' : 's'} you’ve defined. Add more flavors or lower the max.</div>}
    </div>
  )
}
