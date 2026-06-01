import { prisma } from '@ilaunchify/db'
import { buildSamplePricingRows, type PricingTierRow } from '@ilaunchify/ui'

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
  }))
}

function formatBand(minQty: number, maxQty: number | null): string {
  if (maxQty === null) return `${minQty.toLocaleString()}+`
  return `${minQty.toLocaleString()} – ${maxQty.toLocaleString()}`
}
