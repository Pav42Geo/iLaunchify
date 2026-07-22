'use client'

// Creator Design Studio — "Product" details panel (docs/CREATOR_PRODUCT_DETAILS_DRAWER.md).
// Layout (Pavel 2026-07-04): fixed identity header (image · name · quantity · "Details" → tabbed
// modal), foldable Cost summary, foldable Print spec (real print detail, no safe-area diagram).
// Surfaces render OUTSIDE this component (non-foldable, by the parent). Self-contained: no canvas
// hot-file internals imported.

import * as React from 'react'
import { ChevronDown, FileDown, Box, X, Minus, Plus, Loader2 } from 'lucide-react'
import { generateBlankPdfSpec, generateBlankSvgSpec, mmToInchesStr, formatCents, type DieCutSpec } from '@ilaunchify/ui'
import { estimateStudioSubtotal, type StudioEstimate } from '../cost-estimate-actions'

export interface CostTier {
  qtyRange: string // "500–999" | "1,000+"
  perUnit: string // "$5.35"
  leadTimeDays: number | null
  fulfillment: string // "Bulk" | "On-demand"
}

// ---- "Product picture" — the full order picture shown in the Details modal ----
// docs/CREATOR_PRODUCT_PICTURE_MODAL.md. Facts panels are passed PRE-RENDERED (ReactNode) by the shell
// (which owns the data + domain→renderer mapping), so this component stays layout-only + decoupled.
export interface PictureIngredient {
  name: string
  weightG?: number | null
  /** ProductIngredientSource — e.g. FLAVOR_EXTRA / TEMPLATE_REPLACEMENT. */
  source?: string | null
}
export interface PictureRecipe {
  servingSize?: string | null
  servings?: number | null
  ingredients: PictureIngredient[]
}
export interface PictureFlavor {
  flavorPresetId: string
  name: string
  swatchHex: string | null
  statementOfIdentity: string | null
  hasLabel?: boolean
  recipe?: PictureRecipe | null
  /** Rendered Facts panel for this flavor (single column). */
  factsPanel?: React.ReactNode
}
export interface ProductPicture {
  topology: 'SINGLE' | 'AGGREGATE' | 'PER_FLAVOR'
  /** Single-product recipe (null for multi-flavor). */
  recipe?: PictureRecipe | null
  /** Single-product Facts panel (rendered). */
  factsPanel?: React.ReactNode
  /** Multi-column aggregate/variety Facts panel (rendered), for AGGREGATE packs. */
  aggregateFactsPanel?: React.ReactNode
  /** The creator's SELECTED flavors. */
  flavors?: PictureFlavor[]
  /** Pack composition — units per flavor. */
  packComposition?: Array<{ flavorPresetId: string; name: string; units: number }> | null
  finishes?: Array<{ name: string; category?: string | null }>
  mandatoryPhrases?: Array<{ title: string; body?: string | null }>
  claims?: string[]
}

export interface ProductDetailsData {
  /** Enables the live Cost summary estimator (null in template-author mode,
   *  where there is no real product to price). */
  productId?: string | null
  productName: string
  thumbnailUrl?: string | null
  /** Header quantity line, e.g. "MOQ 500 units". Null hides it. */
  quantityLabel?: string | null
  // ---- rich info shown in the "Details" modal ----
  category: string | null
  domain: string // LabelingType
  brandName: string | null
  manufacturerName: string | null
  netQuantity: string | null
  allergens: string[]
  bioengineered?: boolean
  retail?: { gtin: string | null; internalSku: string | null; barcodeMode: string } | null
  moq?: number | null
  leadTimeDays?: number | null
  fulfillment?: string | null
  /** Earned certificates — shown as thumbnails under the product name. */
  certs?: { name: string; badgeUrl: string | null }[]
  // ---- Cost summary ----
  cost?: { low: string; high: string; single: boolean; tiers: CostTier[] } | null
  // ---- Packaging (container the product ships in) ----
  packaging?: { container: string; category: string | null; fragility: string | null; dimensions: string | null; format: string | null } | null
  // ---- The full order picture (recipes + rendered Facts labels + per-flavor tabs) ----
  picture?: ProductPicture | null
  // ---- Print spec ----
  dieCut: DieCutSpec
}

