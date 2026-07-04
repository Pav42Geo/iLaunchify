'use client'

// Creator Design Studio — "Product" details drawer (docs/CREATOR_PRODUCT_DETAILS_DRAWER.md).
// Printify-style compact reference panel: an always-visible identity header + progressive-
// disclosure accordions (Production & pricing · Print spec · Compliance essentials). Read-mostly
// — deep editing stays in the dedicated tools; this gathers the product's decided context in one
// place so the creator can reference it while designing.
//
// Fully self-contained/presentational: the parent (CanvasLayoutShell) builds a ProductDetailsData
// object and passes an onOpenLabelCompliance jump callback. No canvas/hot-file internals imported.

import * as React from 'react'
import { ChevronDown, FileDown, Factory, Tag, DollarSign, ShieldCheck, Box } from 'lucide-react'
import { generateBlankPdfSpec, generateBlankSvgSpec, mmToInchesStr, type DieCutSpec } from '@ilaunchify/ui'

export interface ProductDetailsData {
  productName: string
  /** Human product category label, or null. */
  category: string | null
  /** Regulatory labeling regime (LabelingType: FOOD / DIETARY_SUPPLEMENT / PET_PRODUCT / OTC / COSMETIC). */
  domain: string
  brandName: string | null
  /** Owner-pinned manufacturer (PartnerService → Partner company name), or null. */
  manufacturerName: string | null
  /** Optional preview image (product mockup / brand logo). */
  thumbnailUrl?: string | null
  /** Production & pricing summary — null hides the section. */
  pricing: {
    perUnit: string | null // preformatted, e.g. "$5.35"
    fulfillment: string | null // "Bulk" | "On-demand"
    moq: number | null
    leadTimeDays: number | null
  } | null
  netQuantity: string | null
  allergens: string[]
  dieCut: DieCutSpec
}

