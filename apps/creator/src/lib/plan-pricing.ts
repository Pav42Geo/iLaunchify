// Live creator-plan pricing for the Studio's UpgradeOverlay (and any other
// surface that shows plan prices / fee rates). SubscriptionPlan is the SSOT
// for prices, FeeRule (via resolveCreatorFeeBps) for the administrative-fee
// rates — both admin-editable, so never hardcode either in copy
// (Pavel 2026-07-21). Server-only: @ilaunchify/plans' barrel imports prisma.

import { prisma } from '@ilaunchify/db'
import { CREATOR_PLAN_CODES, resolveCreatorFeeBps } from '@ilaunchify/plans'
import type { UpgradeOverlayPricing } from '@/app/(studio)/products/[productId]/design/canvas/UpgradeOverlay'

export async function loadCreatorPlanPricing(): Promise<UpgradeOverlayPricing> {
  const [plans, makerFee, builderFee, agencyFee] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: {
        code: {
          in: [CREATOR_PLAN_CODES.maker, CREATOR_PLAN_CODES.builder, CREATOR_PLAN_CODES.agency],
        },
      },
      select: { code: true, monthlyPriceCents: true },
    }),
    resolveCreatorFeeBps('maker'),
    resolveCreatorFeeBps('builder'),
    resolveCreatorFeeBps('agency'),
  ])
  const priceByCode = new Map(plans.map((p) => [p.code, p.monthlyPriceCents]))
  return {
    monthlyPriceCentsByTier: {
      maker: priceByCode.get(CREATOR_PLAN_CODES.maker) ?? 0,
      builder: priceByCode.get(CREATOR_PLAN_CODES.builder) ?? 0,
      agency: priceByCode.get(CREATOR_PLAN_CODES.agency) ?? 0,
    },
    feeBpsByTier: {
      maker: makerFee.feeBps,
      builder: builderFee.feeBps,
      agency: agencyFee.feeBps,
    },
  }
}
