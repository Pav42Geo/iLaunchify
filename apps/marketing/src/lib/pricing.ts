import { prisma, getOrderSettings } from '@ilaunchify/db'
import { buildSamplePricingRows, applyFlavorChangeover, type PricingTierRow, type PackBuilderFlavor } from '@ilaunchify/ui'
import { creatorTierToPlanCode, lookupFeeRate, FEE_EVENTS } from '@ilaunchify/plans'
import type { TierKey } from '@ilaunchify/auth'

// D5 multi-flavor lead-time model now lives in @ilaunchify/ui (shared with the
// creator checkout pack-builder). Re-exported here for existing callers.
export { applyFlavorChangeover } from '@ilaunchify/ui'

/**
 * Variety-pack builder data for a ProductTemplate. The configurator renders the
 * PackBuilder only when `flavorMode === 'MULTI'`; otherwise it keeps the single
 * FlavorSwatch. `changeoverDays` (OrderSettings) drives the live D5 lead-time.
 */
export interface PackBuilderData {
  flavorMode: 'SINGLE' | 'MULTI'
  maxFlavorsPerPack: number | null
  pool: PackBuilderFlavor[]
  changeoverDays: number
}

export async function getPackBuilderData(slug: string): Promise<PackBuilderData> {
  const [template, settings] = await Promise.all([
    prisma.productTemplate.findUnique({
      where: { slug },
      select: {
        maxFlavorsPerPack: true,
        packingProfile: { select: { flavorMode: true } },
        flavorPresets: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, swatchHex: true, statementOfIdentity: true },
        },
      },
    }),
    getOrderSettings(),
  ])
  if (!template) {
    return { flavorMode: 'SINGLE', maxFlavorsPerPack: null, pool: [], changeoverDays: settings.changeoverDays }
  }
  return {
    flavorMode: template.packingProfile?.flavorMode === 'MULTI' ? 'MULTI' : 'SINGLE',
    maxFlavorsPerPack: template.maxFlavorsPerPack,
    pool: template.flavorPresets.map((f) => ({
      id: f.id,
      name: f.name,
      swatchHex: f.swatchHex,
      statementOfIdentity: f.statementOfIdentity,
    })),
    changeoverDays: settings.changeoverDays,
  }
}

/**
 * Server helper — real per-unit pricing for a ProductTemplate, by quantity band.
 *
 * Reads ProductTemplatePricingTier (the partner/admin-curated volume bands) and
 * maps them to the display shape. Per MARKETPLACE_MANAGEMENT_PLAN §4 step 1,
 * falls through to the synthetic buildSamplePricingRows() ONLY when the template
 * has no real tiers — which today also covers fixture-only demo templates that
 * aren't in the DB yet (the marketplace detail page is still fixture-driven).
 *
 * One price per band per the LOCKED model (§6): the band sets the unit price;
 * a creator's Builder/Agency tier discounts the platform fee, not this cost.
 */
export async function getPricingTierRows(
  slug: string,
  fallbackBasePrice: number,
  /**
   * D5 — the number of DISTINCT flavors in the configured pack. Default 1 (a
   * single-flavor order), which is a no-op for the changeover increment. The
   * variety-pack builder passes the live distinct-flavor count so each band's
   * lead time reflects the changeovers. `changeoverDays` is read from
   * OrderSettings unless supplied (e.g. when the caller already loaded it).
   */
  opts?: { flavorCount?: number; changeoverDays?: number },
): Promise<PricingTierRow[]> {
  const template = await prisma.productTemplate.findUnique({
    where: { slug },
    select: {
      pricingTiers: {
        orderBy: { sortOrder: 'asc' },
        select: {
          minQty: true,
          maxQty: true,
          perUnitCostCents: true,
          perUnitFloorCents: true,
          leadTimeDays: true,
        },
      },
    },
  })

  const tiers = template?.pricingTiers ?? []
  if (tiers.length === 0) return buildSamplePricingRows(fallbackBasePrice)

  const flavorCount = opts?.flavorCount ?? 1
  // Only pay for the settings read when the changeover increment can actually
  // apply (multi-flavor) and the caller didn't already supply the knob.
  const changeoverDays =
    opts?.changeoverDays ?? (flavorCount > 1 ? (await getOrderSettings()).changeoverDays : 0)

  return tiers.map((t) => ({
    band: formatBand(t.minQty, t.maxQty),
    bandMin: t.minQty,
    perUnitCents: t.perUnitCostCents,
    perUnitFloorCents: t.perUnitFloorCents,
    leadTimeDays: applyFlavorChangeover(t.leadTimeDays, flavorCount, changeoverDays),
  }))
}

function formatBand(minQty: number, maxQty: number | null): string {
  if (maxQty === null) return `${minQty.toLocaleString()}+`
  return `${minQty.toLocaleString()} – ${maxQty.toLocaleString()}`
}

// -----------------------------------------------------------------------------
// P3 — real creator price matrix.
//
// creator per-unit price = manufacturer unit cost (band) + tier-discounted
// platform fee. The fee % comes from lookupFeeRate (the seeded PlanFeature /
// FeeRule table — the source of truth), NOT a hardcoded number. Production
// shipping is excluded here: it's destination/qty-dependent and estimated at
// checkout under the partner-managed-carrier model (V1). docs/builds/
// _platform-v1-finish-line.md P3.
// -----------------------------------------------------------------------------

export interface CreatorPricingMatrix {
  rows: PricingTierRow[]
  /** Platform-fee percent applied at the viewer's tier (from lookupFeeRate). */
  feePercent: number
  /** Tier the price was computed at (signed-out → 'maker'). */
  viewerTier: TierKey
}

// Fallback if the production-order fee rule isn't seeded for the plan — use the
// Maker headline rate so we never under-quote the platform fee.
const FALLBACK_FEE_PERCENT = 15

export async function getCreatorPricingMatrix(
  slug: string,
  viewerTier: TierKey,
  fallbackBasePrice: number,
): Promise<CreatorPricingMatrix> {
  // Base = manufacturer unit cost per band (real DB tiers, or synthetic fallback).
  const baseRows = await getPricingTierRows(slug, fallbackBasePrice)

  const feeRule = await lookupFeeRate(
    creatorTierToPlanCode(viewerTier),
    FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL,
  )
  const feePercent = feeRule?.ratePercent ?? FALLBACK_FEE_PERCENT

  const rows: PricingTierRow[] = baseRows.map((r) => {
    const manufacturerCents = r.perUnitCents
    const platformFeeCents = Math.round((manufacturerCents * feePercent) / 100)
    return {
      ...r,
      manufacturerCents,
      platformFeeCents,
      feePercent,
      // All-in creator unit price (shipping excluded — estimated at checkout).
      perUnitCents: manufacturerCents + platformFeeCents,
    }
  })

  return { rows, feePercent, viewerTier }
}

/**
 * Platform-fee % for all three creator tiers — drives the per-tier columns in
 * the marketplace PricingTierModal. Same lookup source as the matrix above.
 */
export async function getCreatorFeePcts(): Promise<{ maker: number; builder: number; agency: number }> {
  const out = { maker: FALLBACK_FEE_PERCENT, builder: FALLBACK_FEE_PERCENT, agency: FALLBACK_FEE_PERCENT }
  await Promise.all(
    (['maker', 'builder', 'agency'] as const).map(async (t) => {
      const r = await lookupFeeRate(creatorTierToPlanCode(t), FEE_EVENTS.PRODUCTION_ORDER_SUBTOTAL)
      if (r?.ratePercent != null) out[t] = r.ratePercent
    }),
  )
  return out
}
