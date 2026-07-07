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
  resolveActivePromo,
  DEFAULT_MERIT_POLICY,
  type MeritSignals,
  type MeritPolicy,
  type MeritBadge,
  type BadgeSnapshotRef,
  type RatingAppealStatus,
  type GraceUnit,
  type FeeGrantLike,
} from '@ilaunchify/orders'

export interface MeritSweepResult {
  manufacturers: number
  snapshots: number
  wouldPromote: number
  wouldDemote: number
  live: boolean
  /** MM-8 — badges actually written to Partner.tier this run (0 unless enabled). */
  assigned: number
  /** Manufacturers whose engine change was skipped because a fee-grace promo is active. */
  heldForPromo: number
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
  const result: MeritSweepResult = { manufacturers: 0, snapshots: 0, wouldPromote: 0, wouldDemote: 0, live: false, assigned: 0, heldForPromo: 0 }

  const policyRow = await prisma.meritPolicy.findUnique({ where: { id: 1 } }).catch(() => null)
  const { policy, promoteSustainDays, demoteMissDays, graceDays, enabled } = policyOf(policyRow)
  result.live = enabled // MM-8 consumes this to actually assign; snapshots stay shadow regardless

  // MM-8 — global fee-grace policy: a manufacturer with an active promo is
  // "skipping the engine" and stays at Verified, so we DON'T auto-change its tier.
  const grace = {
    enabled: policyRow?.feeGraceEnabled ?? false,
    value: policyRow?.feeGraceValue ?? 0,
    unit: (policyRow?.feeGraceUnit ?? 'MONTHS') as GraceUnit,
    feeBps: policyRow?.feeGraceFeeBps ?? 0,
  }

  const services = await prisma.partnerService.findMany({
    where: { type: 'MANUFACTURING', status: 'ACTIVE', partner: { status: 'ACTIVE' } },
    select: { id: true, partner: { select: { id: true, tier: true, activatedAt: true } } },
  })
  result.manufacturers = services.length
  if (services.length === 0) return result

  // Active manual grants for all manufacturers this run (for the promo skip).
  const grantRows = await prisma.manufacturerFeeGrant
    .findMany({ where: { partnerServiceId: { in: services.map((s) => s.id) }, revokedAt: null }, select: { partnerServiceId: true, feeBps: true, startsAt: true, endsAt: true, revokedAt: true } })
    .catch(() => [] as Array<{ partnerServiceId: string } & FeeGrantLike>)
  const grantsByService = new Map<string, FeeGrantLike[]>()
  for (const g of grantRows) {
    const list = grantsByService.get(g.partnerServiceId) ?? []
    list.push({ feeBps: g.feeBps, startsAt: g.startsAt, endsAt: g.endsAt, revokedAt: g.revokedAt })
    grantsByService.set(g.partnerServiceId, list)
  }

  // Pass 1 — raw signals for every manufacturer (cohort needs the batch).
  const rows: Array<{ serviceId: string; partnerId: string; activatedAt: Date | null; currentBadge: MeritBadge; signals: MeritSignals }> = []
  for (const svc of services) {
    const signals = await loadManufacturerMeritSignals(svc.id, now).catch(() => null)
    if (signals) rows.push({ serviceId: svc.id, partnerId: svc.partner.id, activatedAt: svc.partner.activatedAt ?? null, currentBadge: svc.partner.tier as MeritBadge, signals })
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
      const openAppeals = await prisma.ratingAppeal
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

      // MM-8 — a manufacturer with an active fee-grace promo is skipping the
      // engine: hold its badge (stays Verified), never auto-change it.
      const activePromo = resolveActivePromo({ now, activatedAt: r.activatedAt, grace, manualGrants: grantsByService.get(r.serviceId) ?? [] })

      if (rec.action === 'HOLD') {
        // nothing to do
      } else if (!enabled) {
        // SHADOW: log the recommendation, never assign.
        await logSystemAudit({
          entityType: 'PartnerMeritSnapshot',
          entityId: r.serviceId,
          action: 'MERIT_BADGE_RECOMMENDED_SHADOW',
          payload: { from: rec.from, to: rec.to, action: rec.action, reason: rec.reason, meritScore: merit.meritScore },
        })
      } else if (activePromo) {
        // LIVE but held — the promo pins them out of engine-driven tier changes.
        result.heldForPromo += 1
        await logSystemAudit({
          entityType: 'Partner',
          entityId: r.partnerId,
          action: 'MERIT_BADGE_HELD_FEE_GRACE',
          payload: { from: rec.from, to: rec.to, action: rec.action, promoSource: activePromo.source, promoEndsAt: activePromo.endsAt.toISOString() },
        })
      } else {
        // LIVE — actually assign the recommended badge to Partner.tier.
        await prisma.partner
          .update({ where: { id: r.partnerId }, data: { tier: rec.to, tierChangedAt: now, tierChangedById: null } })
          .then(() => { result.assigned += 1 })
          .catch(() => undefined)
        await logSystemAudit({
          entityType: 'Partner',
          entityId: r.partnerId,
          action: 'MERIT_BADGE_ASSIGNED',
          fromValue: rec.from,
          toValue: rec.to,
          payload: { action: rec.action, reason: rec.reason, meritScore: merit.meritScore, serviceId: r.serviceId },
        })
      }
    } catch {
      // one manufacturer's failure never sinks the sweep
    }
  }

  return result
}
