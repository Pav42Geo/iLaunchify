// Manufacturer Merit console — data (docs/MANUFACTURER_MERIT_ENGINE.md, MM-3).
// Reads the latest PartnerMeritSnapshot per manufacturer (written nightly by the
// shadow-mode sweep) + the current MeritPolicy. Read-only; the console tunes the
// policy and simulates against these snapshots without recomputing signals.

import { prisma } from '@ilaunchify/db'
import { DEFAULT_MERIT_POLICY, type MeritPolicy, type MeritBadge } from '@ilaunchify/orders'

export interface MeritRow {
  serviceId: string
  companyName: string
  currentBadge: MeritBadge // Partner.tier today (hand-set until MM-5 flips assignment)
  qualifiedBadge: MeritBadge // what the engine says (shadow)
  meritScore: number
  pillars: { craft: number; reliability: number; contribution: number; standing: number }
  ordersCompleted: number
  monthsActive: number
  defectRatePer100: number | null
  gaps: string[]
  computedAt: string
}

export interface MeritConsole {
  policy: MeritPolicy
  enabled: boolean
  windows: { promoteSustainDays: number; demoteMissDays: number; graceDays: number }
  rows: MeritRow[]
  /** Distribution of the engine's qualified badge (shadow). */
  distribution: Record<MeritBadge, number>
  /** Where the qualified badge differs from the current hand-set tier. */
  mismatches: number
  hasSnapshots: boolean
}

export async function loadMeritConsole(): Promise<MeritConsole> {
  const policyRow = await prisma.meritPolicy.findUnique({ where: { id: 1 } }).catch(() => null)
  const policy: MeritPolicy = policyRow
    ? {
        weights: { craft: policyRow.craftWeight, reliability: policyRow.reliabilityWeight, contribution: policyRow.contributionWeight, standing: policyRow.standingWeight },
        thresholds: { trusted: policyRow.trustedThreshold, premier: policyRow.premierThreshold },
        evidence: {
          trustedMinOrders: policyRow.trustedMinOrders, trustedMinMonths: policyRow.trustedMinMonths,
          premierMinOrders: policyRow.premierMinOrders, premierMinMonths: policyRow.premierMinMonths,
          premierMaxDefectPer100: policyRow.premierMaxDefectPer100,
        },
        opsConfidence: policyRow.opsConfidence,
        feeBpsByBadge: { VERIFIED: policyRow.verifiedFeeBps, TRUSTED: policyRow.trustedFeeBps, PREMIER: policyRow.premierFeeBps },
      }
    : DEFAULT_MERIT_POLICY
  const windows = {
    promoteSustainDays: policyRow?.promoteSustainDays ?? 30,
    demoteMissDays: policyRow?.demoteMissDays ?? 60,
    graceDays: policyRow?.graceDays ?? 60,
  }
  const enabled = policyRow?.enabled ?? false

  // Latest snapshot per manufacturer service.
  const snaps = await prisma.partnerMeritSnapshot
    .findMany({
      distinct: ['partnerServiceId'],
      orderBy: [{ partnerServiceId: 'asc' }, { computedAt: 'desc' }],
      select: {
        partnerServiceId: true, meritScore: true, craftScore: true, reliabilityScore: true,
        contributionScore: true, standingScore: true, qualifiedBadge: true, ordersCompleted: true,
        monthsActive: true, defectRatePer100: true, gapsJson: true, computedAt: true,
      },
    })
    .catch(() => [])

  const services = snaps.length
    ? await prisma.partnerService.findMany({
        where: { id: { in: snaps.map((s) => s.partnerServiceId) } },
        select: { id: true, partner: { select: { companyName: true, tier: true } } },
      })
    : []
  const svcById = new Map(services.map((s) => [s.id, s]))

  const distribution: Record<MeritBadge, number> = { VERIFIED: 0, TRUSTED: 0, PREMIER: 0 }
  let mismatches = 0
  const rows: MeritRow[] = snaps.map((s) => {
    const svc = svcById.get(s.partnerServiceId)
    const currentBadge = (svc?.partner.tier ?? 'VERIFIED') as MeritBadge
    const qualifiedBadge = s.qualifiedBadge as MeritBadge
    distribution[qualifiedBadge] += 1
    if (qualifiedBadge !== currentBadge) mismatches += 1
    return {
      serviceId: s.partnerServiceId,
      companyName: svc?.partner.companyName ?? '(unknown)',
      currentBadge,
      qualifiedBadge,
      meritScore: Number(s.meritScore),
      pillars: {
        craft: Number(s.craftScore),
        reliability: Number(s.reliabilityScore),
        contribution: Number(s.contributionScore),
        standing: Number(s.standingScore),
      },
      ordersCompleted: s.ordersCompleted,
      monthsActive: s.monthsActive,
      defectRatePer100: s.defectRatePer100 == null ? null : Number(s.defectRatePer100),
      gaps: Array.isArray(s.gapsJson) ? (s.gapsJson as string[]) : [],
      computedAt: s.computedAt.toISOString(),
    }
  })
  rows.sort((a, b) => b.meritScore - a.meritScore)

  return { policy, enabled, windows, rows, distribution, mismatches, hasSnapshots: snaps.length > 0 }
}
