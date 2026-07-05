import * as React from 'react'
import { cn } from '../lib/utils'
import { SectionLabel } from './SectionLabel'

/**
 * ProductPassportView — the SHARED, read-only "Product Passport" panel.
 *
 * docs/PARTNER_ORDER_PACKETS.md. A production order fans out to several partners
 * (manufacturer, printer, co-packer, FC). Every one of them sees this identical
 * passport — "what the product IS": identity, quantities, the design lock,
 * die-cut geometry, flavor identity (name + on-label Statement of Identity),
 * pack structure, the committed production lead, and the ship-to REGION only.
 *
 * It deliberately carries NO formulation, NO finishes, and NO street address —
 * those are role-scoped into each partner's work packet (RolePacket) by
 * `scopeManifestForRole` in @ilaunchify/orders. This component only renders the
 * safe, shared surface, so it can sit at the top of the partner AND admin
 * manifest views unchanged.
 *
 * Presentational + dependency-free: its props mirror `ProductPassport` from
 * @ilaunchify/orders structurally, but are declared locally so @ilaunchify/ui
 * never imports the orders package. Hosts map `packet.passport` → these props.
 */

/** Ship-to destination kind (mirrors the order's ship-to type). */
export type PassportShipType =
  | 'CREATOR_ADDRESS'
  | 'WAREHOUSE_PARTNER'
  | 'HOLD_AT_MANUFACTURER'
  | 'CHANNEL_INBOUND'
  | (string & {})

export interface PassportDieCut {
  name: string
  category?: string
  widthMm: number
  heightMm: number
  bleedMm: number
  safeAreaMm: number
}

export interface PassportFlavor {
  flavorName: string
  qty: number
  statementOfIdentity: string | null
  /** Optional brand swatch — rendered as a dot when present. */
  swatchHex?: string | null
}

export interface PassportPack {
  packCount: number
  unitsPerPack: number
  totalUnits: number
  pricingBasis?: 'PER_FLAVOR' | 'PER_PACK' | null
}

export interface PassportProduction {
  leadTimeDays: number
  standardLeadDays: number
  changeoverDays: number
  flavorCount: number
  basis: 'STANDARD' | 'MULTI_FLAVOR' | (string & {})
}

export interface PassportShipRegion {
  type: PassportShipType
  city: string
  state: string | null
  country: string
}

export interface ProductPassportData {
  brandName: string
  productName: string
  quantity: number
  orderId?: string
  orderDispatchId?: string
  designVersion: number | null
  designVersionId: string | null
  generatedAt?: string
  dieCut: PassportDieCut | null
  flavors: PassportFlavor[]
  pack: PassportPack | null
  production: PassportProduction
  shipRegion: PassportShipRegion
}

const SHIP_TYPE_LABEL: Record<string, string> = {
  CREATOR_ADDRESS: 'Creator address',
  WAREHOUSE_PARTNER: 'Warehouse partner',
  HOLD_AT_MANUFACTURER: 'Hold at manufacturer',
  CHANNEL_INBOUND: 'Channel inbound',
}

function shipLabel(t: PassportShipType): string {
  return SHIP_TYPE_LABEL[t] ?? String(t)
}

function regionText(r: PassportShipRegion): string {
  return [r.city, r.state, r.country].filter(Boolean).join(', ')
}

/** One label/value stat cell. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--fs-xs)] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 truncate text-[length:var(--fs-sm)] font-medium text-ink-900">{value}</div>
    </div>
  )
}

/** A titled section block. */
function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-4', className)}>
      <SectionLabel className="mb-3">{title}</SectionLabel>
      {children}
    </section>
  )
}

export interface ProductPassportViewProps {
  passport: ProductPassportData
  className?: string
  /** Compact hides the "shared with every partner" helper note. */
  compact?: boolean
}