const DOMAIN_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  PET_PRODUCT: 'Pet',
  OTC: 'OTC drug',
  COSMETIC: 'Cosmetic',
}
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product'
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ProductDetailsDrawer({
  data,
  onOpenLabelCompliance,
}: {
  data: ProductDetailsData
  onOpenLabelCompliance?: () => void
}) {
  // Progressive disclosure: Print spec open first; the rest collapsed. One-open-at-a-time.
  const [open, setOpen] = React.useState<'pricing' | 'spec' | 'compliance' | null>('spec')
  const toggle = (k: 'pricing' | 'spec' | 'compliance') => setOpen((cur) => (cur === k ? null : k))

  return (
    <div className="space-y-3">
      {/* Identity header — always visible */}
      <section className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white p-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-50">
          {data.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.thumbnailUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <Box className="h-6 w-6 text-ink-300" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-ink-900" title={data.productName}>{data.productName}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {data.category && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-600">{pretty(data.category)}</span>}
            <span className="rounded-full bg-pink-50 px-2 py-0.5 font-medium text-pink-700">{DOMAIN_LABEL[data.domain] ?? pretty(data.domain)}</span>
          </div>
          {data.manufacturerName && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-ink-500">
              <Factory className="h-3.5 w-3.5" /> Made by {data.manufacturerName}
            </p>
          )}
        </div>
      </section>

      {/* Production & pricing */}
      {data.pricing && (
        <Accordion
          icon={<DollarSign className="h-4 w-4" />}
          title="Production & pricing"
          open={open === 'pricing'}
          onToggle={() => toggle('pricing')}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <Field k="Per unit" v={data.pricing.perUnit ? `${data.pricing.perUnit}${data.pricing.moq ? ` at MOQ ${data.pricing.moq.toLocaleString()}` : ''}` : '—'} />
            <Field k="Fulfillment" v={data.pricing.fulfillment ?? '—'} />
            <Field k="MOQ" v={data.pricing.moq ? data.pricing.moq.toLocaleString() : '—'} />
            <Field k="Lead time" v={data.pricing.leadTimeDays ? `${data.pricing.leadTimeDays} days` : '—'} />
          </dl>
          <p className="mt-2 text-[11px] text-ink-400">Reference only — final pricing is confirmed at checkout.</p>
        </Accordion>
      )}

      {/* Print spec */}
      <Accordion
        icon={<Tag className="h-4 w-4" />}
        title="Print spec"
        open={open === 'spec'}
        onToggle={() => toggle('spec')}
      >
        <div className="flex items-center justify-center rounded-md border border-ink-200 bg-ink-50/60 p-4">
          <div className="border border-dashed border-danger-500/80 rounded-md p-2">
            <div className="relative flex h-[68px] w-[120px] items-center justify-center rounded-sm bg-white">
              <div className="absolute inset-1.5 flex items-center justify-center rounded-sm border border-dotted border-info-500/70">
                <span className="text-[8px] uppercase tracking-wider text-ink-700">Safe area</span>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-ink-900">{data.dieCut.name}</p>
        <p className="mt-1 text-[11px] leading-[1.5] text-ink-500">
          Extend your design to the bleed line to avoid white edges; keep text and logos inside the safe area.
        </p>
        <table className="mt-3 w-full text-[11px] tabular-nums">
          <thead>
            <tr className="border-b border-ink-100 text-ink-500">
              <th className="py-1.5 text-left font-semibold"></th>
              <th className="py-1.5 text-left font-semibold">Width</th>
              <th className="py-1.5 text-left font-semibold">Height</th>
            </tr>
          </thead>
          <tbody className="text-ink-700">
            <SpecRow color="red" label="Bleed" wMm={data.dieCut.widthMm + 2 * data.dieCut.bleedMm} hMm={data.dieCut.heightMm + 2 * data.dieCut.bleedMm} />
            <SpecRow color="ink" label="Trim" wMm={data.dieCut.widthMm} hMm={data.dieCut.heightMm} />
            <SpecRow color="blue" label="Safe" wMm={Math.max(0, data.dieCut.widthMm - 2 * data.dieCut.safeAreaMm)} hMm={Math.max(0, data.dieCut.heightMm - 2 * data.dieCut.safeAreaMm)} />
          </tbody>
        </table>
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

      {/* Compliance essentials */}
      <Accordion
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Compliance essentials"
        open={open === 'compliance'}
        onToggle={() => toggle('compliance')}
      >
        <dl className="space-y-2 text-[12px]">
          <Field k="Label type" v={DOMAIN_LABEL[data.domain] ?? pretty(data.domain)} />
          <Field k="Net quantity" v={data.netQuantity ?? '—'} />
          <Field k="Allergens" v={data.allergens.length ? data.allergens.map(pretty).join(', ') : 'None declared'} />
        </dl>
        {onOpenLabelCompliance && (
          <button
            onClick={onOpenLabelCompliance}
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-pink-700 hover:text-pink-800"
          >
            Open Label &amp; Compliance →
          </button>
        )}
      </Accordion>
    </div>
  )
}

function PdfDownloadButton({ dieCut }: { dieCut: DieCutSpec }) {
  const [busy, setBusy] = React.useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try { downloadBlob(await generateBlankPdfSpec(dieCut), `${slugify(dieCut.name)}-blank.pdf`) } catch { /* noop */ } finally { setBusy(false) }
      }}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-black disabled:opacity-60"
    >
      <FileDown className="h-3.5 w-3.5" /> {busy ? 'Preparing…' : 'PDF template'}
    </button>
  )
}

function Accordion({
  icon, title, open, onToggle, children,
}: {
  icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-ink-500">{icon}</span>
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-700">{title}</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-ink-100 p-3">{children}</div>}
    </section>
  )
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-right font-medium text-ink-900">{v}</dd>
    </div>
  )
}

const DOT: Record<string, string> = { red: 'bg-danger-500', ink: 'bg-ink-700', blue: 'bg-info-500' }
function SpecRow({ color, label, wMm, hMm }: { color: 'red' | 'ink' | 'blue'; label: string; wMm: number; hMm: number }) {
  return (
    <tr className="border-b border-ink-50 last:border-0">
      <td className="py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[color]}`} />
          {label}
        </span>
      </td>
      <td className="py-1.5">{wMm.toFixed(1)} mm <span className="text-ink-400">({mmToInchesStr(wMm)}")</span></td>
      <td className="py-1.5">{hMm.toFixed(1)} mm <span className="text-ink-400">({mmToInchesStr(hMm)}")</span></td>
    </tr>
  )
}
