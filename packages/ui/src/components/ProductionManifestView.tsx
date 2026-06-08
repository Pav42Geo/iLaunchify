// Shared production-manifest view — the single source of truth for "what the
// creator paid for" production spec. Rendered identically in the PARTNER
// dispatch detail and the ADMIN order detail so everyone monitors the same
// information. Design-system styled (ink / cream / pink).
//
// The manifest prop is typed structurally (not imported from @ilaunchify/orders)
// so this UI package stays dependency-free; both apps pass their
// `ProductionManifest` which is structurally compatible.
//
// Downloads: the manifest JSON itself is downloadable today (pass
// `manifestDownloadHref`). The print-ready PDF + die-line SVG bundle is the
// V1.5 render-worker's job, so that stays a clear "pending" state.

import * as React from 'react'
import { cn } from '../lib/utils'

export interface ProductionManifestData {
  brandName: string
  productName: string
  quantity: number
  designVersionId: string | null
  designVersion: number | null
  substrate: { name: string; slug: string; category: string; sustainabilityTier: string } | null
  packaging: { name: string; slug: string; topology: string; foodSafe: boolean } | null
  finishes: Array<{ partnerFinishId: string; finishName: string; category: string; pricingMode: string }>
  dieCut: { name: string; widthMm: number; heightMm: number; bleedMm: number; safeAreaMm: number } | null
  shipTo: {
    type: string
    contactName: string
    addressLine1: string
    addressLine2: string | null
    city: string
    state: string | null
    postalCode: string
    country: string
  }
  manifestVersion: string
  generatedAt: string
}

export interface ProductionManifestViewProps {
  manifest: ProductionManifestData | null
  status: 'PENDING_GENERATION' | 'READY' | 'FAILED'
  /** When set, the manifest JSON is downloadable (real, available today). */
  manifestDownloadHref?: string
  className?: string
}