const DOMAIN_LABEL: Record<string, string> = {
  FOOD: 'Food', DIETARY_SUPPLEMENT: 'Supplement', PET_PRODUCT: 'Pet', OTC: 'OTC drug', COSMETIC: 'Cosmetic',
}
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const dpiPx = (mm: number) => Math.round((mm / 25.4) * 300)

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product'
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ProductDetailsDrawer({ data }: { data: ProductDetailsData }) {
  const [openSection, setOpenSection] = React.useState<'cost' | 'packaging' | 'spec' | null>('cost')
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const toggle = (k: 'cost' | 'packaging' | 'spec') => setOpenSection((cur) => (cur === k ? null : k))

  const costHeaderRight = data.cost
    ? data.cost.single
      ? data.cost.low
      : `${data.cost.low} – ${data.cost.high}`
    : null

  return (
    <div className="space-y-3">
      {/* Fixed identity header */}
      <section className="rounded-xl border border-ink-200 bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
            {data.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.thumbnailUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Box className="h-6 w-6 text-ink-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-semibold text-ink-900" title={data.productName}>{data.productName}</h3>
            {data.quantityLabel && <p className="mt-0.5 text-[12px] text-ink-500">{data.quantityLabel}</p>}
            {data.certs && data.certs.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5" title="Certificates earned by this product">
                {data.certs.map((c, i) =>
                  c.badgeUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={c.badgeUrl} alt={c.name} title={c.name} className="h-7 w-7 rounded border border-ink-100 bg-white object-contain p-0.5" />
                  ) : (
                    <span key={i} title={c.name} className="inline-flex h-7 items-center rounded-full bg-ink-100 px-2 text-[10px] font-semibold text-ink-600">{c.name}</span>
                  ),
                )}
              </div>
            )}
            <button
              onClick={() => setDetailsOpen(true)}
              className="mt-1.5 inline-flex items-center rounded-full border border-ink-300 px-3 py-1 text-[12px] font-semibold text-ink-700 hover:border-ink-500"
            >
              Details
            </button>
          </div>
        </div>
      </section>

      {/* Cost summary */}
      <Accordion
        title="Cost summary"
        right={costHeaderRight}
        open={openSection === 'cost'}
        onToggle={() => toggle('cost')}
      >
        {!data.cost ? (
          <p className="text-[12px] text-ink-500">Pricing isn&apos;t set for this product yet.</p>
        ) : data.productId ? (
          <CostSummaryLive productId={data.productId} moq={data.moq ?? null} tiers={data.cost.tiers} />
        ) : (
          <>
            <BandTable tiers={data.cost.tiers} />
            <p className="mt-2 text-[11px] text-ink-400">Per-unit price by quantity, including our service. Final total is confirmed at checkout.</p>
          </>
        )}
      </Accordion>

      {/* Packaging (container) */}
      {data.packaging && (
        <Accordion title="Packaging" open={openSection === 'packaging'} onToggle={() => toggle('packaging')}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <Field k="Container" v={data.packaging.container} />
            <Field k="Format" v={data.packaging.format ?? '—'} />
            <Field k="Category" v={data.packaging.category ? pretty(data.packaging.category) : '—'} />
            <Field k="Fragility" v={data.packaging.fragility ? pretty(data.packaging.fragility) : '—'} />
            <Field k="Dimensions" v={data.packaging.dimensions ?? '—'} />
            {data.netQuantity && <Field k="Net quantity" v={data.netQuantity} />}
          </dl>
        </Accordion>
      )}

      {/* Print spec */}
      <Accordion title="Print spec" open={openSection === 'spec'} onToggle={() => toggle('spec')}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink-900">{data.dieCut.name}</p>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">{pretty(data.dieCut.category)}</span>
        </div>

        <table className="mt-3 w-full text-[11px] tabular-nums">
          <thead>
            <tr className="border-b border-ink-100 text-left text-ink-500">
              <th className="py-1.5 font-semibold"></th>
              <th className="py-1.5 font-semibold">Width</th>
              <th className="py-1.5 font-semibold">Height</th>
            </tr>
          </thead>
          <tbody className="text-ink-700">
            <SpecRow color="red" label="Bleed" wMm={data.dieCut.widthMm + 2 * data.dieCut.bleedMm} hMm={data.dieCut.heightMm + 2 * data.dieCut.bleedMm} />
            <SpecRow color="ink" label="Trim" wMm={data.dieCut.widthMm} hMm={data.dieCut.heightMm} />
            <SpecRow color="blue" label="Safe" wMm={Math.max(0, data.dieCut.widthMm - 2 * data.dieCut.safeAreaMm)} hMm={Math.max(0, data.dieCut.heightMm - 2 * data.dieCut.safeAreaMm)} />
          </tbody>
        </table>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <Field k="Print area @ 300 DPI" v={`${dpiPx(data.dieCut.widthMm)} × ${dpiPx(data.dieCut.heightMm)} px`} />
          <Field k="Resolution" v="300 DPI" />
          <Field k="Bleed" v={`${data.dieCut.bleedMm} mm`} />
          <Field k="Safe margin" v={`${data.dieCut.safeAreaMm} mm`} />
          <Field k="Color mode" v="CMYK" />
          <Field k="File" v="PDF / SVG · vector" />
        </dl>

        <p className="mt-2 text-[11px] leading-[1.5] text-ink-500">
          Extend artwork to the bleed line; keep text and logos inside the safe margin.
        </p>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => { try { downloadBlob(generateBlankSvgSpec(data.dieCut), `${slugify(data.dieCut.name)}-blank.svg`) } catch { /* noop */ } }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:border-ink-400"
          >
            <FileDown className="h-3.5 w-3.5" /> SVG template
          </button>
          <PdfDownloadButton dieCut={data.dieCut} />
        </div>
      </Accordion>

      {detailsOpen && <DetailsModal data={data} onClose={() => setDetailsOpen(false)} />}
    </div>
  )
}

