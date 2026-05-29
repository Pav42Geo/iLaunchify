// Phase G8 — read-only manifest card for the partner-side dispatch detail.
//
// The manifest is generated server-side at order placement (see
// @ilaunchify/orders' generateOrderManifest). This card just renders the
// JSON as a structured spec the partner can scan + send to their press
// queue.
//
// The 'Download bundle' button is a forward-pointer disabled state — the
// actual print-ready PDF + die-line SVG render is V1.5 worker territory
// (a headless browser reads OrderItem.designVersionId and renders the
// saved Fabric JSON).

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ilaunchify/ui'
import { Download, Leaf, Lock } from 'lucide-react'
import type { ProductionManifest } from '@ilaunchify/orders'

interface Props {
  manifest: ProductionManifest | null
  status: 'PENDING_GENERATION' | 'READY' | 'FAILED'
}

export function ProductionManifestCard({ manifest, status }: Props) {
  if (!manifest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production manifest</CardTitle>
          <CardDescription>
            {status === 'FAILED'
              ? 'Manifest generation failed — contact iLaunchify admin to regenerate.'
              : 'Manifest is being prepared. Refresh in a moment.'}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Production manifest</CardTitle>
        <CardDescription>
          Spec the creator paid for. Substrate / packaging / finishes are
          locked at this version — re-edits to the design after this
          manifest was generated don&apos;t apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Identity */}
        <Section title="Identity">
          <Row label="Brand" value={manifest.brandName} />
          <Row label="Product" value={manifest.productName} />
          <Row label="Quantity" value={`${manifest.quantity} units`} />
          {manifest.designVersionId && (
            <Row
              label="Design"
              value={
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3 text-emerald-600" />
                  Version {manifest.designVersion} locked
                </span>
              }
            />
          )}
        </Section>

        {/* Substrate */}
        {manifest.substrate && (
          <Section title="Label substrate">
            <Row label="Material" value={manifest.substrate.name} />
            <Row label="Slug" value={<code>{manifest.substrate.slug}</code>} />
            <Row label="Category" value={humanCategory(manifest.substrate.category)} />
            {manifest.substrate.sustainabilityTier !== 'STANDARD' && (
              <Row
                label="Sustainability"
                value={
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <Leaf className="h-3 w-3" />
                    {manifest.substrate.sustainabilityTier}
                  </span>
                }
              />
            )}
          </Section>
        )}

        {/* Packaging */}
        {manifest.packaging && (
          <Section title="Packaging material">
            <Row label="Material" value={manifest.packaging.name} />
            <Row label="Slug" value={<code>{manifest.packaging.slug}</code>} />
            <Row label="Topology" value={humanTopology(manifest.packaging.topology)} />
            <Row
              label="Food-safe"
              value={manifest.packaging.foodSafe ? 'Yes' : 'No'}
            />
          </Section>
        )}

        {/* Finishes */}
        {manifest.finishes.length > 0 && (
          <Section title={`Finishes (${manifest.finishes.length})`}>
            <ul className="space-y-1.5">
              {manifest.finishes.map((f) => (
                <li
                  key={f.partnerFinishId}
                  className="rounded border border-zinc-200 bg-zinc-50/50 p-2"
                >
                  <div className="font-medium text-zinc-900">{f.finishName}</div>
                  <div className="text-xs text-zinc-500">
                    {humanFinishCategory(f.category)} · pricing: {f.pricingMode}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Die-cut */}
        {manifest.dieCut && (
          <Section title="Die-cut">
            <Row label="Template" value={manifest.dieCut.name} />
            <Row
              label="Dimensions"
              value={`${manifest.dieCut.widthMm}mm × ${manifest.dieCut.heightMm}mm`}
            />
            <Row
              label="Bleed / safe"
              value={`${manifest.dieCut.bleedMm}mm bleed · ${manifest.dieCut.safeAreaMm}mm safe`}
            />
          </Section>
        )}

        {/* Ship-to */}
        <Section title="Ship to">
          <Row
            label="Type"
            value={
              manifest.shipTo.type === 'WAREHOUSE_PARTNER'
                ? 'WAREHOUSE partner'
                : 'Creator address'
            }
          />
          <Row label="Recipient" value={manifest.shipTo.contactName} />
          <Row
            label="Address"
            value={
              <span>
                {manifest.shipTo.addressLine1}
                {manifest.shipTo.addressLine2 && (
                  <>
                    <br />
                    {manifest.shipTo.addressLine2}
                  </>
                )}
                <br />
                {manifest.shipTo.city}, {manifest.shipTo.state ?? ''}{' '}
                {manifest.shipTo.postalCode}
              </span>
            }
          />
          <Row label="Country" value={manifest.shipTo.country} />
        </Section>

        {/* Download button — V1.5 worker fills this in */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
          <div className="text-xs text-zinc-500">
            Manifest v{manifest.manifestVersion} ·{' '}
            {new Date(manifest.generatedAt).toLocaleString()}
          </div>
          <button
            type="button"
            disabled
            title="Print-ready PDF + die-line SVG render lands in V1.5 (headless-browser worker)."
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            <Download className="h-3 w-3" />
            Download bundle (V1.5)
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
        {title}
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-2 text-sm">
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      <span className="text-zinc-800">{value}</span>
    </div>
  )
}

function humanCategory(cat: string): string {
  switch (cat) {
    case 'PAPER_COATED':
      return 'Coated paper'
    case 'PAPER_UNCOATED':
      return 'Uncoated paper'
    case 'KRAFT_RECYCLED':
      return 'Recycled kraft'
    case 'FILM_BOPP':
      return 'BOPP film'
    case 'FILM_CLEAR':
      return 'Clear film'
    case 'FILM_METALLIC':
      return 'Metallic film'
    case 'SPECIALTY':
      return 'Specialty'
    default:
      return cat
  }
}

function humanTopology(t: string): string {
  switch (t) {
    case 'SINGLE_CONTAINER':
      return 'Bottle / jar'
    case 'CAPSULE_JAR':
      return 'Supplement bottle'
    case 'POUCH_STAND_UP':
      return 'Stand-up pouch'
    case 'POUCH_FLAT':
      return 'Flat pouch'
    case 'STICK_PACK':
      return 'Stick pack'
    case 'SACHET':
      return 'Sachet'
    case 'MULTI_CONTAINER_BOX':
      return 'Outer carton'
    case 'CASE':
      return 'Shipper / case'
    case 'TUBE':
      return 'Tube'
    default:
      return t
  }
}

function humanFinishCategory(cat: string): string {
  switch (cat) {
    case 'SURFACE':
      return 'Surface coating'
    case 'FOIL_METALLIC':
      return 'Foil / metallic'
    case 'EMBOSS_TEXTURE':
      return 'Emboss / texture'
    case 'CUT':
      return 'Cut / die'
    case 'INK':
      return 'Ink type'
    case 'SPECIAL':
      return 'Specialty effect'
    default:
      return cat
  }
}
