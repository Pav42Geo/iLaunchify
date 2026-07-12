// AFE P2b — server-side read of the learned fulfillment signal + admin policy,
// shared by BOTH checkout paths (fulfillment-actions display + cart-actions Pay)
// so the learned tilt is applied identically (shown pick == paid pick).
// Shadow-inert unless OrderSettings.fcLearningEnabled. Best-effort: any failure
// returns a no-op adjustment. docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md.

import { prisma } from '@ilaunchify/db'
import { learnedFulfillmentAdjustment, type LearnedAdjustment } from '@ilaunchify/orders'

const NONE: LearnedAdjustment = { lean: 'NONE', adjustmentPct: 0 }

export async function loadLearnedFulfillmentAdjustment(userId: string): Promise<LearnedAdjustment> {
  try {
    const [policyRow, profile] = await Promise.all([
      prisma.orderSettings
        .findUnique({
          where: { id: 'default' },
          select: { fcLearningEnabled: true, fcLearningMinEvents: true, fcLearningMaxAdjustmentPct: true },
        })
        .catch(() => null),
      prisma.creatorProfile
        .findUnique({
          where: { userId },
          select: { fulfillmentSignal: { select: { fartherCount: true, nearerCount: true } } },
        })
        .catch(() => null),
    ])
    if (!policyRow?.fcLearningEnabled) return NONE
    return learnedFulfillmentAdjustment(profile?.fulfillmentSignal ?? { fartherCount: 0, nearerCount: 0 }, {
      enabled: policyRow.fcLearningEnabled,
      minEvents: policyRow.fcLearningMinEvents,
      maxAdjustmentPct: policyRow.fcLearningMaxAdjustmentPct,
    })
  } catch {
    return NONE
  }
}