// ── Cost summary — live all-in subtotal ──────────────────────────────────────
// HANDOFF-TO-CODE-studio-cost-summary-subtotal (Pavel 2026-07-21): the creator
// enters a quantity and sees what THEIR run costs, all in, instead of reading a
// rate card. Prices through estimateStudioSubtotal -> estimateProductionCost,
// the ONE pricer path (PP-0), over the creator's draft selections — so this
// number equals checkout Step 2's "before ship + tax" for the same quantity by
// construction. The all-in band table survives as a "Volume pricing" expander.

const FALLBACK_MOQ = 100 // checkout Step 2 parity (its OrderSettings floor fallback)
const DEFAULT_STEP = 50
const MAX_QTY = 100_000

function CostSummaryLive({
  productId,
  moq,
  tiers,
}: {
  productId: string
  moq: number | null
  tiers: CostTier[]
}) {
  const floor = moq ?? FALLBACK_MOQ
  // null = still seeding from the draft's saved quantity.
  const [qty, setQty] = React.useState<number | null>(null)
  const [estimate, setEstimate] = React.useState<StudioEstimate | null>(null)
  const [estimateError, setEstimateError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [bandsOpen, setBandsOpen] = React.useState(false)

  // Pack products step in whole packs (a partial pack is not orderable).
  const step = estimate?.isPack ? Math.max(1, estimate.unitsPerPack) : DEFAULT_STEP

  const clamp = (n: number) => (Number.isNaN(n) ? floor : Math.min(MAX_QTY, Math.max(floor, n)))

  // Seed from the draft's last checkout quantity when there is one; else MOQ.
  React.useEffect(() => {
    let cancelled = false
    estimateStudioSubtotal({ productId, quantity: null }).then((r) => {
      if (cancelled) return
      if (r.ok && r.data.quantity > 0) {
        setQty(r.data.quantity)
        setEstimate(r.data)
      } else {
        // No saved quantity (or a refusal the qty effect will re-surface).
        setQty(floor)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  // Debounced re-estimate on quantity change (220ms, same cadence as checkout).
  React.useEffect(() => {
    if (qty == null) return
    if (estimate && estimate.quantity === qty && !estimateError) return
    const id = setTimeout(() => {
      setBusy(true)
      estimateStudioSubtotal({ productId, quantity: qty }).then((r) => {
        setBusy(false)
        if (r.ok) {
          setEstimate(r.data)
          setEstimateError(null)
        } else {
          // Never keep a stale price on screen beside an error (checkout's
          // 2026-07-16 lesson: a refusal you cannot see is worse than the
          // wrong price it replaced).
          setEstimate(null)
          setEstimateError(r.error)
        }
      })
    }, 220)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, qty])

  return (
    <div>
      {/* Quantity stepper */}
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="studio-cost-qty" className="text-[11px] font-bold uppercase tracking-wide text-ink-700">
          {estimate?.isPack ? 'Quantity (units)' : 'Quantity'}
        </label>
        <div
          className="inline-flex items-center overflow-hidden rounded-full border border-ink-300 bg-white focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-200"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            onClick={() => setQty((q) => clamp((q ?? floor) - step))}
            disabled={qty == null || qty <= floor}
            aria-label={`Decrease quantity by ${step}`}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-700 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300"
          >
            <Minus className="h-3 w-3" aria-hidden="true" />
          </button>
          <input
            id="studio-cost-qty"
            type="number"
            inputMode="numeric"
            min={floor}
            max={MAX_QTY}
            step={step}
            value={qty ?? ''}
            placeholder={String(floor)}
            aria-label="Quantity in units"
            onChange={(e) => setQty(e.target.value ? parseInt(e.target.value, 10) : floor)}
            onBlur={() => setQty((q) => clamp(q ?? floor))}
            className="w-16 border-0 bg-transparent text-center text-[13px] font-semibold tabular-nums text-ink-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => setQty((q) => clamp((q ?? floor) + step))}
            disabled={qty != null && qty >= MAX_QTY}
            aria-label={`Increase quantity by ${step}`}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-700 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-1 text-right text-[10.5px] text-ink-400">
        MOQ {floor.toLocaleString()} · steps of {step.toLocaleString()}
      </p>

      {/* Headline: estimated all-in subtotal (fee folded in, Option C) */}
      <div className="mt-2">
        <p className="text-[10.5px] uppercase tracking-widest text-ink-500">
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Recalculating…
            </span>
          ) : (
            'Estimated subtotal'
          )}
        </p>
        <p className="font-display text-2xl font-bold tabular-nums text-ink-900">
          {estimate && estimate.quantity > 0 ? formatCents(estimate.totalCents) : '$—.——'}
        </p>
        {estimate && estimate.perUnitCents > 0 && (
          <p className="text-[11px] text-ink-500">
            {formatCents(estimate.perUnitCents)} / unit, all in before ship + tax
          </p>
        )}
        {/* §4b.3 — display-only on-demand line: present only when the product
            passes the full-service gate and the manufacturer authored on-demand
            bands. Band 1 by the locked velocity rule (trailing volume = 0 here). */}
        {estimate?.onDemand && (
          <p className="mt-1.5 rounded-md bg-ink-50 px-2 py-1.5 text-[11px] leading-relaxed text-ink-600">
            <span className="font-semibold text-ink-800">On-demand:</span>{' '}
            <span className="tabular-nums font-semibold">{formatCents(estimate.onDemand.unitCents)}</span> / unit ·
            no minimum · produced per sale once published to a channel
          </p>
        )}
        {/* WHY THE PRICE IS MISSING — render the refusal, never a bare dash. */}
        {estimateError && !busy && (
          <p className="mt-1 text-[11px] font-medium text-danger-700">{estimateError}</p>
        )}
      </div>

      {/* Volume pricing expander — the all-in band table */}
      <div className="mt-3 border-t border-ink-100 pt-2">
        <button
          type="button"
          onClick={() => setBandsOpen((v) => !v)}
          aria-expanded={bandsOpen}
          className="flex w-full items-center gap-1.5 text-[11px] font-semibold text-ink-600 hover:text-ink-900"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${bandsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          Volume pricing
        </button>
        {bandsOpen && (
          <div className="mt-2">
            <BandTable tiers={tiers} />
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-ink-400">Estimate before shipping + tax. Confirmed at checkout.</p>
    </div>
  )
}

/** All-in per-unit band table (unit prices grossed up server-side, page.tsx). */
function BandTable({ tiers }: { tiers: CostTier[] }) {
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead>
        <tr className="border-b border-ink-100 text-left text-ink-500">
          <th className="py-1.5 font-semibold">Quantity</th>
          <th className="py-1.5 font-semibold">Per unit</th>
          <th className="py-1.5 font-semibold">Lead</th>
        </tr>
      </thead>
      <tbody className="text-ink-800">
        {tiers.map((t, i) => (
          <tr key={i} className="border-b border-ink-50 last:border-0">
            <td className="py-1.5">{t.qtyRange} <span className="text-ink-400">· {t.fulfillment}</span></td>
            <td className="py-1.5 font-medium">{t.perUnit}</td>
            <td className="py-1.5 text-ink-500">{t.leadTimeDays ? `${t.leadTimeDays}d` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Details modal (tabbed) ────────────────────────────────────────────────────
function DetailsModal({ data, onClose }: { data: ProductDetailsData; onClose: () => void }) {
  const pic = data.picture ?? null
  const flavors = pic?.flavors ?? []
  const isMulti = !!pic && pic.topology !== 'SINGLE' && flavors.length > 0

  // Topology-driven tabs: Overview always; multi → optional Aggregate + one per selected flavor;
  // single → a "Recipe & label" tab; no picture yet → the legacy Compliance/Manufacturing tabs.
  const tabs: { key: string; label: string }[] = [{ key: 'overview', label: 'Overview' }]
  if (pic) {
    if (isMulti) {
      if (pic.aggregateFactsPanel) tabs.push({ key: 'aggregate', label: 'Variety pack' })
      for (const f of flavors) tabs.push({ key: `flavor:${f.flavorPresetId}`, label: f.name })
    } else if (pic.factsPanel || pic.recipe) {
      tabs.push({ key: 'label', label: 'Recipe & label' })
    }
  } else {
    tabs.push({ key: 'compliance', label: 'Compliance' }, { key: 'manufacturing', label: 'Manufacturing' })
  }

  const [tab, setTab] = React.useState<string>('overview')
  const activeFlavor = tab.startsWith('flavor:') ? flavors.find((f) => `flavor:${f.flavorPresetId}` === tab) ?? null : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-ink-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink-900">{data.productName}</h3>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {data.category ? pretty(data.category) : '—'} · {DOMAIN_LABEL[data.domain] ?? pretty(data.domain)}
              {isMulti ? ` · ${flavors.length} flavors` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-ink-100 px-4">
          {tabs.map((t) => {
            const f = t.key.startsWith('flavor:') ? flavors.find((x) => `flavor:${x.flavorPresetId}` === t.key) : null
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
                {f && <span className="inline-block h-2.5 w-2.5 rounded-full border border-ink-200" style={{ backgroundColor: f.swatchHex ?? 'transparent' }} aria-hidden />}
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && <OverviewSheet data={data} pic={pic} isMulti={isMulti} />}

          {tab === 'aggregate' && (
            <div className="space-y-3">
              <p className="text-[12px] text-ink-500">Combined label for the whole variety pack — all selected flavors declared together.</p>
              <FactsFrame node={pic?.aggregateFactsPanel} />
            </div>
          )}

          {tab === 'label' && (
            <div className="space-y-4">
              {pic?.recipe && <RecipeBlock recipe={pic.recipe} />}
              <FactsFrame node={pic?.factsPanel} />
            </div>
          )}

          {activeFlavor && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 rounded-full border border-ink-200" style={{ backgroundColor: activeFlavor.swatchHex ?? 'transparent' }} aria-hidden />
                <div>
                  <p className="text-[14px] font-semibold text-ink-900">{activeFlavor.name}</p>
                  {activeFlavor.statementOfIdentity && <p className="text-[12px] text-ink-500">{activeFlavor.statementOfIdentity}</p>}
                </div>
                {activeFlavor.hasLabel === false && <span className="ml-auto rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-500">No label yet</span>}
              </div>
              {activeFlavor.recipe && <RecipeBlock recipe={activeFlavor.recipe} />}
              <FactsFrame node={activeFlavor.factsPanel} />
            </div>
          )}

          {/* Legacy fallback (no picture wired yet) */}
          {!pic && tab === 'compliance' && (
            <dl className="space-y-2 text-[13px]">
              <MRow k="Label type" v={DOMAIN_LABEL[data.domain] ?? pretty(data.domain)} />
              <MRow k="Allergens" v={data.allergens.length ? data.allergens.map(pretty).join(', ') : 'None declared'} />
              <MRow k="Bioengineered" v={data.bioengineered ? 'Contains BE ingredient(s)' : 'Not flagged'} />
              <p className="pt-1 text-[12px] text-ink-500">Edit the facts panel + mandatory phrases in the Label &amp; Compliance tab.</p>
            </dl>
          )}
          {!pic && tab === 'manufacturing' && (
            <dl className="space-y-2 text-[13px]">
              <MRow k="Manufacturer" v={data.manufacturerName ?? 'Assigned at production'} />
              <MRow k="MOQ" v={data.moq ? `${data.moq.toLocaleString()} units` : '—'} />
              <MRow k="Lead time" v={data.leadTimeDays ? `${data.leadTimeDays} days` : '—'} />
              <MRow k="Fulfillment" v={data.fulfillment ?? '—'} />
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}

// The full spec-sheet overview — everything that comes with the product.
function OverviewSheet({ data, pic, isMulti }: { data: ProductDetailsData; pic: ProductPicture | null; isMulti: boolean }) {
  return (
    <div className="space-y-5">
      <SheetSection title="Identity">
        <MRow k="Brand" v={data.brandName ?? '—'} />
        <MRow k="Category" v={data.category ? pretty(data.category) : '—'} />
        <MRow k="Label domain" v={DOMAIN_LABEL[data.domain] ?? pretty(data.domain)} />
        <MRow k="Manufacturer" v={data.manufacturerName ?? 'Assigned at production'} />
      </SheetSection>

      {isMulti && pic?.packComposition && pic.packComposition.length > 0 && (
        <SheetSection title="Selected flavors & pack">
          {pic.packComposition.map((c) => <MRow key={c.flavorPresetId} k={c.name} v={`${c.units} units`} />)}
        </SheetSection>
      )}

      <SheetSection title="Commercial">
        <MRow k="Price" v={data.cost ? (data.cost.single ? data.cost.low : `${data.cost.low} – ${data.cost.high}`) : '—'} />
        <MRow k="MOQ" v={data.moq ? `${data.moq.toLocaleString()} units` : '—'} />
        <MRow k="Lead time" v={data.leadTimeDays ? `${data.leadTimeDays} days` : '—'} />
        <MRow k="Fulfillment" v={data.fulfillment ?? '—'} />
      </SheetSection>

      <SheetSection title="Packaging">
        <MRow k="Net quantity" v={data.netQuantity ?? '—'} />
        {data.packaging && <MRow k="Container" v={data.packaging.container} />}
        {data.packaging?.category && <MRow k="Material / category" v={pretty(data.packaging.category)} />}
        {data.packaging?.dimensions && <MRow k="Dimensions" v={data.packaging.dimensions} />}
        {data.packaging?.fragility && <MRow k="Fragility" v={pretty(data.packaging.fragility)} />}
      </SheetSection>

      <SheetSection title="Compliance">
        <MRow k="Allergens" v={data.allergens.length ? data.allergens.map(pretty).join(', ') : 'None declared'} />
        <MRow k="Bioengineered" v={data.bioengineered ? 'Contains BE ingredient(s)' : 'Not flagged'} />
        {pic?.mandatoryPhrases && <MRow k="Mandatory phrases" v={pic.mandatoryPhrases.length ? `${pic.mandatoryPhrases.length} required` : 'None'} />}
        {pic?.claims && pic.claims.length > 0 && <MRow k="Claims" v={pic.claims.join(', ')} />}
      </SheetSection>

      <SheetSection title="Retail identity">
        <MRow k="GTIN / UPC" v={data.retail?.gtin ?? '—'} />
        <MRow k="Internal SKU" v={data.retail?.internalSku ?? '—'} />
        <MRow k="Barcode" v={data.retail?.barcodeMode ? pretty(data.retail.barcodeMode) : '—'} />
      </SheetSection>

      {pic?.finishes && pic.finishes.length > 0 && (
        <SheetSection title="Finishes">
          {pic.finishes.map((f, i) => <MRow key={i} k={f.name} v={f.category ? pretty(f.category) : '—'} />)}
        </SheetSection>
      )}

      {data.certs && data.certs.length > 0 && (
        <SheetSection title="Certificates">
          <div className="flex flex-wrap items-center gap-2">
            {data.certs.map((c, i) =>
              c.badgeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={c.badgeUrl} alt={c.name} title={c.name} className="h-8 w-8 rounded border border-ink-100 bg-white object-contain p-0.5" />
              ) : (
                <span key={i} className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{c.name}</span>
              ),
            )}
          </div>
        </SheetSection>
      )}
    </div>
  )
}

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">{title}</h4>
      <dl className="space-y-2 text-[13px]">{children}</dl>
    </section>
  )
}

function RecipeBlock({ recipe }: { recipe: PictureRecipe }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">Recipe</h4>
      {(recipe.servingSize || recipe.servings != null) && (
        <p className="mb-2 text-[12px] text-ink-500">
          {recipe.servingSize ? `Serving ${recipe.servingSize}` : ''}
          {recipe.servingSize && recipe.servings != null ? ' · ' : ''}
          {recipe.servings != null ? `${recipe.servings} servings/container` : ''}
        </p>
      )}
      {recipe.ingredients.length === 0 ? (
        <p className="text-[12px] text-ink-400">No ingredients recorded.</p>
      ) : (
        <ol className="space-y-1 text-[13px]">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-ink-50 pb-1 last:border-0">
              <span className="text-ink-800">
                {ing.name}
                {ing.source === 'FLAVOR_EXTRA' && <span className="ml-1.5 rounded-full bg-pink-50 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">flavor</span>}
              </span>
              {ing.weightG != null && <span className="tabular-nums text-ink-500">{ing.weightG} g</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Frame for a pre-rendered Facts panel (SVG element passed by the shell). Scrolls if tall.
function FactsFrame({ node }: { node?: React.ReactNode }) {
  if (!node) {
    return <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12px] text-ink-500">Facts label preview isn&apos;t available for this product yet.</p>
  }
  return <div className="flex justify-center overflow-auto rounded-lg border border-ink-100 bg-white p-3">{node}</div>
}

function PdfDownloadButton({ dieCut }: { dieCut: DieCutSpec }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); try { downloadBlob(await generateBlankPdfSpec(dieCut), `${slugify(dieCut.name)}-blank.pdf`) } catch { /* noop */ } finally { setBusy(false) } }}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-black disabled:opacity-60"
    >
      <FileDown className="h-3.5 w-3.5" /> {busy ? 'Preparing…' : 'PDF template'}
    </button>
  )
}

function Accordion({
  title, right, open, onToggle, children,
}: {
  title: string; right?: string | null; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-700">{title}</span>
        {right && <span className="text-[12.5px] font-semibold text-ink-900">{right}</span>}
        <ChevronDown className={`ml-auto h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-ink-100 p-3">{children}</div>}
    </section>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium text-ink-900">{v}</dd></div>
}
function MRow({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-ink-50 pb-2 last:border-0"><dt className="text-ink-500">{k}</dt><dd className="text-right font-medium text-ink-900">{v}</dd></div>
}

const DOT: Record<string, string> = { red: 'bg-danger-500', ink: 'bg-ink-700', blue: 'bg-info-500' }
function SpecRow({ color, label, wMm, hMm }: { color: 'red' | 'ink' | 'blue'; label: string; wMm: number; hMm: number }) {
  return (
    <tr className="border-b border-ink-50 last:border-0">
      <td className="py-1.5"><span className="inline-flex items-center gap-1.5"><span className={`inline-block h-2 w-2 rounded-full ${DOT[color]}`} />{label}</span></td>
      <td className="py-1.5">{wMm.toFixed(1)} mm <span className="text-ink-400">({mmToInchesStr(wMm)}")</span></td>
      <td className="py-1.5">{hMm.toFixed(1)} mm <span className="text-ink-400">({mmToInchesStr(hMm)}")</span></td>
    </tr>
  )
}