export function ProductPassportView({ passport: p, className, compact }: ProductPassportViewProps) {
  const shipBy = p.production.leadTimeDays
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Header band — identity + the order/design lock. */}
      <div className="rounded-[var(--card-radius)] border border-ink-200 bg-[var(--bg-hero)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionLabel>Product passport</SectionLabel>
            <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-ink-900">{p.productName}</h3>
            <div className="mt-0.5 text-[length:var(--fs-sm)] text-ink-600">{p.brandName}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-pill bg-ink-900 px-3 py-1 text-[11px] font-semibold text-white tabular-nums">
              {p.quantity.toLocaleString()} units
            </span>
            {p.designVersion != null ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1 text-[11px] font-semibold text-ink-800 shadow-sm">
                <span aria-hidden>🔒</span> Design v{p.designVersion}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-pill bg-white px-3 py-1 text-[11px] font-medium text-ink-500 shadow-sm">
                No design lock
              </span>
            )}
          </div>
        </div>
        {!compact && (
          <p className="mt-3 text-[length:var(--fs-xs)] text-ink-500">
            Shared with every partner on this order. Formulation, finishes, cost, and the full delivery
            address are need-to-know and appear only in each partner&rsquo;s own work packet.
          </p>
        )}
      </div>

      {/* Stat blocks. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Block title="Production lead">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Committed" value={<span className="tabular-nums">{shipBy} days</span>} />
            <Field label="Standard floor" value={<span className="tabular-nums">{p.production.standardLeadDays} days</span>} />
            <Field label="Changeover" value={<span className="tabular-nums">{p.production.changeoverDays} d / flavor</span>} />
            <Field
              label="Basis"
              value={p.production.basis === 'MULTI_FLAVOR' ? `Multi-flavor (${p.production.flavorCount})` : 'Standard'}
            />
          </div>
        </Block>

        <Block title="Ship to (region)">
          <div className="grid grid-cols-1 gap-3">
            <Field label="Destination" value={shipLabel(p.shipRegion.type)} />
            <Field label="Region" value={regionText(p.shipRegion) || '—'} />
          </div>
          <p className="mt-3 text-[length:var(--fs-xs)] text-ink-500">
            Region only — the full address is in the packet of the partner that ships to it.
          </p>
        </Block>

        {p.dieCut && (
          <Block title="Die-cut">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Template" value={p.dieCut.name} />
              <Field label="Size" value={<span className="tabular-nums">{p.dieCut.widthMm} × {p.dieCut.heightMm} mm</span>} />
              <Field label="Bleed" value={<span className="tabular-nums">{p.dieCut.bleedMm} mm</span>} />
              <Field label="Safe area" value={<span className="tabular-nums">{p.dieCut.safeAreaMm} mm</span>} />
            </div>
          </Block>
        )}

        {p.pack && (
          <Block title="Pack structure">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Packs" value={<span className="tabular-nums">{p.pack.packCount.toLocaleString()}</span>} />
              <Field label="Units / pack" value={<span className="tabular-nums">{p.pack.unitsPerPack.toLocaleString()}</span>} />
              <Field label="Total units" value={<span className="tabular-nums">{p.pack.totalUnits.toLocaleString()}</span>} />
              {p.pack.pricingBasis && <Field label="Basis" value={p.pack.pricingBasis === 'PER_PACK' ? 'Per pack' : 'Per flavor'} />}
            </div>
          </Block>
        )}
      </div>

      {/* Flavor identity — name + on-label SoI + qty. No recipe. */}
      {p.flavors.length > 0 && (
        <Block title={`Flavors (${p.flavors.length})`}>
          <ul className="divide-y divide-ink-100">
            {p.flavors.map((f, i) => (
              <li key={`${f.flavorName}-${i}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start gap-2">
                  {f.swatchHex && (
                    <span
                      aria-hidden
                      className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-ink-200"
                      style={{ backgroundColor: f.swatchHex }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[length:var(--fs-sm)] font-medium text-ink-900">{f.flavorName}</div>
                    {f.statementOfIdentity && (
                      <div className="truncate text-[length:var(--fs-xs)] text-ink-500">{f.statementOfIdentity}</div>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[length:var(--fs-sm)] font-semibold tabular-nums text-ink-800">
                  {f.qty.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  )
}
