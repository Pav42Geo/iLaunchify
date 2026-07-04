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
  const [tab, setTab] = React.useState<'overview' | 'compliance' | 'manufacturing'>('overview')
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'manufacturing', label: 'Manufacturing' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">{data.productName}</h3>
            <p className="mt-0.5 text-[12px] text-ink-500">
              {data.category ? pretty(data.category) : '—'} · {DOMAIN_LABEL[data.domain] ?? pretty(data.domain)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 border-b border-ink-100 px-4">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {tab === 'overview' && (
            <dl className="space-y-2 text-[13px]">
              <MRow k="Brand" v={data.brandName ?? '—'} />
              <MRow k="Category" v={data.category ? pretty(data.category) : '—'} />
              <MRow k="Label domain" v={DOMAIN_LABEL[data.domain] ?? pretty(data.domain)} />
              <MRow k="Net quantity" v={data.netQuantity ?? '—'} />
              <MRow k="GTIN / UPC" v={data.retail?.gtin ?? '—'} />
              <MRow k="Internal SKU" v={data.retail?.internalSku ?? '—'} />
              <MRow k="Barcode" v={data.retail?.barcodeMode ? pretty(data.retail.barcodeMode) : '—'} />
            </dl>
          )}
          {tab === 'compliance' && (
            <dl className="space-y-2 text-[13px]">
              <MRow k="Label type" v={DOMAIN_LABEL[data.domain] ?? pretty(data.domain)} />
              <MRow k="Allergens" v={data.allergens.length ? data.allergens.map(pretty).join(', ') : 'None declared'} />
              <MRow k="Bioengineered" v={data.bioengineered ? 'Contains BE ingredient(s)' : 'Not flagged'} />
              <p className="pt-1 text-[12px] text-ink-500">Edit the facts panel + mandatory phrases in the Label tab.</p>
            </dl>
          )}
          {tab === 'manufacturing' && (
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
