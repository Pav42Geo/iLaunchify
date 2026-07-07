// Manufacturer Merit — nightly snapshot sweep (docs/MANUFACTURER_MERIT_ENGINE.md,
// MM-2). Computes each manufacturer's standing and writes a PartnerMeritSnapshot.
//
// SHADOW-MODE by design: this NEVER changes Partner.tier or any fee. It records
// what standing WOULD be and logs the hysteresis recommendation, so admins can
// watch the model against reality before MM-5 flips assignment live (gated on
// MeritPolicy.enabled). Nothing here touches economics.

import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import {
  computeMeritScore,
  recommendBadgeChange,
  deriveCohortFromSignals,
  loadManufacturerMeritSignals,
  standingFrozen,
  DEFAULT_MERIT_POLICY,
  type MeritSignals,
  type MeritPolicy,
  type MeritBadge,
  type BadgeSnapshotRef,
  type RatingAppealStatus,
} from '@ilaunchify/orders'

export interface MeritSweepResult {
  manufacturers: number
  snapshots: number
  wouldPromote: number
  wouldDemote: number
  live: boolean
}

interface MeritPolicyRow {
  craftWeight: number; reliabilityWeight: number; contributionWeight: number; standingWeight: number
  trustedThreshold: number; premierThreshold: number
  trustedMinOrders: number; trustedMinMonths: number
  premierMinOrders: number; premierMinMonths: number; premierMaxDefectPer100: number
  opsConfidence: number
  verifiedFeeBps: number; trustedFeeBps: number; premierFeeBps: number
  promoteSustainDays: number; demoteMissDays: number; graceDays: number
  enabled: boolean
}

function policyOf(row: MeritPolicyRow | null): { policy: MeritPolicy; promoteSustainDays: number; demoteMissDays: number; graceDays: number; enabled: boolean } {
  if (!row) {
    return { policy: DEFAULT_MERIT_POLICY, promoteSustainDays: 30, demoteMissDays: 60, graceDays: 60, enabled: false }
  }
  return {
    policy: {
      weights: { craft: row.craftWeight, reliability: row.reliabilityWeight, contribution: row.contributionWeight, standing: row.standingWeight },
      thresholds: { trusted: row.trustedThreshold, premier: row.premierThreshold },
      evidence: {
        trustedMinOrders: row.trustedMinOrders, trustedMinMonths: row.trustedMinMonths,
        premierMinOrders: row.premierMinOrders, premierMinMonths: row.premierMinMonths,
        premierMaxDefectPer100: row.premierMaxDefectPer100,
      },
      opsConfidence: row.opsConfidence,
      feeBpsByBadge: { VERIFIED: row.verifiedFeeBps, TRUSTED: row.trustedFeeBps, PREMIER: row.premierFeeBps },
    },
    promoteSustainDays: row.promoteSustainDays,
    demoteMissDays: row.demoteMissDays,
    graceDays: row.graceDays,
    enabled: row.enabled,
  }
}

export async function runMeritSnapshotSweep(now: Date = new Date()): Promise<MeritSweepResult> {
  const result: MeritSweepResult = { manufacturers: 0, snapshots: 0, wouldPromote: 0, wouldDemote: 0, live: false }

  const policyRow = await prisma.meritPolicy.findUnique({ where: { id: 1 } }).catch(() => null)
  const { policy, promoteSustainDays, demoteMissDays, graceDays, enabled } = policyOf(policyRow)
  result.live = enabled // MM-5 will consume this to actually assign; MM-2 stays shadow regardless

  const services = await prisma.partnerService.findMany({
    where: { type: 'MANUFACTURING', status: 'ACTIVE', partner: { status: 'ACTIVE' } },
    select: { id: true, partner: { select: { tier: true } } },
  })
  result.manufacturers = services.length
  if (services.length === 0) return result

  // Pass 1 — raw signals for every manufacturer (cohort needs the batch).
  const rows: Array<{ serviceId: string; currentBadge: MeritBadge; signals: MeritSignals }> = []
  for (const svc of services) {
    const signals = await loadManufacturerMeritSignals(svc.id, now).catch(() => null)
    if (signals) rows.push({ serviceId: svc.id, currentBadge: svc.partner.tier as MeritBadge, signals })
  }
  const cohort = deriveCohortFromSignals(rows.map((r) => r.signals))

  // Pass 2 — score, write snapshot (shadow), recommend (log only).
  const snapWriter = prisma.partnerMeritSnapshot

  for (const r of rows) {
    try {
      const inGrace = r.signals.monthsActive * 30 < graceDays
      const merit = computeMeritScore({ ...r.signals, inGrace }, policy, cohort)

      // MM-4 — an OPEN rating appeal freezes standing (defers demotion). The
      // appeal FSM/freeze rule is pure; here we just feed it the open appeals.
      // Cast-guarded until the MM-4a RatingAppeal table migrates (no appeals →
      // frozen=false, so this is inert until MM-4b wires the file/adjudicate flow).
      const openAppeals = await (prisma as unknown as {
        ratingAppeal: { findMany: (a: unknown) => Promise<Array<{ status: RatingAppealStatus }>> }
      }).ratingAppeal
        .findMany({ where: { partnerServiceId: r.serviceId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }, select: { status: true } })
        .catch(() => [] as Array<{ status: RatingAppealStatus }>)
      const demoteBlocked = inGrace || standingFrozen(openAppeals)

      await snapWriter.create({
        data: {
          partnerServiceId: r.serviceId,
          meritScore: merit.meritScore,
          craftScore: merit.pillars.craft,
          reliabilityScore: merit.pillars.reliability,
          contributionScore: merit.pillars.contribution,
          standingScore: merit.pillars.standing,
          qualifiedBadge: merit.qualifiedBadge,
          cohortKey: 'GLOBAL',
          ordersCompleted: r.signals.ordersCompleted,
          monthsActive: r.signals.monthsActive,
          defectRatePer100: r.signals.defectRatePer100,
          gapsJson: merit.gaps,
          computedAt: now,
        },
      }).catch(() => {})
      result.snapshots += 1

      const history = await snapWriter
        .findMany({ where: { partnerServiceId: r.serviceId }, select: { qualifiedBadge: true, computedAt: true }, orderBy: { computedAt: 'desc' }, take: 90 })
        .catch(() => [] as BadgeSnapshotRef[])

      const rec = recommendBadgeChange(r.currentBadge, history, policy, {
        now, promoteSustainDays, demoteMissDays, inGrace: demoteBlocked,
      })
      if (rec.action === 'PROMOTE') result.wouldPromote += 1
      if (rec.action === 'DEMOTE') result.wouldDemote += 1

      // SHADOW: log the recommendation, never assign. MM-5 acts on `enabled`.
      if (rec.action !== 'HOLD') {
        await logSystemAudit({
          entityType: 'PartnerMeritSnapshot',
          entityId: r.serviceId,
          action: enabled ? 'MERIT_BADGE_RECOMMENDED_LIVE_PENDING' : 'MERIT_BADGE_RECOMMENDED_SHADOW',
          payload: { from: rec.from, to: rec.to, action: rec.action, reason: rec.reason, meritScore: merit.meritScore },
        })
      }
    } catch {
      // one manufacturer's failure never sinks the sweep
    }
  }

  return result
}
