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

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { InfoTip } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { updateBasics, saveFlavors, saveFees, saveProduction, savePacking, saveSampleOptions, type FeeInput, type SampleOptionInput, type InitialDraft } from './build-actions'
import { OptionAxesCard, type OptionAxisUI } from './OptionAxesCard'
import { ApprovalTriggersCard, CompatibilityRulesCard } from './AdvancedRulesCard'
import type { PackingProfileOption } from './ProductTypeGate'
import { packUiKindForProfile } from './structuralPackType'
import { Boxes, Factory, DollarSign, FlaskConical, Sparkles, Package, Repeat, CheckSquare } from 'lucide-react'

interface FacilityOption { id: string; name: string }

const BUCKETS: Array<{ title: string; groups: string[] }> = [
  { title: 'Single flavor', groups: ['SINGLE_FLAVOR_SINGLE_PACK', 'SINGLE_FLAVOR_MULTIPACK', 'VALUE_BULK_SINGLE'] },
  { title: 'Multiple flavors', groups: ['MULTI_FLAVOR_MIXED_PACK', 'MULTI_FLAVOR_COMPARTMENT_PACK', 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', 'VALUE_BULK_VARIETY'] },
  { title: 'Curated & custom', groups: ['CUSTOMIZABLE_PICK_N', 'SAMPLER_MINI', 'GIFT_PREMIUM', 'SEASONAL_LIMITED', 'PAIRING_FUNCTIONAL', 'RETAIL_COUNTER_DISPLAY', 'REFILL_ECO'] },
  { title: 'Recurring', groups: ['SUBSCRIPTION_ROTATING'] },
]

// A flavor-specific overlay ingredient line (added on top of the shared base
// recipe). Each carries its own amount + unit, so the engine recomputes that
// flavor's Nutrition Facts correctly. Persisted to FlavorPreset.extras.
export interface FlavorLine {
  ingId: string
  name: string
  qty: number
  unit: string
  per100g?: Record<string, number>
  densityGPerMl?: number | null
  allergens?: string[]
}
// `ingId` is the legacy single-overlay field (kept for back-compat); the live
// model is `lines` — a child mini-recipe of flavor-only additions.
export interface Flavor { name: string; ingId: string; soi: string; lines?: FlavorLine[] }

export interface PackSplit { flavors: number; perFlavor: number; even: boolean; distribution: string }

/** Derive the valid (flavor-count × pieces) splits for a pack of a given
 *  capacity. Even-only keeps splits where the count divides capacity evenly;
 *  otherwise an uneven distribution is allowed (e.g. 18 ÷ 4 = 5+5+4+4). A flavor
 *  may not appear fewer than `minPerFlavor` times, which caps the flavor count.
 *  21 CFR has no rule here — this is a production-line constraint. */
export function computePackSplits(capacity: number, minPerFlavor: number, evenOnly: boolean, pool: number): PackSplit[] {
  if (!Number.isFinite(capacity) || capacity < 1) return []
  const minPer = Math.max(1, Math.floor(minPerFlavor))
  const maxFlavors = Math.min(pool > 0 ? pool : capacity, Math.floor(capacity / minPer))
  const out: PackSplit[] = []
  for (let f = 1; f <= maxFlavors; f++) {
    if (capacity % f === 0) {
      out.push({ flavors: f, perFlavor: capacity / f, even: true, distribution: `${f} × ${capacity / f}` })
    } else if (!evenOnly) {
      const base = Math.floor(capacity / f)
      const rem = capacity % f
      out.push({ flavors: f, perFlavor: base, even: false, distribution: `${rem} × ${base + 1} + ${f - rem} × ${base}` })
    }
  }
  return out
}

export function VariantsPacksStep({
  packingProfiles, facilities, baseSku, draftId, selected, onSelect, flavors, onFlavors, axes, onAxes, initial, locked = false, registerFlush,
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
  initial?: InitialDraft | null
  /** Lock-after-recipe (#38): once a recipe is authored the structural type is
   *  fixed — disable changing it. The rest of the step stays editable. */
  locked?: boolean
  /** Register an immediate flush of the debounced draft-level autosaves. */
  registerFlush?: (fn: () => Promise<void> | void) => () => void
}) {
  const [, start] = useTransition()
  const [open, setOpen] = useState(false)

  function choose(p: PackingProfileOption) {
    if (locked) return
    onSelect(p)
    setOpen(false)
    if (draftId) {
      start(async () => {
        const res = await updateBasics(draftId, { packingProfileId: p.id })
        if (!res.ok) toast.error(res.error)
      })
    }
  }

  // Packing-type consolidation: the config UI keys off the 6-value structuralType
  // (single source), falling back to flavorMode + packStructure for any profile
  // not yet carrying one. See ./structuralPackType + docs/PACKING_TYPE_CONSOLIDATION.md.
  const kind = selected ? packUiKindForProfile(selected) : null

  // M (available flavors) for the pick-N config.
  const flavorCount = flavors.filter((f) => f.name.trim()).length

  return (
    <div>
      <p className="muted small" style={{ marginBottom: 14 }}>
        Pick the product type first, then set the production spec.
      </p>

      {/* Product type — space-saving dropdown that opens grouped cards */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">
          <span className="ic"><Boxes size={16} strokeWidth={2} /></span> Product type
          {locked && <span className="pill" style={{ marginLeft: 8, padding: '1px 8px', fontSize: 10 }} title="Locked because a recipe has been started — changing it would reshape the recipe and label. To use a different type, start a new product.">🔒 locked</span>}
        </div>
        <button type="button" className="pt-trigger" data-open={open ? 'on' : undefined} disabled={locked} aria-disabled={locked} onClick={() => { if (!locked) setOpen((v) => !v) }} style={{ marginTop: 10, ...(locked ? { cursor: 'not-allowed', opacity: 0.75 } : null) }}>
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
            {packingProfiles.length === 0 && <p className="hint" style={{ marginTop: 10 }}>No packing types seeded yet — run the DB seed.</p>}
          </div>
        )}
      </div>

      {/* Shared production block — applies to EVERY product type */}
      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SharedProduction draftId={draftId} facilities={facilities} baseSku={baseSku} initial={initial} registerFlush={registerFlush} />
        </div>
      )}

      {/* Fees — one-time / per-unit / per-order (#3) */}
      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <FeesCard draftId={draftId} initialFees={initial?.fees} />
        </div>
      )}

      {/* Samples — partner sample policy (Pavel 2026-06-10) */}
      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <SamplesCard draftId={draftId} initialOptions={initial?.sampleOptions} isMultiFlavor={selected.flavorMode === 'MULTI'} />
        </div>
      )}

      {/* Type-specific config for the chosen type */}
      {kind && (
        <>
          {kind === 'single' && <div className="card" style={{ marginBottom: 16 }}><SinglePack draftId={draftId} packing={initial?.packing ?? null} /></div>}
          {kind === 'multi' && <MultiFlavor draftId={draftId} facilities={facilities} baseSku={baseSku} maxColumns={selected!.labelColumns} flavors={flavors} onFlavors={onFlavors} initialMax={initial?.maxFlavorsPerPack ?? null} packing={initial?.packing ?? null} />}
          {kind === 'pack' && <div className="card" style={{ marginBottom: 16 }}><MultiPack draftId={draftId} packing={initial?.packing ?? null} /></div>}

          {/* Conditional add-ons — each its own card */}
          {selected?.isSubscription && <div className="card" style={{ marginBottom: 16 }}><SubscriptionConfig draftId={draftId} packing={initial?.packing ?? null} flavorCount={flavorCount} /></div>}
          {selected?.isCustomizable && <div className="card" style={{ marginBottom: 16 }}><PickNConfig draftId={draftId} packing={initial?.packing ?? null} flavorCount={flavorCount} /></div>}
        </>
      )}

      {/* Configurable axes beyond flavor (sweetener / strength / caffeine / …) */}
      {selected && <OptionAxesCard axes={axes} onAxes={onAxes} />}

      {/* Cross-option compatibility rules (#5) — only when ≥2 option values exist */}
      {selected && <CompatibilityRulesCard draftId={draftId} axes={axes} initialRules={initial?.optionRules} />}

      {/* Approval triggers (#7) */}
      {selected && <ApprovalTriggersCard draftId={draftId} initialRules={initial?.changeApprovalRules} />}

      <style>{`
        .gb .pt-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:1px solid var(--ink-200);border-radius:12px;background:#fff;padding:11px 14px;font:inherit;color:var(--ink-900);cursor:pointer;transition:.12s}
        .gb .pt-trigger:hover{border-color:var(--pink-100)}
        .gb .pt-trigger[data-open=on]{border-color:var(--pink);background:var(--pink-50)}
        .gb .pt-caret{color:var(--ink-500);font-size:11px}
        .gb .pt-panel{margin-top:12px;padding-top:12px;border-top:1px dashed var(--ink-200)}
        .gb .ptcard{border:1px solid var(--ink-200);border-radius:12px;background:#fff;padding:11px 13px;text-align:left;cursor:pointer;font:inherit;color:var(--ink-900);transition:.12s;width:100%}
        .gb .ptcard:hover{border-color:var(--pink-100)}
        .gb .ptcard[data-on=on]{border-color:var(--pink);background:var(--pink-50)}
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
function SharedProduction({ draftId, facilities, baseSku, initial, registerFlush }: { draftId: string | null; facilities: FacilityOption[]; baseSku: string; initial?: InitialDraft | null; registerFlush?: (fn: () => Promise<void> | void) => () => void }) {
  const p = initial?.production
  const fmInit: 'bulk' | 'mto' | 'both' = p?.fulfillmentMode === 'ON_DEMAND' ? 'mto' : p?.fulfillmentMode === 'BOTH' ? 'both' : 'bulk'
  const [fulfillment, setFulfillment] = useState<'bulk' | 'mto' | 'both'>(fmInit)
  const [moq, setMoq] = useState(p?.moqMin ?? 500)
  const [increment, setIncrement] = useState(p?.orderIncrement ?? 100)
  const [capacity, setCapacity] = useState(p?.monthlyCapacity ?? 50000)
  const [leadRepeat, setLeadRepeat] = useState(initial?.leadTimeRepeatDays ?? 21)
  const [leadFirstRun, setLeadFirstRun] = useState(initial?.leadTimeFirstRunDays ?? 35)
  const [shelfLife, setShelfLife] = useState(p?.shelfLifeDays ?? 365)
  const [lotTracking, setLotTracking] = useState(p?.lotTracking ?? true)
  const [sku, setSku] = useState(p?.sku ?? baseSku)
  const [netVal, setNetVal] = useState<number | ''>(p?.netContentValue ?? '')
  const [netUnit, setNetUnit] = useState(p?.netContentUnit ?? '')
  const [storageClass, setStorageClass] = useState<'AMBIENT' | 'CHILLED' | 'FROZEN'>(initial?.storageClass ?? 'AMBIENT')
  const [tempMin, setTempMin] = useState<number | ''>(initial?.storageTempMinF ?? 55)
  const [tempMax, setTempMax] = useState<number | ''>(initial?.storageTempMaxF ?? 75)

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

  // Persist production spec onto the draft's default variant (#35) — debounced.
  const fulfillmentEnum = fulfillment === 'mto' ? 'ON_DEMAND' : fulfillment === 'both' ? 'BOTH' : 'BULK_PRODUCTION'
  const prodTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (prodTimer.current) clearTimeout(prodTimer.current)
    prodTimer.current = setTimeout(() => {
      void saveProduction(draftId, {
        fulfillmentMode: fulfillmentEnum,
        moqMin: effMoq,
        orderIncrement: effInc,
        monthlyCapacity: capacity || null,
        shelfLifeDays: shelfLife,
        lotTracking,
        sku,
        netContentValue: netVal === '' ? null : netVal,
        netContentUnit: netUnit || null,
      })
    }, 800)
    return () => { if (prodTimer.current) clearTimeout(prodTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, moq, increment, capacity, shelfLife, lotTracking, sku, netVal, netUnit, draftId])

  // Immediate flush of the two draft-level autosaves before navigation (registry).
  const flushRef = useRef<() => Promise<void>>(async () => {})
  flushRef.current = async () => {
    if (!draftId) return
    if (t.current) clearTimeout(t.current)
    if (prodTimer.current) clearTimeout(prodTimer.current)
    await updateBasics(draftId, {
      storageClass,
      storageTempMinF: tempMin === '' ? null : tempMin,
      storageTempMaxF: tempMax === '' ? null : tempMax,
      leadTimeRepeatDays: leadRepeat,
      leadTimeFirstRunDays: leadFirstRun,
    })
    await saveProduction(draftId, {
      fulfillmentMode: fulfillmentEnum,
      moqMin: effMoq,
      orderIncrement: effInc,
      monthlyCapacity: capacity || null,
      shelfLifeDays: shelfLife,
      lotTracking,
      sku,
      netContentValue: netVal === '' ? null : netVal,
      netContentUnit: netUnit || null,
    })
  }
  useEffect(() => {
    if (!registerFlush) return
    return registerFlush(() => flushRef.current())
  }, [registerFlush])

  return (
    <>
      <div className="section-title"><span className="ic"><Factory size={16} strokeWidth={2} /></span> Production &amp; availability</div>
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
        <Field label="New-SKU lead time (days)" hint="first run">
          <input className="input" type="number" min={0} value={leadFirstRun} onChange={(e) => setLeadFirstRun(Math.max(0, parseInt(e.target.value, 10) || 0))} />
        </Field>
        <Field label="Monthly capacity"><input className="input" type="number" min={0} value={capacity} onChange={(e) => setCapacity(Math.max(0, parseInt(e.target.value, 10) || 0))} /></Field>
        <Field label="Shelf life (days)"><input className="input" type="number" min={1} value={shelfLife} onChange={(e) => setShelfLife(Math.max(1, parseInt(e.target.value, 10) || 1))} /></Field>
        <Field label="Storage class">
          <select className="sel" value={storageClass} onChange={(e) => setStorageClass(e.target.value as 'AMBIENT' | 'CHILLED' | 'FROZEN')}>
            <option value="AMBIENT">Ambient (shelf-stable)</option>
            <option value="CHILLED">Chilled (refrigerated)</option>
            <option value="FROZEN">Frozen</option>
          </select>
        </Field>
        <Field label="Min storage temp (°F)"><input className="input" type="number" value={tempMin} onChange={(e) => setTempMin(e.target.value === '' ? '' : parseInt(e.target.value, 10))} /></Field>
        <Field label="Max storage temp (°F)"><input className="input" type="number" value={tempMax} onChange={(e) => setTempMax(e.target.value === '' ? '' : parseInt(e.target.value, 10))} /></Field>
        <Field label="Base SKU" hint="manufacturer stock id"><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
        <Field label="Lot / batch tracking"><select className="sel" value={lotTracking ? 'on' : 'off'} onChange={(e) => setLotTracking(e.target.value === 'on')}><option value="on">On (recommended)</option><option value="off">Off</option></select></Field>
        <Field label="Net content" hint="declared on label"><input className="input" type="number" min={0} step="any" value={netVal} onChange={(e) => setNetVal(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))} placeholder="e.g. 473" /></Field>
        <Field label="Net content unit">
          <select className="sel" value={netUnit} onChange={(e) => setNetUnit(e.target.value)}>
            <option value="">—</option>
            <option value="g">g</option>
            <option value="mL">mL</option>
            <option value="fl oz">fl oz</option>
            <option value="oz">oz</option>
            <option value="ct">count</option>
            <option value="capsules">capsules</option>
            <option value="tablets">tablets</option>
            <option value="servings">servings</option>
          </select>
        </Field>
        <Field label="Manufactured by">
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
        <p className="hint" style={{ marginTop: 8 }}>On-demand: no batch minimum (MOQ = 1); lead time runs longer than bulk.</p>
      )}
    </>
  )
}

/** Fees — one-time / per-unit / per-order. PER_SKU_ONE_TIME fees can waive at a
 *  volume threshold (e.g. QA batch testing waived above 12,500 units). */
interface FeeRow { label: string; basis: 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'; amountCents: number; waivedAboveQty: number | null }
function FeesCard({ draftId, initialFees }: { draftId: string | null; initialFees?: InitialDraft['fees'] }) {
  const [fees, setFees] = useState<FeeRow[]>(
    () => (initialFees ?? []).map((f) => ({ label: f.label, basis: f.basis, amountCents: f.amountCents, waivedAboveQty: f.waivedAboveQty })),
  )
  // Guard the first autosave so resuming a draft doesn't immediately re-write
  // the rows we just loaded (and never wipes saved fees with an empty mount).
  const hydrated = useRef(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (!hydrated.current) { hydrated.current = true; return }
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
      <div className="section-title"><span className="ic"><DollarSign size={16} strokeWidth={2} /></span> Fees</div>
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

// ---------------------------------------------------------------------------
// Samples — partner sample policy (Pavel 2026-06-10). Two kinds the partner can
// offer + price per product: UNBRANDED (product only) and BRANDED (with the
// creator's packaging). Per-flavor + optional sampler-set pricing; small sample
// MOQ + own lead time; partner-optional credit toward the first production order.
// ---------------------------------------------------------------------------
interface SampleRow {
  kind: 'UNBRANDED' | 'BRANDED'
  enabled: boolean
  perFlavorCents: number | null
  samplerSetCents: number | null
  sampleMoq: number
  maxUnitsPerFlavor: number | null
  leadTimeDays: number
  creditTowardFirstOrder: boolean
  creditCapCents: number | null
  maxPerCreatorPerPeriod: number | null
}
function defaultSampleRow(kind: 'UNBRANDED' | 'BRANDED'): SampleRow {
  return { kind, enabled: false, perFlavorCents: null, samplerSetCents: null, sampleMoq: 1, maxUnitsPerFlavor: null, leadTimeDays: kind === 'BRANDED' ? 28 : 14, creditTowardFirstOrder: false, creditCapCents: null, maxPerCreatorPerPeriod: null }
}
const dollars = (c: number | null) => (c == null || c === 0 ? '—' : `$${(c / 100).toFixed(2)}`)
const centsField = (v: number | null, set: (n: number | null) => void, w = 100) => (
  <input className="input" type="number" min={0} value={v ?? ''} placeholder="—" style={{ width: w }} onChange={(e) => set(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))} />
)

function SampleKindEditor({ row, onChange, isMultiFlavor }: { row: SampleRow; onChange: (r: SampleRow) => void; isMultiFlavor: boolean }) {
  const patch = (p: Partial<SampleRow>) => onChange({ ...row, ...p })
  const branded = row.kind === 'BRANDED'
  return (
    <div style={{ marginTop: 12, border: '1px solid var(--ink-200)', borderRadius: 14, padding: 14, background: 'var(--ink-50)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <label className="toggle-label">
            <input type="checkbox" checked={row.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            {branded ? 'Branded sample' : 'Unbranded sample'}
            <InfoTip text={branded
              ? 'Product in the creator’s packaging + artwork (a “golden sample”). Gates on the dieline passing the compliance check before it can be produced.'
              : 'The recipe in plain / generic packaging — “taste the formulation.” Ships before artwork exists; stamped NOT FOR RESALE.'} />
          </label>
        </div>
        {row.enabled && <span className="pill" style={{ padding: '1px 8px', fontSize: 10 }}>{isMultiFlavor ? `${dollars(row.perFlavorCents)}/flavor` : dollars(row.perFlavorCents)}</span>}
      </div>

      {row.enabled && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 12 }}>
            <Field label={isMultiFlavor ? 'Per-flavor price (¢)' : 'Sample unit price (¢)'} hint={dollars(row.perFlavorCents)}>
              {centsField(row.perFlavorCents, (n) => patch({ perFlavorCents: n }))}
            </Field>
            {isMultiFlavor && (
              <Field label="Sampler-set price (¢)" hint={`all flavors · ${dollars(row.samplerSetCents)}`}>
                {centsField(row.samplerSetCents, (n) => patch({ samplerSetCents: n }))}
              </Field>
            )}
            <Field label="Sample MOQ" hint="min units / order"><input className="input" type="number" min={1} value={row.sampleMoq} onChange={(e) => patch({ sampleMoq: Math.max(1, parseInt(e.target.value, 10) || 1) })} /></Field>
            <Field label="Lead time (days)"><input className="input" type="number" min={0} value={row.leadTimeDays} onChange={(e) => patch({ leadTimeDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} /></Field>
            {isMultiFlavor && (
              <Field label="Max units / flavor" hint="optional cap"><input className="input" type="number" min={1} value={row.maxUnitsPerFlavor ?? ''} placeholder="—" onChange={(e) => patch({ maxUnitsPerFlavor: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) })} /></Field>
            )}
            <Field label="Max samples / creator" hint="optional"><input className="input" type="number" min={1} value={row.maxPerCreatorPerPeriod ?? ''} placeholder="∞" onChange={(e) => patch({ maxPerCreatorPerPeriod: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1) })} /></Field>
          </div>
          <div className="row" style={{ gap: 16, marginTop: 10, alignItems: 'flex-end' }}>
            <label className="toggle-label">
              <input type="checkbox" checked={row.creditTowardFirstOrder} onChange={(e) => patch({ creditTowardFirstOrder: e.target.checked })} />
              Credit sample cost toward the creator’s first production order
            </label>
            {row.creditTowardFirstOrder && (
              <Field label="Credit cap (¢)" hint={`max · ${dollars(row.creditCapCents)} · blank = full`}>
                {centsField(row.creditCapCents, (n) => patch({ creditCapCents: n }))}
              </Field>
            )}
          </div>
          {branded && <p className="hint" style={{ marginTop: 8, color: 'var(--pink-700)' }}>ⓘ Locked until the dieline passes the compliance check.</p>}
        </>
      )}
    </div>
  )
}

function SamplesCard({ draftId, initialOptions, isMultiFlavor }: { draftId: string | null; initialOptions?: InitialDraft['sampleOptions']; isMultiFlavor: boolean }) {
  const seed = (kind: 'UNBRANDED' | 'BRANDED'): SampleRow => {
    const found = (initialOptions ?? []).find((o) => o.kind === kind)
    return found ? { ...defaultSampleRow(kind), ...found } : defaultSampleRow(kind)
  }
  const [unbranded, setUnbranded] = useState<SampleRow>(() => seed('UNBRANDED'))
  const [branded, setBranded] = useState<SampleRow>(() => seed('BRANDED'))
  const [samplesOn, setSamplesOn] = useState((initialOptions ?? []).some((o) => o.enabled))
  const hydrated = useRef(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (!hydrated.current) { hydrated.current = true; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Always persist both rows (so configured prices survive a master toggle);
      // the master switch gates each kind's effective `enabled`.
      const payload: SampleOptionInput[] = [
        { ...unbranded, enabled: samplesOn && unbranded.enabled },
        { ...branded, enabled: samplesOn && branded.enabled },
      ]
      void saveSampleOptions(draftId, payload)
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samplesOn, unbranded, branded, draftId])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div className="section-title"><span className="ic"><FlaskConical size={16} strokeWidth={2} /></span> Samples</div>
        <label className="toggle-label">
          <input type="checkbox" checked={samplesOn} onChange={(e) => setSamplesOn(e.target.checked)} /> Allow sample orders
        </label>
      </div>
      {!samplesOn && <p className="muted" style={{ marginTop: 10, fontSize: 'var(--fs-sm)' }}>Sample orders are off for this product. Turn them on to let creators order a pre-production sample.</p>}
      {samplesOn && (
        <>
          <SampleKindEditor row={unbranded} onChange={setUnbranded} isMultiFlavor={isMultiFlavor} />
          <SampleKindEditor row={branded} onChange={setBranded} isMultiFlavor={isMultiFlavor} />
          {!unbranded.enabled && !branded.enabled && <div className="warn">⚠ Samples are allowed but neither kind is enabled — enable Unbranded or Branded above, or turn samples off.</div>}
        </>
      )}
    </>
  )
}

type PackingInit = InitialDraft['packing']
function cfgNum(p: PackingInit, key: string, fallback: number): number {
  const v = p?.packingConfig?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Single-flavor bundle config. Units + bundle copy collapse when packs = 1.
 *  Persists packs-per-bundle → variant.innerPacksPerOuter and units-per-pack →
 *  packingConfig.unitsPerPack (debounced, parity with the flavors card). */
function SinglePack({ draftId, packing }: { draftId: string | null; packing: PackingInit }) {
  const [packsPerBundle, setPacksPerBundle] = useState(packing?.innerPacksPerOuter ?? 1)
  const [unitsPerPack, setUnitsPerPack] = useState(() => cfgNum(packing, 'unitsPerPack', 1))
  const isBundle = packsPerBundle > 1
  const totalUnits = packsPerBundle * unitsPerPack

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void savePacking(draftId, { innerPacksPerOuter: packsPerBundle, packingConfig: { unitsPerPack } })
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packsPerBundle, unitsPerPack, draftId])

  return (
    <>
      <div className="section-title"><span className="ic"><Factory size={16} strokeWidth={2} /></span> Pack</div>
      <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Packs per bundle" hint="you choose">
          <input className="input" type="number" min={1} value={packsPerBundle} onChange={(e) => setPacksPerBundle(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 90 }} />
        </Field>
        <Field label="Units (pcs) per pack" hint="e.g. 2 bars in a pack">
          <input className="input" type="number" min={1} value={unitsPerPack} onChange={(e) => setUnitsPerPack(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 110 }} />
        </Field>
        <span className="hint" style={{ paddingBottom: 9 }}>
          {isBundle ? `A ${packsPerBundle}-pack bundle of the same flavor` : 'A single pack'}
          {unitsPerPack > 1 ? `, ${unitsPerPack} pcs each` : ''} · <b>{totalUnits.toLocaleString()}</b> sellable unit{totalUnits === 1 ? '' : 's'} per bundle.
        </span>
      </div>
    </>
  )
}

function MultiFlavor({ draftId, facilities, baseSku, maxColumns, flavors, onFlavors, initialMax, packing }: { draftId: string | null; facilities: FacilityOption[]; baseSku: string; maxColumns: number; flavors: Flavor[]; onFlavors: (f: Flavor[]) => void; initialMax?: number | null; packing: PackingInit }) {
  const list = flavors.length ? flavors : [{ name: '', ingId: 'cane', soi: '' }]
  const [perFlavorCap, setPerFlavorCap] = useState(false)
  // Manufacturer's ceiling: how many DISTINCT flavors a Creator may combine into
  // a single pack. null = no cap (Creator can use the whole pool).
  const [maxPerPack, setMaxPerPack] = useState<number | null>(initialMax ?? null)
  // Pack composition (production-line constraint): box capacity + min run per
  // flavor + even-fills rule → the valid flavor×pieces splits a Creator may pick.
  // Capacity reuses the shared packingConfig.unitsPerPack so it isn't entered
  // twice; min-per-flavor + even-fills persist alongside it.
  const [packCapacity, setPackCapacity] = useState<number | null>(() => {
    const u = cfgNum(packing, 'unitsPerPack', 0)
    return u >= 1 ? u : null
  })
  const [minPerFlavor, setMinPerFlavor] = useState(() => cfgNum(packing, 'minPerFlavor', 1))
  const [evenOnly, setEvenOnly] = useState(() => packing?.packingConfig?.evenFillsOnly !== false)
  const pool = list.length
  const packSplits = useMemo(
    () => (packCapacity ? computePackSplits(packCapacity, minPerFlavor, evenOnly, pool) : []),
    [packCapacity, minPerFlavor, evenOnly, pool],
  )
  // Largest flavor count the pack can actually hold → the feasible ceiling.
  const feasibleMaxFlavors = packSplits.length ? Math.max(...packSplits.map((s) => s.flavors)) : pool
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
      void saveFlavors(draftId, list.map((f, i) => ({
        name: f.name, statementOfIdentity: f.soi, sortOrder: i,
        // Carry the overlay lines through so editing names here never wipes the
        // flavor ingredients added in the Recipe step.
        extras: (f.lines ?? []).map((l) => ({ ingredientId: l.ingId, name: l.name, qty: l.qty, unit: l.unit })),
      })))
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

  // Persist pack composition → packingConfig (merged: unitsPerPack reused as
  // capacity, plus minPerFlavor + evenFillsOnly). Debounced.
  const compTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (compTimer.current) clearTimeout(compTimer.current)
    compTimer.current = setTimeout(() => {
      const packingConfig: Record<string, unknown> = { minPerFlavor, evenFillsOnly: evenOnly }
      if (packCapacity != null) packingConfig.unitsPerPack = packCapacity
      void savePacking(draftId, { packingConfig })
    }, 800)
    return () => { if (compTimer.current) clearTimeout(compTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packCapacity, minPerFlavor, evenOnly, draftId])
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div className="section-title"><span className="ic"><Sparkles size={16} strokeWidth={2} /></span> Flavors</div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <label className="toggle-label">
            <input type="checkbox" checked={perFlavorCap} onChange={(e) => setPerFlavorCap(e.target.checked)} /> Per-flavor capacity
          </label>
          <button className="rb-btn-add" onClick={() => onFlavors([...list, { name: '', ingId: 'cane', soi: '' }])}>+ Add flavor</button>
        </div>
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
      <p className="hint" style={{ marginTop: 8 }}>
        List all {list.length} flavor{list.length === 1 ? '' : 's'} the product can carry — the Creator picks up to {effCap} per pack.
        {perFlavorCap && ' Blank MOQ/capacity inherits the shared production values above.'}
      </p>

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
        <span className="hint" style={{ paddingBottom: 9 }}>
          {effCap >= pool
            ? `No cap — a Creator can build a pack from all ${pool} flavor${pool === 1 ? '' : 's'}.`
            : `A Creator can mix up to ${effCap} of your ${pool} flavors in one pack.`}
        </span>
      </div>
      </div>

      {/* Pack composition — its own card, under the Flavors card. */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 10 }}><span className="ic"><Package size={16} strokeWidth={2} /></span> Pack composition</div>
        <div className="row" style={{ gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Pack capacity" hint="units per box">
            <input className="input" type="number" min={1} value={packCapacity ?? ''} placeholder="e.g. 18"
              onChange={(e) => { const v = parseInt(e.target.value, 10); setPackCapacity(Number.isNaN(v) ? null : Math.max(1, v)) }}
              style={{ width: 110 }} />
          </Field>
          <Field label="Min per flavor" hint="smallest run">
            <input className="input" type="number" min={1} value={minPerFlavor}
              onChange={(e) => setMinPerFlavor(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: 110 }} />
          </Field>
          <label className="toggle-label" style={{ paddingBottom: 9 }}>
            <input type="checkbox" checked={evenOnly} onChange={(e) => setEvenOnly(e.target.checked)} /> Even fills only
          </label>
        </div>
        {packCapacity != null && (
          packSplits.length ? (
            <>
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Flavors</th><th>Per flavor</th><th>Distribution</th><th /></tr></thead>
                <tbody>
                  {packSplits.map((s) => (
                    <tr key={s.flavors}>
                      <td>{s.flavors}</td>
                      <td>{s.perFlavor}{!s.even && '*'}</td>
                      <td className="muted">{s.distribution}</td>
                      <td>{!s.even && <span className="tiny muted">uneven</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: 8 }}>
                A {packCapacity}-unit box supports up to <b>{feasibleMaxFlavors}</b> flavor{feasibleMaxFlavors === 1 ? '' : 's'}{evenOnly ? ' (even fills)' : ''}. Set “Max flavors per pack” at or below this.{evenOnly ? '' : ' * uneven runs.'}
              </p>
            </>
          ) : (
            <p className="hint" style={{ marginTop: 8 }}>No valid splits — lower “Min per flavor” or turn off “Even fills only”.</p>
          )
        )}
      </div>

    </>
  )
}

interface PackComponent { name: string; printed: boolean }
const DEFAULT_COMPONENTS: PackComponent[] = [
  { name: 'Primary · Can', printed: true },
  { name: 'Secondary · Carton', printed: true },
]
function cfgComponents(p: PackingInit): PackComponent[] {
  const v = p?.packingConfig?.components
  if (Array.isArray(v) && v.length) {
    return v.map((c) => ({ name: String((c as PackComponent)?.name ?? 'Component'), printed: (c as PackComponent)?.printed !== false }))
  }
  return DEFAULT_COMPONENTS
}
function cfgStr(p: PackingInit, key: string, fallback: string): string {
  const v = p?.packingConfig?.[key]
  return typeof v === 'string' && v ? v : fallback
}

/** Multi-pack composition — outer pack + inner units + a component list. Persists
 *  units-per-outer → variant.innerPacksPerOuter, cases → outerPacksPerCase, and
 *  pack type / outer / components → packingConfig (debounced, parity with flavors). */
function MultiPack({ draftId, packing }: { draftId: string | null; packing: PackingInit }) {
  const [unitsPerOuter, setUnitsPerOuter] = useState(packing?.innerPacksPerOuter && packing.innerPacksPerOuter > 1 ? packing.innerPacksPerOuter : 12)
  const [casesPerPallet, setCasesPerPallet] = useState(packing?.outerPacksPerCase ?? 1)
  const [packType, setPackType] = useState(() => cfgStr(packing, 'packType', 'Variety multipack'))
  const [outerPack, setOuterPack] = useState(() => cfgStr(packing, 'outerPack', 'Paper carton (printed)'))
  const [components, setComponents] = useState<PackComponent[]>(() => cfgComponents(packing))
  const printedCount = components.filter((c) => c.printed).length

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void savePacking(draftId, {
        innerPacksPerOuter: unitsPerOuter,
        outerPacksPerCase: casesPerPallet,
        packingConfig: { packType, outerPack, components },
      })
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitsPerOuter, casesPerPallet, packType, outerPack, components, draftId])

  function patchComp(i: number, p: Partial<PackComponent>) {
    setComponents(components.map((c, j) => (j === i ? { ...c, ...p } : c)))
  }

  return (
    <>
      <div className="section-title"><span className="ic"><Package size={16} strokeWidth={2} /></span> Pack composition</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 12 }}>
        <Field label="Pack type">
          <select className="sel" value={packType} onChange={(e) => setPackType(e.target.value)}>
            <option>Variety multipack</option><option>Single-flavor multipack</option><option>Sampler</option>
          </select>
        </Field>
        <Field label="Outer pack">
          <select className="sel" value={outerPack} onChange={(e) => setOuterPack(e.target.value)}>
            <option>Paper carton (printed)</option><option>Shrink (no print)</option><option>Rigid box (printed)</option>
          </select>
        </Field>
        <Field label="Units per outer" hint="you choose"><input className="input" type="number" min={1} value={unitsPerOuter} onChange={(e) => setUnitsPerOuter(Math.max(1, parseInt(e.target.value, 10) || 1))} /></Field>
        <Field label="Outers per case" hint="shipping/case pack"><input className="input" type="number" min={1} value={casesPerPallet} onChange={(e) => setCasesPerPallet(Math.max(1, parseInt(e.target.value, 10) || 1))} /></Field>
      </div>
      <div className="compbar">
        {components.map((c, i) => (
          <div key={i} className="compcard" style={c.printed ? undefined : { opacity: 0.7 }}>
            <input className="input" value={c.name} onChange={(e) => patchComp(i, { name: e.target.value })} style={{ fontWeight: 600, marginBottom: 4 }} />
            <label className="toggle-label">
              <input type="checkbox" checked={c.printed} onChange={(e) => patchComp(i, { printed: e.target.checked })} /> {c.printed ? 'printed · die-line required' : 'not decorated'}
            </label>
            <button className="del" style={{ fontSize: 10, marginTop: 4 }} onClick={() => setComponents(components.filter((_, j) => j !== i))}>remove</button>
          </div>
        ))}
        <button className="rb-btn-add" onClick={() => setComponents([...components, { name: `Component ${components.length + 1}`, printed: true }])}>+ Component</button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>{unitsPerOuter} unit{unitsPerOuter === 1 ? '' : 's'} per outer · {casesPerPallet} outer{casesPerPallet === 1 ? '' : 's'} per case · {components.length} component{components.length === 1 ? '' : 's'} ({printedCount} printed). Each printed component gets its own die-line in Packaging.</p>
      {printedCount === 0 && <div className="warn">⚠ No printed components — this pack has nothing to decorate. Mark at least one component as printed, or this will skip the Packaging die-line step.</div>}
    </>
  )
}

const CADENCE_LABEL: Record<string, string> = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly', quarterly: 'quarterly' }

/** Subscription-rotating add-on — delivery cadence + how many flavors rotate in.
 *  Persists cadence → variant.subscriptionInterval and rotation/commitment →
 *  packingConfig (debounced). Warns when rotation exceeds the flavor pool. */
function SubscriptionConfig({ draftId, packing, flavorCount }: { draftId: string | null; packing: PackingInit; flavorCount: number }) {
  const [cadence, setCadence] = useState(packing?.subscriptionInterval ?? 'monthly')
  const [rotation, setRotation] = useState(() => cfgNum(packing, 'rotationSize', 3))
  const [minCommitment, setMinCommitment] = useState(() => cfgNum(packing, 'minCommitment', 0))
  const exceedsPool = flavorCount > 0 && rotation > flavorCount

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void savePacking(draftId, { subscriptionInterval: cadence, packingConfig: { rotationSize: rotation, minCommitment } })
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadence, rotation, minCommitment, draftId])

  return (
    <div className="addon">
      <div className="section-title"><span className="ic"><Repeat size={16} strokeWidth={2} /></span> Subscription &amp; rotation</div>
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
          <select className="sel" value={minCommitment} onChange={(e) => setMinCommitment(parseInt(e.target.value, 10) || 0)}>
            <option value={0}>None (cancel anytime)</option>
            <option value={3}>3 shipments</option>
            <option value={6}>6 shipments</option>
            <option value={12}>12 shipments</option>
          </select>
        </Field>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Ships {rotation} rotating flavor{rotation === 1 ? '' : 's'} {CADENCE_LABEL[cadence] ?? cadence}
        {minCommitment > 0 ? ` · ${minCommitment}-shipment minimum` : ' · cancel anytime'}. Each shipment draws from the flavors defined above.
      </p>
      {exceedsPool && <div className="warn">⚠ Rotation size ({rotation}) is more than the {flavorCount} flavor{flavorCount === 1 ? '' : 's'} you’ve defined — a shipment can’t hold more distinct flavors than exist. Add flavors or lower the rotation.</div>}
    </div>
  )
}

/** Customizable pick-N add-on — customer picks between min and max of M flavors.
 *  Persists max → variant.customerPicksCount and min → packingConfig.pickMin
 *  (debounced). Warns when max exceeds the pool or min > max. */
function PickNConfig({ draftId, packing, flavorCount }: { draftId: string | null; packing: PackingInit; flavorCount: number }) {
  const [min, setMin] = useState(() => cfgNum(packing, 'pickMin', 1))
  const [max, setMax] = useState(packing?.customerPicksCount ?? 6)
  const M = flavorCount || 0
  const exceedsPool = M > 0 && max > M
  const minOverMax = min > max

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!draftId) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void savePacking(draftId, { customerPicksCount: max, packingConfig: { pickMin: min } })
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, draftId])

  return (
    <div className="addon">
      <div className="section-title"><span className="ic"><CheckSquare size={16} strokeWidth={2} /></span> Customer choice (pick-N)</div>
      <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="Min picks"><input className="input" type="number" min={1} value={min} onChange={(e) => setMin(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 90 }} /></Field>
        <Field label="Max picks"><input className="input" type="number" min={1} value={max} onChange={(e) => setMax(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 90 }} /></Field>
        <span className="hint" style={{ paddingBottom: 9 }}>Customer picks {min === max ? min : `${min}–${max}`} of {M || 'the'} available flavor{M === 1 ? '' : 's'}.</span>
      </div>
      {minOverMax && <div className="warn">⚠ Min picks ({min}) is greater than max picks ({max}) — the customer would have no valid choice. Lower the min or raise the max.</div>}
      {exceedsPool && <div className="warn">⚠ Max picks ({max}) is more than the {M} flavor{M === 1 ? '' : 's'} you’ve defined. Add more flavors or lower the max.</div>}
    </div>
  )
}
