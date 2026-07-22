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
//
// MODE-AWARE (2026-07-20, docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md §5.2):
// `ProductTemplatePricingTier.fulfillmentMode` (BULK_PRODUCTION | ON_DEMAND, A1 of
// docs/ON_DEMAND_DISAMBIGUATION) separates two band sets the partner builder
// authors side by side. The old read had NO filter, so a template carrying both
// sets INTERLEAVED them by sortOrder (sortOrder is indexed PER MODE: two rows per
// index). Fixed here and on the PDP (`getPricingTierRows`) and the configure
// surface (`configure-data.ts`) in the SAME change, keeping quote === charge:
//   - default 'BULK_PRODUCTION': every direct creator order is a bulk production
//     order today, and legacy rows default to bulk, so bulk-only templates price
//     byte-identically.
//   - 'ON_DEMAND': the C2.2 channel-order router prices made-to-order production
//     on the manufacturer's on-demand bands. NO fallback across modes: a
//     manufacturer who authored no on-demand bands has not priced on-demand, and
//     null means "refuse", never "borrow the bulk curve".

import { prisma } from '@ilaunchify/db'
import { tierGoodsCents, type PricingBandInput } from '@ilaunchify/plans'

export type TierFulfillmentMode = 'BULK_PRODUCTION' | 'ON_DEMAND'

/**
 * Read a template's price tiers for ONE fulfillment mode and return the GOODS
 * cents for a quantity. Returns null when the template has no tiers in that mode
 * (the caller falls back to the catalog buildup for bulk, or refuses for
 * on-demand, and treats it as a data gap, not a price).
 */
export async function resolveTierGoodsCents(
  productTemplateId: string | null,
  quantity: number,
  mode: TierFulfillmentMode = 'BULK_PRODUCTION',
): Promise<number | null> {
  if (!productTemplateId) return null
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        pricingTiers: {
          where: { fulfillmentMode: mode },
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
