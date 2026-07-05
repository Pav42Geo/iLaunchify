import * as React from 'react'
import { cn } from '../lib/utils'
import { SectionLabel } from './SectionLabel'
import { ProductPassportView, type ProductPassportData } from './ProductPassportView'

/**
 * RolePacketView — a partner's scoped WORK PACKET, rendered as the shared
 * Product Passport (top) + only the fields THIS role executes on (below).
 *
 * docs/PARTNER_ORDER_PACKETS.md. The companion to ProductPassportView: where the
 * passport is identical for everyone, this panel renders the need-to-know work
 * fields that `scopeManifestForRole` (@ilaunchify/orders) leaves populated for
 * the role — recipe for the manufacturer, substrate + cost-stripped finishes for
 * the printer, packaging + assembly for the co-packer, inbound for the FC — plus
 * the scoped ship-to (full address only for the final shipper / warehouse; region
 * only, marked "redacted", for intermediate hops).
 *
 * Presentational + dependency-free: props mirror `RolePacket` structurally but
 * are declared locally so @ilaunchify/ui never imports the orders package. Hosts
 * pass the scoped packet straight in. Fields a role doesn't get arrive as
 * null/[] (the engine empties them), so this simply renders what's present.
 */

export type PacketRole = 'MANUFACTURER' | 'PRINTER' | 'COPACKER' | 'WAREHOUSE' | (string & {})

export interface PacketRecipeIngredient {
  ingredientId: string
  labelDeclarationName: string | null
  weightG: number
  position: number
  source: string | null
  filledSlotId?: string | null
  allergenFlags: string[]
  bioengineeredStatus: string | null
}

export interface PacketRecipe {
  servingSizeG: number | null
  servingsPerContainer: number | null
  ingredients: PacketRecipeIngredient[]
}

export interface PacketPerFlavorRecipe {
  flavorPresetId: string
  flavorName?: string | null
  ingredients: PacketRecipeIngredient[]
}

export interface PacketSubstrate {
  slug: string
  name: string
  category: string
  sustainabilityTier: string
}

export interface PacketPackaging {
  slug: string
  name: string
  topology: string
  sustainabilityTier: string
  foodSafe: boolean
}

export interface PacketFinish {
  partnerFinishId: string
  finishSlug: string
  finishName: string
  category: string
}

export interface PacketComponent {
  componentId: string
  tier: string
  role: string
  packagingTypeId: string
  packagingTypeName: string | null
  decorationMethod: string
  dielineId: string | null
}

export interface PacketFlavorSplit {
  flavorName: string
  qty: number
  statementOfIdentity: string | null
  leadTimeDays?: number | null
}

export interface PacketShipTo {
  type: string
  redacted: boolean
  contactName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string
  warehousePartnerServiceId: string | null
}

export interface RolePacketData {
  role: PacketRole
  passport: ProductPassportData
  recipe: PacketRecipe | null
  perFlavorRecipes: PacketPerFlavorRecipe[]
  substrate: PacketSubstrate | null
  packaging: PacketPackaging | null
  finishes: PacketFinish[]
  components: PacketComponent[]
  flavors: PacketFlavorSplit[]
  shipTo: PacketShipTo
  partnerActionItems: string[]
}

const ROLE_META: Record<string, { label: string; work: string }> = {
  MANUFACTURER: { label: 'Manufacturer', work: 'Production' },
  PRINTER: { label: 'Print provider', work: 'Labels & decoration' },
  COPACKER: { label: 'Co-packer', work: 'Assembly & packout' },
  WAREHOUSE: { label: 'Fulfillment center', work: 'Inbound receiving' },
}

function roleMeta(role: PacketRole) {
  return ROLE_META[role] ?? { label: String(role), work: 'Work packet' }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--fs-xs)] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 truncate text-[length:var(--fs-sm)] font-medium text-ink-900">{value}</div>
    </div>
  )
}

