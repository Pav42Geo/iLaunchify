'use client'

// PP-7 (UI) — the FULL print service builder, a 1:1 of design/print-service-builder-prototype.html.
// Six steps: Basics + rush · Presses (run bands + capability) · Formats/substrates/envelope/finished-
// format · Finishes & prepress + fees · Pricing (per-press curves + live check + tooling + order rules)
// · Review. Every field is wired to the PrintBuilderPayload (nothing decorative). The digital↔flexo
// crossover in the live check is an OUTPUT of the partner's own bands via @ilaunchify/orders/print-price,
// never a hardcoded threshold. MINIMUMS BELONG TO THE PRESS. Stepper chrome = the co-creation .stagebar.
// No em-dash anywhere.

import { useMemo, useState } from 'react'
import { segmentPriceCents, selectPrintProcess, printCrossoverQty, type PriceCurveSegment } from '@ilaunchify/orders/print-price'
import {
  savePrintBuilder,
  type PrintBuilderPayload,
  type PrintProcessKey,
  type PricingModeKey,
  type DeliveryFormatKey,
  type MinValueBasisKey,
  type OversPolicyKey,
  type DisclosureKey,
} from './actions'
import { inputCls, selectCls, F, Hero, CoCreationStepper, builderSteps } from '../builder-kit'

const PRINT_PROCESSES: PrintProcessKey[] = ['DIGITAL', 'FLEXO', 'OFFSET', 'GRAVURE', 'SCREEN', 'LETTERPRESS', 'LED_UV']
const PACKAGING_TYPES = ['PS label · roll', 'Shrink sleeve', 'Folding carton', 'Flexible pouch', 'Direct-print can', 'Tag / hangtag']
const DECORATION_METHODS = ['Pressure-sensitive', 'Shrink sleeve', 'Direct print', 'In-mould']
const SUBSTRATES = ['BOPP white', 'BOPP clear', 'Paper semi-gloss', 'Estate #8', 'PET', 'Direct thermal', 'Textured / felt']
const DELIVERY_FORMATS: { k: DeliveryFormatKey; label: string }[] = [
  { k: 'ROLL', label: 'Roll' },
  { k: 'SHEET', label: 'Sheet' },
  { k: 'FAN_FOLD', label: 'Fan-fold' },
]
const CORE_SIZES = ['1in', '3in']
const REWIND_DIRECTIONS = ['1', '2', '3', '4', '5', '6', '7', '8']
const PRICING_MODES: { k: PricingModeKey; label: string }[] = [
  { k: 'FLAT_PLUS_UNIT', label: 'Flat + per unit' },
  { k: 'PER_AREA', label: 'Per area' },
  { k: 'PER_OBJECT', label: 'Per object' },
  { k: 'PER_COLOR', label: 'Per color' },
  { k: 'TIERED', label: 'Tiered' },
]

export interface BandDraftUI {
  id: string
  baseQty: string
  basePrice: string // dollars
  incrementQty: string
  incrementPrice: string // dollars per increment
  maxQty: string
  quoteRequired: boolean
}
export interface PressDraftUI {
  id: string
  name: string
  process: PrintProcessKey
  maxWebWidthMm: string
  maxColors: string
  minRunPieces: string
  maxRunPieces: string
  whiteInk: boolean
  active: boolean
  bands: BandDraftUI[]
}
export interface FinishDraftUI {
  id: string
  name: string
  mode: PricingModeKey
  setup: string // dollars
  perUnit: string // dollars
  minQty: string
  maxCoverage: string // percent
  active: boolean
}

export interface PrintBuilderInitial {
  serviceId: string
  serviceName: string
  facilityId: string
  facilities: { id: string; name: string }[]
  disclosureLevel: DisclosureKey
  acceptingWork: boolean
  appliesLabels: boolean
  standardLeadDays: string
  rushLeadDays: string
  rushUpliftPct: string
  rushCapacityPerWeek: string
  packagingTypes: string[]
  decorationMethods: string[]
  substrates: string[]
  minPrintW: string
  minPrintH: string
  maxPrintW: string
  maxPrintH: string
  foodContactSafeInks: boolean
  deliveryFormats: DeliveryFormatKey[]
  coreSizes: string[]
  rewindDirections: string[]
  maxLabelsPerRoll: string
  maxRollDiameterMm: string
  splicesPerRoll: string
  fileFormat: string
  colourSpace: string
  maxSpotColours: string
  minDpi: string
  bleedMm: string
  totalInkCoveragePct: string
  artFixFee: string
  pantoneFee: string
  hardProofFee: string
  customDie: string
  plateChargePerColor: string
  repeatRunSetupWaived: boolean
  minOrderValue: string
  minValueBasis: MinValueBasisKey
  orderMultiple: string
  oversPolicy: OversPolicyKey
  additionalVersionFee: string
  priceValidUntil: string // yyyy-mm-dd or ''
  presses: PressDraftUI[]
  finishes: FinishDraftUI[]
}