export function ProductionManifestView({
  manifest,
  status,
  manifestDownloadHref,
  className,
}: ProductionManifestViewProps) {
  if (!manifest) {
    return (
      <div className={cn('rounded-2xl border border-ink-200 bg-white p-5', className)}>
        <h3 className="font-display text-[15px] font-semibold text-ink-900">Production manifest</h3>
        <p className="mt-1 text-[13px] text-ink-500">
          {status === 'FAILED'
            ? 'Manifest generation failed — regenerate from admin.'
            : 'Manifest is being prepared. Refresh in a moment.'}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-ink-900">Production manifest</h3>
          <p className="mt-0.5 text-[12px] text-ink-500">
            The exact spec the creator paid for — substrate, packaging, finishes and die-cut are locked at this version.
          </p>
        </div>
        <span className="flex-shrink-0 whitespace-nowrap rounded-full border border-ink-200 bg-cream px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
          v{manifest.manifestVersion}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <Block title="Identity">
          <Row label="Brand" value={manifest.brandName} />
          <Row label="Product" value={manifest.productName} />
          <Row label="Quantity" value={`${manifest.quantity.toLocaleString()} units`} />
          <Row
            label="Design proof"
            value={
              manifest.designVersionId ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Version {manifest.designVersion} locked
                  <span className="text-ink-400">· print render V1.5</span>
                </span>
              ) : (
                <span className="text-ink-400">No design attached (legacy order)</span>
              )
            }
          />
        </Block>

        {manifest.substrate && (
          <Block title="Label substrate">
            <Row label="Material" value={manifest.substrate.name} />
            <Row label="Code" value={<code className="text-[12px]">{manifest.substrate.slug}</code>} />
            <Row label="Category" value={humanCategory(manifest.substrate.category)} />
            {manifest.substrate.sustainabilityTier !== 'STANDARD' && (
              <Row label="Sustainability" value={<span className="text-emerald-700">{manifest.substrate.sustainabilityTier}</span>} />
            )}
          </Block>
        )}

        {manifest.packaging && (
          <Block title="Packaging material">
            <Row label="Material" value={manifest.packaging.name} />
            <Row label="Code" value={<code className="text-[12px]">{manifest.packaging.slug}</code>} />
            <Row label="Topology" value={humanTopology(manifest.packaging.topology)} />
            <Row label="Food-safe" value={manifest.packaging.foodSafe ? 'Yes' : 'No'} />
          </Block>
        )}

        {manifest.finishes.length > 0 && (
          <Block title={`Finishes (${manifest.finishes.length})`}>
            <ul className="space-y-1.5">
              {manifest.finishes.map((f) => (
                <li key={f.partnerFinishId} className="rounded-lg border border-ink-100 bg-cream px-2.5 py-1.5">
                  <div className="text-[13px] font-medium text-ink-900">{f.finishName}</div>
                  <div className="text-[11.5px] text-ink-500">{humanFinishCategory(f.category)} · pricing: {f.pricingMode}</div>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {manifest.dieCut && (
          <Block title="Die-cut / die-line">
            <Row label="Template" value={manifest.dieCut.name} />
            <Row label="Dimensions" value={`${manifest.dieCut.widthMm}mm × ${manifest.dieCut.heightMm}mm`} />
            <Row label="Bleed / safe" value={`${manifest.dieCut.bleedMm}mm bleed · ${manifest.dieCut.safeAreaMm}mm safe`} />
          </Block>
        )}

        <Block title="Ship to">
          <Row label="Type" value={manifest.shipTo.type === 'WAREHOUSE_PARTNER' ? 'Warehouse partner' : 'Creator address'} />
          <Row label="Recipient" value={manifest.shipTo.contactName} />
          <Row
            label="Address"
            value={
              <span>
                {manifest.shipTo.addressLine1}
                {manifest.shipTo.addressLine2 && (<><br />{manifest.shipTo.addressLine2}</>)}
                <br />
                {manifest.shipTo.city}, {manifest.shipTo.state ?? ''} {manifest.shipTo.postalCode}
                <br />
                {manifest.shipTo.country}
              </span>
            }
          />
        </Block>
      </div>

      {/* Downloads */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <div className="text-[11.5px] text-ink-500">
          Generated {new Date(manifest.generatedAt).toLocaleString()}
        </div>
        <div className="flex items-center gap-2">
          {manifestDownloadHref && (
            <a
              href={manifestDownloadHref}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              Download manifest (JSON)
            </a>
          )}
          <span
            title="Print-ready PDF + die-line SVG render lands in V1.5 (headless-browser worker)."
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-200 bg-zinc-50 px-3 py-1.5 text-[12px] font-medium text-ink-400"
          >
            Print bundle — generating (V1.5)
          </span>
        </div>
      </div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px,1fr] items-baseline gap-2 text-[13px]">
      <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
      <span className="text-ink-800">{value}</span>
    </div>
  )
}

function humanCategory(cat: string): string {
  const m: Record<string, string> = {
    PAPER_COATED: 'Coated paper', PAPER_UNCOATED: 'Uncoated paper', KRAFT_RECYCLED: 'Recycled kraft',
    FILM_BOPP: 'BOPP film', FILM_CLEAR: 'Clear film', FILM_METALLIC: 'Metallic film', SPECIALTY: 'Specialty',
  }
  return m[cat] ?? cat
}

function humanTopology(t: string): string {
  const m: Record<string, string> = {
    SINGLE_CONTAINER: 'Bottle / jar', CAPSULE_JAR: 'Supplement bottle', POUCH_STAND_UP: 'Stand-up pouch',
    POUCH_FLAT: 'Flat pouch', STICK_PACK: 'Stick pack', SACHET: 'Sachet', MULTI_CONTAINER_BOX: 'Outer carton',
    CASE: 'Shipper / case', TUBE: 'Tube',
  }
  return m[t] ?? t
}

function humanFinishCategory(cat: string): string {
  const m: Record<string, string> = {
    SURFACE: 'Surface coating', FOIL_METALLIC: 'Foil / metallic', EMBOSS_TEXTURE: 'Emboss / texture',
    CUT: 'Cut / die', INK: 'Ink type', SPECIAL: 'Specialty effect',
  }
  return m[cat] ?? cat
}