function Block({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        {subtitle && <span className="text-[length:var(--fs-xs)] text-ink-400">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}

function IngredientTable({ ingredients }: { ingredients: PacketRecipeIngredient[] }) {
  const ordered = [...ingredients].sort((a, b) => a.position - b.position)
  return (
    <ul className="divide-y divide-ink-100">
      {ordered.map((ing) => (
        <li key={ing.ingredientId} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="truncate text-[length:var(--fs-sm)] font-medium text-ink-900">
              {ing.labelDeclarationName ?? ing.ingredientId}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {ing.source && (
                <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{ing.source}</span>
              )}
              {ing.allergenFlags.map((a) => (
                <span key={a} className="rounded bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-600">{a}</span>
              ))}
              {ing.bioengineeredStatus && (
                <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">BE: {ing.bioengineeredStatus}</span>
              )}
            </div>
          </div>
          <span className="shrink-0 text-[length:var(--fs-sm)] font-semibold tabular-nums text-ink-800">{ing.weightG} g</span>
        </li>
      ))}
    </ul>
  )
}

function ShipToBlock({ shipTo }: { shipTo: PacketShipTo }) {
  if (shipTo.redacted) {
    const region = [shipTo.city, shipTo.state, shipTo.country].filter(Boolean).join(', ')
    return (
      <Block title="Ship to" subtitle="Region only">
        <div className="flex items-start gap-2">
          <span aria-hidden className="mt-0.5 text-ink-400">🔒</span>
          <div>
            <div className="text-[length:var(--fs-sm)] font-medium text-ink-900">Ship to the next partner on this order</div>
            <div className="mt-0.5 text-[length:var(--fs-sm)] text-ink-600">{region || '—'}</div>
            <p className="mt-2 text-[length:var(--fs-xs)] text-ink-500">
              The full delivery address is need-to-know and appears only in the packet of the partner that
              ships to it.
            </p>
          </div>
        </div>
      </Block>
    )
  }
  return (
    <Block title="Ship to">
      <address className="not-italic text-[length:var(--fs-sm)] leading-6 text-ink-900">
        {shipTo.contactName && <div className="font-medium">{shipTo.contactName}</div>}
        {shipTo.addressLine1 && <div>{shipTo.addressLine1}</div>}
        {shipTo.addressLine2 && <div>{shipTo.addressLine2}</div>}
        <div>
          {[shipTo.city, shipTo.state, shipTo.postalCode].filter(Boolean).join(', ')}
        </div>
        <div>{shipTo.country}</div>
      </address>
    </Block>
  )
}

export interface RolePacketViewProps {
  packet: RolePacketData
  className?: string
}

export function RolePacketView({ packet, className }: RolePacketViewProps) {
  const meta = roleMeta(packet.role)
  const hasProductionSplits = packet.flavors.length > 0

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Role header. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-pill bg-pink-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            {meta.label}
          </span>
          <span className="text-[length:var(--fs-sm)] text-ink-600">{meta.work}</span>
        </div>
      </div>

      {/* Action items (V1.5 marketplace matching populates these). */}
      {packet.partnerActionItems.length > 0 && (
        <div className="rounded-[var(--card-radius)] border border-warning-200 bg-warning-50 p-3">
          <SectionLabel className="mb-1 text-warning-700">Needs clarification</SectionLabel>
          <ul className="list-disc pl-5 text-[length:var(--fs-sm)] text-warning-800">
            {packet.partnerActionItems.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Shared passport. */}
      <ProductPassportView passport={packet.passport} />

      {/* Role-specific work fields. */}
      {packet.recipe && (
        <Block
          title="Formulation"
          subtitle={[
            packet.recipe.servingSizeG != null ? `${packet.recipe.servingSizeG} g serving` : null,
            packet.recipe.servingsPerContainer != null ? `${packet.recipe.servingsPerContainer} / container` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined}
        >
          <IngredientTable ingredients={packet.recipe.ingredients} />
        </Block>
      )}

      {packet.perFlavorRecipes.length > 0 && (
        <Block title={`Per-flavor recipes (${packet.perFlavorRecipes.length})`}>
          <div className="flex flex-col gap-4">
            {packet.perFlavorRecipes.map((fr) => (
              <div key={fr.flavorPresetId}>
                <div className="mb-2 text-[length:var(--fs-sm)] font-semibold text-ink-800">
                  {fr.flavorName ?? fr.flavorPresetId}
                </div>
                <IngredientTable ingredients={fr.ingredients} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {packet.substrate && (
        <Block title="Label stock (substrate)">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Material" value={packet.substrate.name} />
            <Field label="Category" value={packet.substrate.category} />
            <Field label="Sustainability" value={packet.substrate.sustainabilityTier} />
            <Field label="Slug" value={packet.substrate.slug} />
          </div>
        </Block>
      )}

      {packet.packaging && (
        <Block title="Container / packaging">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Material" value={packet.packaging.name} />
            <Field label="Topology" value={packet.packaging.topology} />
            <Field label="Food-safe" value={packet.packaging.foodSafe ? 'Yes' : 'No'} />
            <Field label="Sustainability" value={packet.packaging.sustainabilityTier} />
          </div>
        </Block>
      )}

      {packet.finishes.length > 0 && (
        <Block title={`Finishes (${packet.finishes.length})`} subtitle="Cost not shown">
          <ul className="flex flex-wrap gap-2">
            {packet.finishes.map((f) => (
              <li
                key={f.partnerFinishId}
                className="inline-flex items-center gap-1.5 rounded-pill border border-ink-200 bg-white px-3 py-1 text-[length:var(--fs-sm)] text-ink-800"
              >
                <span className="font-medium">{f.finishName}</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-400">{f.category}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {packet.components.length > 0 && (
        <Block title={`Components (${packet.components.length})`}>
          <ul className="divide-y divide-ink-100">
            {packet.components.map((c) => (
              <li key={c.componentId} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-[length:var(--fs-sm)] font-medium text-ink-900">
                    {c.packagingTypeName ?? c.packagingTypeId}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{c.role}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{c.decorationMethod}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{c.tier}</span>
                  </div>
                </div>
                {c.dielineId && (
                  <span className="shrink-0 text-[length:var(--fs-xs)] text-ink-400">die-line ✓</span>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {hasProductionSplits && (
        <Block title={`Production splits (${packet.flavors.length})`} subtitle="Per-flavor quantities">
          <ul className="divide-y divide-ink-100">
            {packet.flavors.map((f, i) => (
              <li key={`${f.flavorName}-${i}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-[length:var(--fs-sm)] font-medium text-ink-900">{f.flavorName}</div>
                  {f.statementOfIdentity && (
                    <div className="truncate text-[length:var(--fs-xs)] text-ink-500">{f.statementOfIdentity}</div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[length:var(--fs-sm)] font-semibold tabular-nums text-ink-800">{f.qty.toLocaleString()}</div>
                  {f.leadTimeDays != null && (
                    <div className="text-[length:var(--fs-xs)] text-ink-400 tabular-nums">{f.leadTimeDays} d lead</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* Scoped ship-to. */}
      <ShipToBlock shipTo={packet.shipTo} />
    </div>
  )
}
