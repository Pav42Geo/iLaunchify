// AFE P2b — server-side read of the learned fulfillment signal + admin policy,
// shared by BOTH checkout paths (fulfillment-actions display + cart-actions Pay)
// so the learned tilt is applied identically (shown pick == paid pick).
// Shadow-inert unless OrderSettings.fcLearningEnabled. Best-effort: any failure
// returns a no-op adjustment. docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md.

import { prisma } from '@ilaunchify/db'
import {
  learnedFulfillmentAdjustment,
  classifyFcOverride,
  scoreAndSelectFc,
  PUBLIC_FC_PARTNER_FILTER,
  type LearnedAdjustment,
  type FcCandidate,
  type FcScoringWeights,
} from '@ilaunchify/orders'

const NONE: LearnedAdjustment = { lean: 'NONE', adjustmentPct: 0 }

// Neutral scorer weights for the override baseline — the DECLARED preference and
// learned tilt are intentionally NOT applied here: we measure the creator's
// revealed lean relative to the un-tilted algorithmic pick. Falls back to the
// spec §5 defaults when the OrderSettings row is missing.
const NEUTRAL_FC_DEFAULTS: FcScoringWeights = {
  costWeightPct: 35,
  distanceWeightPct: 15,
  slaWeightPct: 15,
  capacityWeightPct: 15,
  rotationWeightPct: 10,
  storageMatchWeightPct: 10,
  rotationBandPct: 5,
}

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

/**
 * P2b-write — capture an FC OVERRIDE at Pay to feed the learned signal. Runs ONLY
 * when the creator explicitly picked a specific center (not the auto-pick). Fully
 * self-contained + BEST-EFFORT: every path is guarded so it can NEVER affect the
 * order. Rebuilds the NEUTRAL algorithmic suggestion (no preference/learned tilt,
 * no rotation) and compares its distance to the picked center — farther = a
 * cost/coverage lean, nearer = a speed lean — then increments the rolling counter.
 */
export async function recordFcOverrideSignal(input: {
  userId: string
  pickedWarehouseId: string
  manufacturerServiceId: string | null
  storageClass: string
  hazmatClass: string
  domain: string
}): Promise<void> {
  try {
    const now = new Date()
    const [origin, weightRow, rows, profile] = await Promise.all([
      input.manufacturerServiceId
        ? prisma.partnerService
            .findUnique({
              where: { id: input.manufacturerServiceId },
              select: { facilityLat: true, facilityLng: true, partner: { select: { state: true } } },
            })
            .catch(() => null)
        : Promise.resolve(null),
      prisma.orderSettings
        .findUnique({
          where: { id: 'default' },
          select: {
            fcCostWeightPct: true,
            fcDistanceWeightPct: true,
            fcSlaWeightPct: true,
            fcCapacityWeightPct: true,
            fcRotationWeightPct: true,
            fcStorageMatchWeightPct: true,
            fcRotationBandPct: true,
          },
        })
        .catch(() => null),
      prisma.partnerService.findMany({
        where: { type: 'WAREHOUSE', status: 'ACTIVE', ...PUBLIC_FC_PARTNER_FILTER },
        select: {
          id: true,
          storageClasses: true,
          hazmatAccepted: true,
          fcCertifications: true,
          weeklyPalletCapacity: true,
          facilityLat: true,
          facilityLng: true,
          partner: { select: { companyName: true, city: true, state: true } },
          blackoutDates: { where: { startsOn: { lte: now }, endsOn: { gte: now } }, select: { id: true }, take: 1 },
        },
      }),
      prisma.creatorProfile.findUnique({ where: { userId: input.userId }, select: { id: true } }),
    ])
    if (!profile) return

    const candidates: FcCandidate[] = rows.map((w) => ({
      partnerServiceId: w.id,
      partnerName: w.partner.companyName,
      city: w.partner.city,
      state: w.partner.state,
      storageClasses: w.storageClasses,
      hazmatAccepted: w.hazmatAccepted,
      fcCertifications: w.fcCertifications,
      weeklyPalletCapacity: w.weeklyPalletCapacity,
      facilityLat: w.facilityLat,
      facilityLng: w.facilityLng,
      blackedOut: w.blackoutDates.length > 0,
    }))
    if (candidates.length < 2) return // no meaningful alternative to compare against

    const weights: FcScoringWeights = weightRow
      ? {
          costWeightPct: weightRow.fcCostWeightPct,
          distanceWeightPct: weightRow.fcDistanceWeightPct,
          slaWeightPct: weightRow.fcSlaWeightPct,
          capacityWeightPct: weightRow.fcCapacityWeightPct,
          rotationWeightPct: weightRow.fcRotationWeightPct,
          storageMatchWeightPct: weightRow.fcStorageMatchWeightPct,
          rotationBandPct: weightRow.fcRotationBandPct,
        }
      : NEUTRAL_FC_DEFAULTS

    const selection = scoreAndSelectFc(
      candidates,
      {
        storageClass: input.storageClass,
        hazmatClass: input.hazmatClass,
        domain: input.domain,
        pallets: 0,
        originLat: origin?.facilityLat ?? null,
        originLng: origin?.facilityLng ?? null,
        originState: origin?.partner.state ?? null,
      },
      { weights, history: {}, totalRecentAwards: 0 }, // neutral: no rotation, no tilt
    )
    const winner = selection.winner
    if (!winner || winner.ranked.candidate.partnerServiceId === input.pickedWarehouseId) return // not an override

    const picked = selection.scored.find(
      (s) => s.ranked.candidate.partnerServiceId === input.pickedWarehouseId,
    )
    const cls = classifyFcOverride(winner.ranked.distanceMiles, picked?.ranked.distanceMiles ?? null)
    if (cls === 'NEUTRAL') return

    await prisma.creatorFulfillmentSignal.upsert({
      where: { creatorProfileId: profile.id },
      create: {
        creatorProfileId: profile.id,
        fartherCount: cls === 'FARTHER' ? 1 : 0,
        nearerCount: cls === 'NEARER' ? 1 : 0,
      },
      update: cls === 'FARTHER' ? { fartherCount: { increment: 1 } } : { nearerCount: { increment: 1 } },
    })
  } catch {
    // Best-effort — a learning-signal failure must never affect checkout.
  }
}