// loose parsers (match the prototype's num())
const num = (s: string) => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0
const centsOf = (s: string) => Math.round(num(s) * 100)
const intOf = (s: string) => Math.round(num(s))
const fmt = (c: number) => '$' + (c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STAGES = ['Basics', 'Presses', 'Capability', 'Finishes', 'Pricing', 'Review'] as const

let SEQ = 0
const nid = (p: string) => `${p}-${SEQ++}-${Math.random().toString(36).slice(2, 6)}`
const blankBand = (): BandDraftUI => ({ id: nid('band'), baseQty: '', basePrice: '', incrementQty: '1', incrementPrice: '', maxQty: '', quoteRequired: false })
const blankPress = (process: PrintProcessKey): PressDraftUI => ({
  id: nid('press'), name: '', process, maxWebWidthMm: '', maxColors: '', minRunPieces: '', maxRunPieces: '', whiteInk: false, active: true, bands: [blankBand()],
})
const blankFinish = (): FinishDraftUI => ({ id: nid('fin'), name: '', mode: 'FLAT_PLUS_UNIT', setup: '', perUnit: '', minQty: '', maxCoverage: '', active: true })

export function PrintServiceBuilder({ initial }: { initial: PrintBuilderInitial }) {
  const [v, setV] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Step 1 — basics + rush
  const [serviceName, setServiceName] = useState(initial.serviceName)
  const [facilityId, setFacilityId] = useState(initial.facilityId)
  const [disclosure, setDisclosure] = useState<DisclosureKey>(initial.disclosureLevel)
  const [accepting, setAccepting] = useState(initial.acceptingWork)
  const [appliesLabels, setAppliesLabels] = useState(initial.appliesLabels)
  const [leadDays, setLeadDays] = useState(initial.standardLeadDays)
  const [rushLead, setRushLead] = useState(initial.rushLeadDays)
  const [rushUplift, setRushUplift] = useState(initial.rushUpliftPct)
  const [rushCap, setRushCap] = useState(initial.rushCapacityPerWeek)

  // Step 2/5 — presses (own their bands)
  const [presses, setPresses] = useState<PressDraftUI[]>(initial.presses.length > 0 ? initial.presses : [blankPress('DIGITAL'), blankPress('FLEXO')])

  // Step 3 — capability
  const [pkgTypes, setPkgTypes] = useState<string[]>(initial.packagingTypes)
  const [decoMethods, setDecoMethods] = useState<string[]>(initial.decorationMethods)
  const [subs, setSubs] = useState<string[]>(initial.substrates)
  const [minPW, setMinPW] = useState(initial.minPrintW)
  const [minPH, setMinPH] = useState(initial.minPrintH)
  const [maxPW, setMaxPW] = useState(initial.maxPrintW)
  const [maxPH, setMaxPH] = useState(initial.maxPrintH)
  const [foodInks, setFoodInks] = useState(initial.foodContactSafeInks)
  const [delivery, setDelivery] = useState<DeliveryFormatKey[]>(initial.deliveryFormats)
  const [cores, setCores] = useState<string[]>(initial.coreSizes)
  const [rewinds, setRewinds] = useState<string[]>(initial.rewindDirections)
  const [maxLabelsRoll, setMaxLabelsRoll] = useState(initial.maxLabelsPerRoll)
  const [maxRollDia, setMaxRollDia] = useState(initial.maxRollDiameterMm)
  const [splices, setSplices] = useState(initial.splicesPerRoll)

  // Step 4 — finishes + prepress
  const [finishes, setFinishes] = useState<FinishDraftUI[]>(initial.finishes)
  const [fileFormat, setFileFormat] = useState(initial.fileFormat)
  const [colourSpace, setColourSpace] = useState(initial.colourSpace)
  const [maxSpots, setMaxSpots] = useState(initial.maxSpotColours)
  const [minDpi, setMinDpi] = useState(initial.minDpi)
  const [bleed, setBleed] = useState(initial.bleedMm)
  const [totalInk, setTotalInk] = useState(initial.totalInkCoveragePct)
  const [artFix, setArtFix] = useState(initial.artFixFee)
  const [pantone, setPantone] = useState(initial.pantoneFee)
  const [hardProof, setHardProof] = useState(initial.hardProofFee)

  // Step 5 — tooling + order rules
  const [customDie, setCustomDie] = useState(initial.customDie)
  const [plateCharge, setPlateCharge] = useState(initial.plateChargePerColor)
  const [repeatWaived, setRepeatWaived] = useState(initial.repeatRunSetupWaived)
  const [minOrderValue, setMinOrderValue] = useState(initial.minOrderValue)
  const [minBasis, setMinBasis] = useState<MinValueBasisKey>(initial.minValueBasis)
  const [orderMultiple, setOrderMultiple] = useState(initial.orderMultiple)
  const [overs, setOvers] = useState<OversPolicyKey>(initial.oversPolicy)
  const [addlVersion, setAddlVersion] = useState(initial.additionalVersionFee)
  const [validUntil, setValidUntil] = useState(initial.priceValidUntil)

  const [q, setQ] = useState('15000')

  // press/band mutators
  const setPress = (id: string, patch: Partial<PressDraftUI>) => setPresses((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addPress = () => setPresses((rows) => [...rows, blankPress('OFFSET')])
  const removePress = (id: string) => setPresses((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows))
  const setBand = (pid: string, bid: string, patch: Partial<BandDraftUI>) =>
    setPresses((rows) => rows.map((p) => (p.id === pid ? { ...p, bands: p.bands.map((b) => (b.id === bid ? { ...b, ...patch } : b)) } : p)))
  const addBand = (pid: string) => setPresses((rows) => rows.map((p) => (p.id === pid ? { ...p, bands: [...p.bands, blankBand()] } : p)))
  const removeBand = (pid: string, bid: string) =>
    setPresses((rows) => rows.map((p) => (p.id === pid ? { ...p, bands: p.bands.length > 1 ? p.bands.filter((b) => b.id !== bid) : p.bands } : p)))

  const toggle = (arr: string[], setter: (a: string[]) => void, val: string) =>
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val])

  // finish mutators
  const setFinish = (id: string, patch: Partial<FinishDraftUI>) => setFinishes((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  // ── engine inputs: every active, parseable band, tagged by its press process ──
  const segments: (PriceCurveSegment & { id: string })[] = useMemo(
    () =>
      presses
        .filter((p) => p.active)
        .flatMap((p) =>
          p.bands
            .filter((b) => num(b.baseQty) > 0 && num(b.incrementQty) > 0)
            .map((b) => ({
              id: b.id,
              printProcess: p.process,
              baseQty: intOf(b.baseQty),
              basePriceCents: centsOf(b.basePrice),
              incrementQty: intOf(b.incrementQty),
              incrementPriceCents: centsOf(b.incrementPrice),
              maxQty: b.maxQty.trim() ? intOf(b.maxQty) : Number.MAX_SAFE_INTEGER,
              quoteRequired: b.quoteRequired,
            })),
        ),
    [presses],
  )
  const qN = intOf(q)
  const perSeg = segments.map((s) => ({ seg: s, cents: segmentPriceCents(s, qN) }))
  const winner = selectPrintProcess(segments, qN)
  const crossover = useMemo(() => {
    const sorted = [...perSeg].sort((a, b) => (a.cents ?? Infinity) - (b.cents ?? Infinity)).map((x) => x.seg)
    return sorted.length >= 2 ? printCrossoverQty(sorted[0]!, sorted[1]!) : null
  }, [perSeg])

  // completeness (Step 6)
  const hasPress = presses.some((p) => p.active && num(p.minRunPieces) > 0)
  const hasBands = segments.length > 0
  const hasSubs = subs.length > 0
  const hasFinishedFormat = delivery.length > 0 && cores.length > 0
  const hasPrepress = !!fileFormat.trim()

  function save() {
    setError(null)
    const payload: PrintBuilderPayload = {
      serviceName: serviceName.trim() || null,
      facilityId: facilityId || null,
      disclosureLevel: disclosure,
      acceptingWork: accepting,
      appliesLabels,
      packagingTypes: pkgTypes,
      decorationMethods: decoMethods,
      substrates: subs,
      standardLeadTimeDays: leadDays.trim() ? intOf(leadDays) : null,
      rushLeadTimeDays: rushLead.trim() ? intOf(rushLead) : null,
      rushUpliftBps: rushUplift.trim() ? Math.round(num(rushUplift) * 100) : null,
      rushCapacityPerWeek: rushCap.trim() ? intOf(rushCap) : null,
      minPrintWidthMm: minPW.trim() ? intOf(minPW) : null,
      minPrintHeightMm: minPH.trim() ? intOf(minPH) : null,
      maxPrintWidthMm: maxPW.trim() ? intOf(maxPW) : null,
      maxPrintHeightMm: maxPH.trim() ? intOf(maxPH) : null,
      foodContactSafeInks: foodInks,
      deliveryFormats: delivery,
      coreSizes: cores,
      rewindDirections: rewinds,
      maxLabelsPerRoll: maxLabelsRoll.trim() ? intOf(maxLabelsRoll) : null,
      maxRollDiameterMm: maxRollDia.trim() ? intOf(maxRollDia) : null,
      splicesPerRoll: splices.trim() ? intOf(splices) : null,
      fileFormat: fileFormat.trim() || null,
      colourSpace: colourSpace.trim() || null,
      maxSpotColours: maxSpots.trim() ? intOf(maxSpots) : null,
      minDpi: minDpi.trim() ? intOf(minDpi) : null,
      bleedMm: bleed.trim() ? intOf(bleed) : null,
      totalInkCoveragePct: totalInk.trim() ? intOf(totalInk) : null,
      artFixFeeCents: artFix.trim() ? centsOf(artFix) : null,
      pantoneMatchFeeCents: pantone.trim() ? centsOf(pantone) : null,
      hardProofFeeCents: hardProof.trim() ? centsOf(hardProof) : null,
      customDieCents: customDie.trim() ? centsOf(customDie) : null,
      plateChargePerColorCents: plateCharge.trim() ? centsOf(plateCharge) : null,
      repeatRunSetupWaived: repeatWaived,
      minOrderValueCents: minOrderValue.trim() ? centsOf(minOrderValue) : null,
      minValueBasis: minBasis,
      orderMultiple: orderMultiple.trim() ? intOf(orderMultiple) : null,
      oversPolicy: overs,
      additionalVersionFeeCents: addlVersion.trim() ? centsOf(addlVersion) : null,
      priceValidUntil: validUntil.trim() || null,
      presses: presses.map((p) => ({
        name: p.name.trim(),
        process: p.process,
        maxWebWidthMm: p.maxWebWidthMm.trim() ? intOf(p.maxWebWidthMm) : null,
        maxColors: p.maxColors.trim() ? intOf(p.maxColors) : null,
        minRunPieces: intOf(p.minRunPieces),
        maxRunPieces: p.maxRunPieces.trim() ? intOf(p.maxRunPieces) : null,
        whiteInk: p.whiteInk,
        active: p.active,
        bands: p.bands
          .filter((b) => num(b.baseQty) > 0)
          .map((b) => ({
            baseQty: intOf(b.baseQty),
            basePriceCents: centsOf(b.basePrice),
            incrementQty: intOf(b.incrementQty) || 1,
            incrementPriceCents: centsOf(b.incrementPrice),
            maxQty: b.maxQty.trim() ? intOf(b.maxQty) : null,
            quoteRequired: b.quoteRequired,
          })),
      })),
      finishes: finishes
        .filter((f) => f.name.trim())
        .map((f) => ({
          name: f.name.trim(),
          mode: f.mode,
          setupCents: f.setup.trim() ? centsOf(f.setup) : null,
          perUnitCents: f.perUnit.trim() ? centsOf(f.perUnit) : null,
          minQty: f.minQty.trim() ? intOf(f.minQty) : null,
          maxCoveragePct: f.maxCoverage.trim() ? intOf(f.maxCoverage) : null,
          active: f.active,
        })),
    }
    setPending(true)
    void savePrintBuilder(initial.serviceId, payload).then((res) => {
      setPending(false)
      if (res.ok) setSaved(true)
      else setError(res.error)
    })
  }

  return (
    <>
      {/* Co-creation stepper — full-bleed, hugging the sidebar, right under the header. */}
      <CoCreationStepper className="col-span-full -mt-6 mb-s-5" steps={builderSteps(STAGES, v)} onStepClick={setV} />
      <div className="pb-24">
        <a href="/services" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 transition hover:text-ink-900">
          <span aria-hidden="true">←</span> Back to services
        </a>

      <div>
        {/* STEP 1 — BASICS + RUSH */}
        {v === 0 && (
          <Hero eyebrow="Step 1 of 6" title="Service basics" desc="Who you are as a print provider. This is what creators see on your card and what routing uses to find you.">
            <Card title="Identity" sub="Your print service is separate from your company profile. One company can run several services.">
              <div className="grid gap-[14px] sm:grid-cols-2">
                <F label="Service name" hint="Shown on provider cards."><input className={inputCls} value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Narrow-web label printing" /></F>
                <F label="Facility" hint="Drives freight distance in routing.">
                  <select className={selectCls} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                    <option value="">Select a facility</option>
                    {initial.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </F>
              </div>
              <div className="mt-3.5 grid gap-[14px] sm:grid-cols-3">
                <F label="Standard lead time" hint="Business days, ex-proof."><input className={inputCls} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} placeholder="10" /></F>
                <F label="Disclosure" hint="Printers keep PDP provider cards.">
                  <select className={selectCls} value={disclosure} onChange={(e) => setDisclosure(e.target.value as DisclosureKey)}>
                    <option value="ANONYMOUS">Anonymous</option>
                    <option value="CITY_STATE">City &amp; state</option>
                    <option value="FULL">Full &quot;Printed by&quot;</option>
                  </select>
                </F>
                <F label="Accepting work">
                  <select className={selectCls} value={accepting ? 'open' : 'paused'} onChange={(e) => setAccepting(e.target.value === 'open')}>
                    <option value="open">Open to rotation</option>
                    <option value="paused">Paused</option>
                  </select>
                </F>
              </div>
              <div className="mt-3.5 max-w-xs">
                <F label="We apply labels in-house" hint="No separate application leg after printing.">
                  <select className={selectCls} value={appliesLabels ? 'yes' : 'no'} onChange={(e) => setAppliesLabels(e.target.value === 'yes')}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </F>
              </div>
              <Callout tone="info"><b>Rotation eligibility is computed, not claimed.</b> You enter the pool when your declarations below actually match a job (packaging type, decoration, substrate, run size, inks). Admin can restrict, never inflate.</Callout>
            </Card>
            <Card title="Speed & expediting" tag="New" sub="Rush is one of the most reliable margin lines in print, and today you have no way to charge for it.">
              <div className="grid gap-[14px] sm:grid-cols-3">
                <F label="Rush lead time" hint="Business days."><input className={inputCls} value={rushLead} onChange={(e) => setRushLead(e.target.value)} placeholder="4" /></F>
                <F label="Rush uplift %" hint="Applied to the print subtotal."><input className={inputCls} value={rushUplift} onChange={(e) => setRushUplift(e.target.value)} placeholder="30" /></F>
                <F label="Rush capacity / week" hint="Jobs. Prevents overselling."><input className={inputCls} value={rushCap} onChange={(e) => setRushCap(e.target.value)} placeholder="6" /></F>
              </div>
            </Card>
          </Hero>
        )}

        {/* STEP 2 — PRESSES */}
        {v === 1 && (
          <Hero eyebrow="Step 2 of 6" title="Your presses" desc="Minimums belong to the press, not to you. Declare each press and the run band it serves, and one shop can take a 100-unit job and a 50,000-unit job.">
            <Card title="Presses on your floor" tag="New" sub="Most converters run digital alongside flexo, routing each job by run length. A single MOQ per shop cannot express that.">
              {presses.map((p) => (
                <div key={p.id} className={`mb-2.5 rounded-xl border px-4 py-3.5 ${p.active ? 'border-pink-200 bg-white shadow-[0_0_0_3px_rgba(255,46,99,0.07)]' : 'border-ink-200 bg-ink-50'}`}>
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <button type="button" onClick={() => setPress(p.id, { active: !p.active })} aria-label="Toggle press" className={`relative h-[22px] w-[38px] flex-none rounded-pill transition ${p.active ? 'bg-pink-500' : 'bg-ink-300'}`}>
                      <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${p.active ? 'left-[19px]' : 'left-[3px]'}`} />
                    </button>
                    <input className="flex-1 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold" value={p.name} onChange={(e) => setPress(p.id, { name: e.target.value })} placeholder="Digital (HP Indigo 6900)" />
                    {presses.length > 1 && <button type="button" onClick={() => removePress(p.id)} className="text-[11.5px] font-semibold text-danger-500 hover:underline">Remove</button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <F label="Process">
                      <select className={selectCls} value={p.process} onChange={(e) => setPress(p.id, { process: e.target.value as PrintProcessKey })}>
                        {PRINT_PROCESSES.map((pp) => <option key={pp} value={pp}>{pp.charAt(0) + pp.slice(1).toLowerCase().replace('_', ' ')}</option>)}
                      </select>
                    </F>
                    <F label="Max web width (mm)"><input className={inputCls} value={p.maxWebWidthMm} onChange={(e) => setPress(p.id, { maxWebWidthMm: e.target.value })} placeholder="330" /></F>
                    <F label="Max colors"><input className={inputCls} value={p.maxColors} onChange={(e) => setPress(p.id, { maxColors: e.target.value })} placeholder="7" /></F>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <F label="Min run (pieces)" hint="Your true floor on this press."><input className={inputCls} value={p.minRunPieces} onChange={(e) => setPress(p.id, { minRunPieces: e.target.value })} placeholder="100" /></F>
                    <F label="Max run (pieces)" hint="Beyond this it stops paying."><input className={inputCls} value={p.maxRunPieces} onChange={(e) => setPress(p.id, { maxRunPieces: e.target.value })} placeholder="20000" /></F>
                    <F label="White ink" hint="Needed for clear substrates.">
                      <select className={selectCls} value={p.whiteInk ? 'yes' : 'no'} onChange={(e) => setPress(p.id, { whiteInk: e.target.value === 'yes' })}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </F>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addPress} className="mt-1 rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">+ Add a press</button>
              <Callout tone={presses.filter((p) => p.active).length >= 2 ? 'ok' : 'info'}>
                {presses.filter((p) => p.active).length >= 2
                  ? <><b>With two presses declared you now serve your full run band.</b> The engine picks the press per job and the crossover falls out of your own pricing (Step 5). We never hardcode &quot;under 5k = digital&quot;.</>
                  : <>Declare a second press (e.g. flexo for long runs) and one service will serve both short and long runs.</>}
              </Callout>
            </Card>
          </Hero>
        )}

        {/* STEP 3 — CAPABILITY */}
        {v === 2 && (
          <Hero eyebrow="Step 3 of 6" title="What you can print" desc="The hard filters. A job that fails any of these never reaches you, and no rating or price can rescue it.">
            <Card title="Formats & decoration" sub="Only physically valid combinations are selectable.">
              <F label="Packaging types"><Chips options={PACKAGING_TYPES} value={pkgTypes} onToggle={(x) => toggle(pkgTypes, setPkgTypes, x)} /></F>
              <div className="mt-3"><F label="Decoration methods"><Chips options={DECORATION_METHODS} value={decoMethods} onToggle={(x) => toggle(decoMethods, setDecoMethods, x)} /></F></div>
            </Card>
            <Card title="Substrates" tag="New" sub="A BOPP-only shop should never be handed a paper job.">
              <Chips options={SUBSTRATES} value={subs} onToggle={(x) => toggle(subs, setSubs, x)} />
            </Card>
            <Card title="Print envelope & compliance">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <F label="Min print W (mm)"><input className={inputCls} value={minPW} onChange={(e) => setMinPW(e.target.value)} placeholder="12" /></F>
                <F label="Min print H (mm)"><input className={inputCls} value={minPH} onChange={(e) => setMinPH(e.target.value)} placeholder="12" /></F>
                <F label="Max print W (mm)" hint="The die-line must fit the press."><input className={inputCls} value={maxPW} onChange={(e) => setMaxPW(e.target.value)} placeholder="320" /></F>
                <F label="Max print H (mm)"><input className={inputCls} value={maxPH} onChange={(e) => setMaxPH(e.target.value)} placeholder="450" /></F>
              </div>
              <div className="mt-3 max-w-xs">
                <F label="Food-contact safe inks" hint="HARD gate. Never overridable.">
                  <select className={selectCls} value={foodInks ? 'yes' : 'no'} onChange={(e) => setFoodInks(e.target.value === 'yes')}>
                    <option value="yes">Yes: low-migration</option>
                    <option value="no">No</option>
                  </select>
                </F>
              </div>
            </Card>
            <Card title="Finished format" tag="New" sub="A real minimum driver: two shops with the same piece-MOQ are not interchangeable if one cannot wind a 3in core.">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Delivery format"><Chips options={DELIVERY_FORMATS.map((d) => d.label)} value={delivery.map((k) => DELIVERY_FORMATS.find((d) => d.k === k)!.label)} onToggle={(label) => {
                  const k = DELIVERY_FORMATS.find((d) => d.label === label)!.k
                  setDelivery(delivery.includes(k) ? delivery.filter((x) => x !== k) : [...delivery, k])
                }} /></F>
                <F label="Core sizes"><Chips options={CORE_SIZES} value={cores} onToggle={(x) => toggle(cores, setCores, x)} /></F>
                <F label="Rewind directions"><Chips options={REWIND_DIRECTIONS} value={rewinds} onToggle={(x) => toggle(rewinds, setRewinds, x)} /></F>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <F label="Max labels / roll"><input className={inputCls} value={maxLabelsRoll} onChange={(e) => setMaxLabelsRoll(e.target.value)} placeholder="2500" /></F>
                <F label="Max roll diameter (mm)"><input className={inputCls} value={maxRollDia} onChange={(e) => setMaxRollDia(e.target.value)} placeholder="300" /></F>
                <F label="Splices allowed / roll"><input className={inputCls} value={splices} onChange={(e) => setSplices(e.target.value)} placeholder="1" /></F>
              </div>
            </Card>
          </Hero>
        )}

        {/* STEP 4 — FINISHES + PREPRESS */}
        {v === 3 && (
          <Hero eyebrow="Step 4 of 6" title="Finishes & prepress" desc="Your premium lines. Each finish is both a capability (a job needing foil only routes to foil shops) and a price line.">
            <Card title="Finishes you offer" tag="New">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-500">
                      <th className="pb-2 pr-2">Finish</th><th className="pb-2 pr-2">Pricing mode</th><th className="pb-2 pr-2">Setup</th><th className="pb-2 pr-2">Per unit</th><th className="pb-2 pr-2">Min qty</th><th className="pb-2 pr-2">Max coverage %</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {finishes.map((f) => (
                      <tr key={f.id} className="border-t border-ink-100">
                        <td className="py-1.5 pr-2"><input className="h-[34px] w-[140px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={f.name} onChange={(e) => setFinish(f.id, { name: e.target.value })} placeholder="Foil stamp: gold" /></td>
                        <td className="py-1.5 pr-2"><select className="h-[34px] w-[130px] rounded-md border border-ink-300 px-1 text-[12px]" value={f.mode} onChange={(e) => setFinish(f.id, { mode: e.target.value as PricingModeKey })}>{PRICING_MODES.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}</select></td>
                        <td className="py-1.5 pr-2"><input className="h-[34px] w-[80px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={f.setup} onChange={(e) => setFinish(f.id, { setup: e.target.value })} placeholder="$185" /></td>
                        <td className="py-1.5 pr-2"><input className="h-[34px] w-[80px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={f.perUnit} onChange={(e) => setFinish(f.id, { perUnit: e.target.value })} placeholder="$0.06" /></td>
                        <td className="py-1.5 pr-2"><input className="h-[34px] w-[70px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={f.minQty} onChange={(e) => setFinish(f.id, { minQty: e.target.value })} placeholder="1000" /></td>
                        <td className="py-1.5 pr-2"><input className="h-[34px] w-[70px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={f.maxCoverage} onChange={(e) => setFinish(f.id, { maxCoverage: e.target.value })} placeholder="30" /></td>
                        <td className="py-1.5"><button type="button" onClick={() => setFinishes((r) => r.filter((x) => x.id !== f.id))} className="text-[11px] font-semibold text-danger-500 hover:underline">Remove</button></td>
                      </tr>
                    ))}
                    {finishes.length === 0 && <tr><td colSpan={7} className="py-3 text-[12px] text-ink-400">No finishes yet. Add foil, spot UV, emboss and the like, each becomes a routable capability + price line.</td></tr>}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setFinishes((r) => [...r, blankFinish()])} className="mt-2.5 rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">+ Add finish</button>
            </Card>
            <Card title="Prepress & colour rules">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="File format"><select className={selectCls} value={fileFormat} onChange={(e) => setFileFormat(e.target.value)}><option value="">Select</option><option value="PDF/X-4">PDF/X-4</option><option value="PDF/X-1a">PDF/X-1a</option></select></F>
                <F label="Colour space"><select className={selectCls} value={colourSpace} onChange={(e) => setColourSpace(e.target.value)}><option value="">Select</option><option value="CMYK">CMYK</option><option value="CMYK + spot">CMYK + spot</option></select></F>
                <F label="Max spot colours" hint="&quot;Accepts spots&quot; alone is too coarse."><input className={inputCls} value={maxSpots} onChange={(e) => setMaxSpots(e.target.value)} placeholder="3" /></F>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <F label="Min DPI"><input className={inputCls} value={minDpi} onChange={(e) => setMinDpi(e.target.value)} placeholder="300" /></F>
                <F label="Bleed (mm)"><input className={inputCls} value={bleed} onChange={(e) => setBleed(e.target.value)} placeholder="3" /></F>
                <F label="Total ink coverage %"><input className={inputCls} value={totalInk} onChange={(e) => setTotalInk(e.target.value)} placeholder="300" /></F>
              </div>
            </Card>
            <Card title="Prepress & proofing fees" tag="New" sub="Real converters bill for art fixing, colour matching and hard proofs.">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Art / file-fix fee" hint="Per job, when files fail preflight."><input className={inputCls} value={artFix} onChange={(e) => setArtFix(e.target.value)} placeholder="$75" /></F>
                <F label="Pantone match fee" hint="Per spot colour matched."><input className={inputCls} value={pantone} onChange={(e) => setPantone(e.target.value)} placeholder="$45" /></F>
                <F label="Hard proof" hint="Soft proof free; press proof by quote."><input className={inputCls} value={hardProof} onChange={(e) => setHardProof(e.target.value)} placeholder="$60" /></F>
              </div>
            </Card>
          </Hero>
        )}

        {/* STEP 5 — PRICING */}
        {v === 4 && (
          <Hero eyebrow="Step 5 of 6 · the money" title="Pricing" desc="One price curve per press. Setup and plates are amortised into the anchor price, exactly like a real quote. The crossover is then an output of your own numbers, never a rule we impose.">
            {presses.filter((p) => p.active).map((p) => (
              <Card key={p.id} title={`Price curve: ${p.name || p.process}`} tag={p.process}>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-500">
                        <th className="pb-2 pr-2">From qty</th><th className="pb-2 pr-2">Price at that qty</th><th className="pb-2 pr-2">Each additional</th><th className="pb-2 pr-2">Costs</th><th className="pb-2 pr-2">Up to</th><th className="pb-2 pr-2">Quote only</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {p.bands.map((b) => (
                        <tr key={b.id} className="border-t border-ink-100">
                          <td className="py-1.5 pr-2"><input className="h-[34px] w-[80px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={b.baseQty} onChange={(e) => setBand(p.id, b.id, { baseQty: e.target.value })} placeholder="100" /></td>
                          <td className="py-1.5 pr-2"><input className="h-[34px] w-[100px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={b.basePrice} onChange={(e) => setBand(p.id, b.id, { basePrice: e.target.value })} placeholder="$45.00" /></td>
                          <td className="py-1.5 pr-2"><input className="h-[34px] w-[70px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={b.incrementQty} onChange={(e) => setBand(p.id, b.id, { incrementQty: e.target.value })} placeholder="1" /></td>
                          <td className="py-1.5 pr-2"><input className="h-[34px] w-[90px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={b.incrementPrice} onChange={(e) => setBand(p.id, b.id, { incrementPrice: e.target.value })} placeholder="$0.35" /></td>
                          <td className="py-1.5 pr-2"><input className="h-[34px] w-[90px] rounded-md border border-ink-300 px-2 text-[12.5px]" value={b.maxQty} onChange={(e) => setBand(p.id, b.id, { maxQty: e.target.value })} placeholder="20000" /></td>
                          <td className="py-1.5 pr-2 text-center"><input type="checkbox" checked={b.quoteRequired} onChange={(e) => setBand(p.id, b.id, { quoteRequired: e.target.checked })} /></td>
                          <td className="py-1.5">{p.bands.length > 1 && <button type="button" onClick={() => removeBand(p.id, b.id)} className="text-[11px] font-semibold text-danger-500 hover:underline">Remove</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={() => addBand(p.id)} className="mt-2 rounded-pill border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-pink-500 hover:text-pink-700">+ Add band</button>
              </Card>
            ))}

            {/* live check */}
            <div className="mb-3.5 rounded-2xl border border-ink-800 bg-ink-900 p-5">
              <h3 className="font-display text-[15px] font-bold text-white">Live check <span className="ml-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-neon-500">what routing will actually do</span></h3>
              <p className="mt-1 text-[12.5px] text-ink-400">Type a quantity. This runs the same maths the engine runs.</p>
              <div className="mt-3 mb-3.5 flex flex-wrap items-end gap-3">
                <label className="block"><span className="mb-[5px] block text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">Order quantity (pieces)</span><input className="h-[38px] w-[150px] rounded-md border border-ink-700 bg-ink-800 px-[11px] font-semibold text-white focus:border-neon-500 focus:outline-none" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                <span className="self-center pb-1 text-[12px] text-ink-400">try 500 · 5,000 · 15,000 · 50,000</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {perSeg.map(({ seg, cents }) => {
                  const win = winner?.segment.printProcess === seg.printProcess && winner?.cents === cents
                  return (
                    <div key={seg.id} className={`rounded-xl border p-3 ${win ? 'border-neon-500 bg-neon-500/10' : cents == null ? 'border-ink-700 bg-ink-800 opacity-45' : 'border-ink-700 bg-ink-800'}`}>
                      <div className={`text-[11px] font-bold uppercase tracking-[0.05em] ${win ? 'text-neon-500' : 'text-ink-400'}`}>{seg.printProcess}</div>
                      <div className="mt-1 font-display text-[20px] font-extrabold text-white">{cents == null ? '—' : fmt(cents)}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-400">{cents == null ? 'out of range / off-lattice' : `${fmt(cents / Math.max(1, qN))} / piece`}</div>
                    </div>
                  )
                })}
                {perSeg.length === 0 && <div className="text-[12.5px] text-ink-400">Add a price band above to see the live check.</div>}
              </div>
              <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-[11px] text-[12.5px] text-ink-300">
                {segments.length < 2
                  ? 'Add a second press band to see your crossover.'
                  : crossover && crossover > 0
                    ? <>Your crossover is <b className="text-neon-500">{crossover.toLocaleString()} pieces</b>. Below it the low-setup press wins; above it the low-per-piece press does. You did not set that number: it fell out of your own curves.</>
                    : 'Only one press is feasible at this quantity, so there is no contest to resolve.'}
                {winner?.segment.quoteRequired && <> The winning curve is indicative, so this routes to a quote.</>}
              </div>
            </div>

            <Card title="Tooling & repeat runs" tag="New" sub="Plates and dies are made once and kept. Charging a repeat customer full setup again is wrong; not charging it on run one is a loss.">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Custom die / tooling" hint="One-time per shape. Reused on repeats."><input className={inputCls} value={customDie} onChange={(e) => setCustomDie(e.target.value)} placeholder="$450" /></F>
                <F label="Plate charge / colour" hint="Flexo. One-time per artwork."><input className={inputCls} value={plateCharge} onChange={(e) => setPlateCharge(e.target.value)} placeholder="$95" /></F>
                <F label="Repeat-run setup" hint="Same artwork, plates exist.">
                  <select className={selectCls} value={repeatWaived ? 'waived' : 'charged'} onChange={(e) => setRepeatWaived(e.target.value === 'waived')}>
                    <option value="waived">Setup waived</option>
                    <option value="charged">Setup re-charged</option>
                  </select>
                </F>
              </div>
            </Card>
            <Card title="Order rules" tag="New">
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Minimum order value" hint="Binds independently of piece count."><input className={inputCls} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} placeholder="$200" /></F>
                <F label="Minimum is per…" hint="A 6-flavour pack is 6 designs.">
                  <select className={selectCls} value={minBasis} onChange={(e) => setMinBasis(e.target.value as MinValueBasisKey)}>
                    <option value="PER_DESIGN">Design / version</option>
                    <option value="PER_ORDER">Order</option>
                  </select>
                </F>
                <F label="Order in multiples of" hint="Quantities are a lattice, not a range."><input className={inputCls} value={orderMultiple} onChange={(e) => setOrderMultiple(e.target.value)} placeholder="100" /></F>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <F label="Overs / unders policy" hint="The industry norm.">
                  <select className={selectCls} value={overs} onChange={(e) => setOvers(e.target.value as OversPolicyKey)}>
                    <option value="TOLERANCE_BILL_ACTUAL">±10%, bill actual shipped</option>
                    <option value="EXACT">Exact quantity</option>
                  </select>
                </F>
                <F label="Additional version / SKU" hint="Per extra design in the run."><input className={inputCls} value={addlVersion} onChange={(e) => setAddlVersion(e.target.value)} placeholder="$28" /></F>
                <F label="Price valid until" hint="Raise prices without rewriting history."><input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></F>
              </div>
            </Card>
          </Hero>
        )}

        {/* STEP 6 — REVIEW */}
        {v === 5 && (
          <Hero eyebrow="Step 6 of 6" title="Review & publish" desc="What you unlock the moment this goes live. Incomplete capability = not listable, same gate discipline as verification.">
            <Card title="Completeness">
              <Row good={hasPress} label="At least one press with a run band" help={presses.filter((p) => p.active && num(p.minRunPieces) > 0).map((p) => `${p.process} ${intOf(p.minRunPieces).toLocaleString()}${p.maxRunPieces.trim() ? `–${intOf(p.maxRunPieces).toLocaleString()}` : '+'}`).join(' · ') || 'none set'} />
              <Row good={hasBands} label="A price curve per press" help={`${segments.length} band${segments.length === 1 ? '' : 's'} priced. Routing prices your leg from these.`} />
              <Row good={hasSubs} label="Substrates declared" help={`${subs.length} selected`} />
              <Row good={hasFinishedFormat} label="Finished format (core / rewind)" help={hasFinishedFormat ? `${delivery.join(', ')} · cores ${cores.join(', ')}` : 'Not set: some jobs will skip you'} />
              <Row good={hasPrepress} label="Prepress spec + food-contact" help={hasPrepress ? `${fileFormat} · ${foodInks ? 'low-migration inks' : 'no food-contact inks'}` : 'file format not set'} />
              <Callout tone="warn"><b>Incomplete capability = not listable.</b> Half-declared services quietly lose jobs instead of failing loudly.</Callout>
            </Card>
            <Card title="What this unlocks">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Presses declared" value={String(presses.filter((p) => p.active).length)} sub="each serves a run band" />
                <Stat label="Run band covered" value={coverageLabel(presses)} sub="min → max across your presses" />
                <Stat label="Finishes offered" value={String(finishes.filter((f) => f.name.trim()).length)} sub="each a routable capability" />
              </div>
              <Callout tone="ok"><b>Coverage is the point.</b> A product with zero capable printers cannot publish and fires a capability request. Your declarations here are literally what unblocks creators.</Callout>
            </Card>
            <p className="mt-1 px-1 text-[12px] leading-[1.6] text-ink-500">Saving persists everything above once the PP-7 schema is db:pushed. Wiring the evaluator into the live charge/payout (replacing the interim print anchor) is the follow-up PP-1 step.</p>
          </Hero>
        )}
      </div>

      {/* save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[72rem] items-center gap-3 px-6">
          <span className="text-[12.5px] font-semibold text-ink-500">{pending ? 'Saving…' : saved ? 'Saved' : error ? '' : 'Draft not yet saved'}</span>
          {error && <span className="text-[12px] font-semibold text-danger-500">{error}</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => setV((x) => Math.max(0, x - 1))} disabled={v === 0} className="rounded-pill border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-40">Back</button>
          <button type="button" onClick={save} disabled={pending} className="rounded-pill bg-pink-500 px-5 py-2 text-[12.5px] font-bold text-white hover:bg-pink-600 disabled:opacity-40">{v === STAGES.length - 1 ? 'Save & finish' : 'Save'}</button>
        </div>
      </div>
    </div>
    </>
  )
}

function coverageLabel(presses: PressDraftUI[]): string {
  const active = presses.filter((p) => p.active && num(p.minRunPieces) > 0)
  if (active.length === 0) return '—'
  const min = Math.min(...active.map((p) => intOf(p.minRunPieces)))
  const maxes = active.map((p) => (p.maxRunPieces.trim() ? intOf(p.maxRunPieces) : Infinity))
  const max = Math.max(...maxes)
  return `${min.toLocaleString()} – ${max === Infinity ? '∞' : max.toLocaleString()}`
}

function Card({ title, sub, tag, children }: { title: string; sub?: string; tag?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 rounded-2xl border border-ink-200 bg-white px-5 py-[18px]">
      <h2 className="flex items-center gap-2 font-display text-[15.5px] font-bold text-ink-900">
        {title}
        {tag && <span className="rounded-pill bg-pink-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-pink-700">{tag}</span>}
      </h2>
      {sub && <p className="mt-1 mb-3 text-[12.5px] text-ink-500">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  )
}
function Chips({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button key={o} type="button" onClick={() => onToggle(o)} className={`rounded-pill border px-3 py-1.5 text-[12px] font-semibold transition ${on ? 'border-pink-500 bg-pink-500/10 text-pink-700' : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400'}`}>{o}</button>
        )
      })}
    </div>
  )
}
function Callout({ tone, children }: { tone: 'info' | 'ok' | 'warn'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'border-success-200 bg-success-50 text-success-800' : tone === 'warn' ? 'border-warn-200 bg-warn-50 text-warn-800' : 'border-ink-200 bg-ink-50 text-ink-600'
  const ic = tone === 'ok' ? '✓' : tone === 'warn' ? '!' : 'i'
  return (
    <div className={`mt-3 flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12px] leading-[1.55] ${cls}`}>
      <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-white/70 text-[11px] font-extrabold">{ic}</span>
      <div>{children}</div>
    </div>
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
function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-500">{label}</div>
      <div className="mt-1 font-display text-[24px] font-extrabold text-ink-900">{value}</div>
      <div className="text-[11.5px] text-ink-500">{sub}</div>
    </div>
  )
}
