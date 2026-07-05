'use client'

// Creator Design Studio — "Product" details panel (docs/CREATOR_PRODUCT_DETAILS_DRAWER.md).
// Layout (Pavel 2026-07-04): fixed identity header (image · name · quantity · "Details" → tabbed
// modal), foldable Cost summary, foldable Print spec (real print detail, no safe-area diagram).
// Surfaces render OUTSIDE this component (non-foldable, by the parent). Self-contained: no canvas
// hot-file internals imported.

import * as React from 'react'
import { ChevronDown, FileDown, Box, X } from 'lucide-react'
import { generateBlankPdfSpec, generateBlankSvgSpec, mmToInchesStr, type DieCutSpec } from '@ilaunchify/ui'

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
        ) : (
          <>
            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="border-b border-ink-100 text-left text-ink-500">
                  <th className="py-1.5 font-semibold">Quantity</th>
                  <th className="py-1.5 font-semibold">Per unit</th>
                  <th className="py-1.5 font-semibold">Lead</th>
                </tr>
              </thead>
              <tbody className="text-ink-800">
                {data.cost.tiers.map((t, i) => (
                  <tr key={i} className="border-b border-ink-50 last:border-0">
                    <td className="py-1.5">{t.qtyRange} <span className="text-ink-400">· {t.fulfillment}</span></td>
                    <td className="py-1.5 font-medium">{t.perUnit}</td>
                    <td className="py-1.5 text-ink-500">{t.leadTimeDays ? `${t.leadTimeDays}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-ink-400">Per-unit list price by quantity. Final total is confirmed at checkout.</p>
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
