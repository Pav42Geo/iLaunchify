// The ONE server-side read of a manufacturer's price tiers for an ORDER.
//
// WHY (Blocker 2, 2026-07-16): `placeOrder` had ZERO reads of `pricingTiers`. The
// PDP quoted the manufacturer's band price; the till billed `8c + substrate +
// packaging`. On seeded data: $3,076 quoted, $310 charged, 89.9% never collected.
// Only the NON-PACK path, i.e. exactly the single-flavour white-label product an
// N=1 full-service manufacturer sells.
//
// Not 'use server' on purpose: a server-action file may only export async
// functions, which is what stopped the estimate importing the pack math and the
// charge importing the decoration math. Third time is the charm - this file exists
// so both callers share one expression.

import { prisma } from '@ilaunchify/db'
import { tierGoodsCents, type PricingBandInput } from '@ilaunchify/plans'

/**
 * Read a template's price tiers and return the GOODS cents for a quantity.
 * Returns null when the template has no tiers (the caller falls back to the
 * catalog buildup and should treat that as a data gap, not a price).
 *
 * MIRRORS `apps/marketing/src/lib/pricing.ts` getPricingTierRows:
 *   - orderBy sortOrder asc
 *   - NO fulfillmentMode filter
 *
 * That second one is deliberate and worth stating, because it looks like an
 * omission. `ProductTemplatePricingTier` carries a `fulfillmentMode`
 * (BULK_PRODUCTION | ON_DEMAND) inside its @@unique, and the PDP ignores it, so a
 * template with BOTH band sets has them interleaved by sortOrder on the PDP. That
 * is a REAL separate bug (docs/ON_DEMAND_DISAMBIGUATION §1, meaning A1) - but
 * "fixing" it HERE and not on the PDP would re-open the exact quote-vs-charge gap
 * this file closes. Fix it in both places, in one change, or not at all.
 */
export async function resolveTierGoodsCents(
  productTemplateId: string | null,
  quantity: number,
): Promise<number | null> {
  if (!productTemplateId) return null
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        pricingTiers: {
          orderBy: { sortOrder: 'asc' },
          select: { minQty: true, perUnitCostCents: true },
        },
      },
    })
    const bands: PricingBandInput[] = (template?.pricingTiers ?? []).map((t) => ({
      minQty: t.minQty,
      perUnitCents: t.perUnitCostCents,
    }))
    return tierGoodsCents(bands, quantity)
  } catch {
    // A read failure must NOT silently bill the 8c buildup. Null propagates to the
    // COST_BUILDUP fallback, which the caller logs as a cost-floor breach: visible,
    // rather than a quiet 90% under-charge.
    return null
  }
}
