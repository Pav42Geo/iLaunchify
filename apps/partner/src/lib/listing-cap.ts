// PT-4 (docs/PARTNER_TIER_VS_MERIT.md decision C) — enforce the earned-badge
// product-listing cap. A manufacturer's Merit badge unlocks how many active
// product/template listings they may hold, via the partner plan's
// `max_active_listings` perk (Verified 3; Trusted/Premier per config; null =
// unlimited). Fail-OPEN when the cap is unconfigured or the plan is missing —
// a listing cap should never hard-block because seed data is absent.

import { prisma } from '@ilaunchify/db'
import { getFeatureLimit, partnerTierToPlanCode } from '@ilaunchify/plans'

export type ListingCapResult = { ok: true } | { ok: false; error: string }

/**
 * Check whether a partner may create one more product listing. `serviceIds` are
 * the partner's PartnerService ids (products link via `manufacturerServiceId`).
 * Archived/rejected templates don't count against the cap.
 */
export async function checkListingCapacity(partnerId: string, serviceIds: string[]): Promise<ListingCapResult> {
  if (serviceIds.length === 0) return { ok: true }

  const tierRow = await prisma.partner.findUnique({ where: { id: partnerId }, select: { tier: true } }).catch(() => null)
  const tierKey = String(tierRow?.tier ?? 'VERIFIED').toLowerCase() as 'verified' | 'trusted' | 'premier'
  const cap = await getFeatureLimit(partnerTierToPlanCode(tierKey), 'max_active_listings').catch(() => null)
  if (cap == null) return { ok: true } // unlimited / unconfigured → fail-open

  const active = await prisma.productTemplate.count({
    where: { manufacturerServiceId: { in: serviceIds }, status: { notIn: ['ARCHIVED', 'REJECTED'] } },
  })
  if (active >= cap) {
    return {
      ok: false,
      error: `You've reached your ${cap}-product limit for the ${tierKey} badge. Earn a higher standing badge to list more, or archive an existing product.`,
    }
  }
  return { ok: true }
}
