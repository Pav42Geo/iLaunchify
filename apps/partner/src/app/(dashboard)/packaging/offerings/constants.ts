// Slice C8 — dropdown options + labels for the partner packaging-offerings
// forms. Mirrors the enums in packages/db/prisma/schema.prisma — keep in sync
// with DecorationMethod / FulfillmentMode / OfferingStatus / ContainerCategory.

import type {
  DecorationMethod,
  FulfillmentMode,
  OfferingStatus,
  ContainerCategory,
} from '@ilaunchify/db'

export interface PricingTier {
  minQty: number
  pricePerUnitCents: number
}

// Human labels for every decoration method (primary + accent). The form only
// offers methods that have a compatibility row for the chosen container type,
// so the full map is fine here.
export const DECORATION_LABELS: Record<DecorationMethod, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
  NONE: 'No decoration',
}

export const FULFILLMENT_OPTIONS: Array<{
  value: FulfillmentMode
  label: string
  hint: string
}> = [
  { value: 'BULK_PRODUCTION', label: 'Bulk production', hint: 'Run-of production at MOQ; lower per-unit cost.' },
  { value: 'ON_DEMAND', label: 'On demand', hint: 'Small / made-to-order batches.' },
  { value: 'BOTH', label: 'Both', hint: 'Offer bulk and on-demand for this combo.' },
]

export const STATUS_OPTIONS: Array<{ value: OfferingStatus; label: string; hint: string }> = [
  { value: 'DRAFT', label: 'Draft', hint: 'Not yet visible — still being set up.' },
  { value: 'PENDING_REVIEW', label: 'Submit for review', hint: 'Send to admin for verification.' },
  { value: 'ACTIVE', label: 'Active', hint: 'Live and selectable by creators.' },
  { value: 'ARCHIVED', label: 'Archived', hint: 'Retired; existing product links preserved.' },
]

export const STATUS_LABELS: Record<OfferingStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  PENDING_REVIEW: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
}

export const CONTAINER_CATEGORY_LABELS: Record<ContainerCategory, string> = {
  BOTTLE: 'Bottle',
  JAR: 'Jar',
  CAN: 'Can',
  TUBE: 'Tube',
  POUCH: 'Pouch',
  SACHET: 'Sachet',
  STICK_PACK: 'Stick pack',
  BOX: 'Box',
  CARTON: 'Carton',
  CASE: 'Case',
  OTHER: 'Other',
}

export function decorationLabel(m: DecorationMethod): string {
  return DECORATION_LABELS[m] ?? m
}

export function fulfillmentLabel(m: FulfillmentMode): string {
  return FULFILLMENT_OPTIONS.find((o) => o.value === m)?.label ?? m
}

/** First-tier price preview, e.g. "$1.20/unit". pricingTiers is a Json column. */
export function firstTierPriceLabel(tiers: unknown): string {
  if (!Array.isArray(tiers) || tiers.length === 0) return '—'
  const sorted = [...(tiers as PricingTier[])].sort((a, b) => a.minQty - b.minQty)
  const cents = sorted[0]?.pricePerUnitCents
  return typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}/unit` : '—'
}

/** Validate + normalize a pricing-tiers array. Returns the cleaned array or an error. */
export function validatePricingTiers(
  raw: unknown,
): { ok: true; tiers: PricingTier[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'Add at least one pricing tier.' }
  }
  const tiers: PricingTier[] = []
  for (const t of raw) {
    const minQty = Number((t as PricingTier)?.minQty)
    const pricePerUnitCents = Number((t as PricingTier)?.pricePerUnitCents)
    if (!Number.isInteger(minQty) || minQty < 1) {
      return { ok: false, error: 'Every tier needs a whole-number min quantity of 1 or more.' }
    }
    if (!Number.isInteger(pricePerUnitCents) || pricePerUnitCents < 1) {
      return { ok: false, error: 'Every tier needs a price per unit of at least 1 cent.' }
    }
    tiers.push({ minQty, pricePerUnitCents })
  }
  // Sort ascending by minQty and reject duplicate breakpoints.
  tiers.sort((a, b) => a.minQty - b.minQty)
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.minQty === tiers[i - 1]!.minQty) {
      return { ok: false, error: 'Two tiers share the same min quantity — make breakpoints distinct.' }
    }
  }
  return { ok: true, tiers }
}
