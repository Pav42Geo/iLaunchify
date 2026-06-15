import { prisma } from '@ilaunchify/db'
import { buildSamplePricingRows, type PricingTierRow } from '@ilaunchify/ui'
import { creatorTierToPlanCode, lookupFeeRate, FEE_EVENTS } from '@ilaunchify/plans'
import type { TierKey } from '@ilaunchify/auth'

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

  return tiers.map((t) => ({
    band: formatBand(t.minQty, t.maxQty),
    bandMin: t.minQty,
    perUnitCents: t.perUnitCostCents,
    perUnitFloorCents: t.perUnitFloorCents,
    leadTimeDays: t.leadTimeDays,
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
