// Manufacturer Merit console — data (docs/MANUFACTURER_MERIT_ENGINE.md, MM-3).
// Reads the latest PartnerMeritSnapshot per manufacturer (written nightly by the
// shadow-mode sweep) + the current MeritPolicy. Read-only; the console tunes the
// policy and simulates against these snapshots without recomputing signals.

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { DEFAULT_MERIT_POLICY, resolveManufacturerFeeBps, feeBpsToPct, type MeritPolicy, type MeritBadge } from '@ilaunchify/orders'

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
  /** Fee this manufacturer pays TODAY (base rate while shadow; current badge if live). */
  feeNowPct: string
  /** Fee they WOULD pay if the engine went live at their qualified badge. */
  feeIfLivePct: string
  /** True when going live would change this manufacturer's fee. */
  feeWouldChange: boolean
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
  /** OrderSettings base production fee (bps) — what everyone pays in shadow mode. */
  baseProductionFeeBps: number
  baseProductionFeePct: string
  /** MM-7 — global fee-grace policy + manual grants + the manufacturer picker. */
  feeGrace: { enabled: boolean; value: number; unit: 'DAYS' | 'MONTHS'; feeBps: number; feePct: string }
  grants: FeeGrantRow[]
  manufacturers: { serviceId: string; name: string }[]
}

export interface FeeGrantRow {
  id: string
  serviceId: string
  companyName: string
  feeBps: number
  feePct: string
  startsAt: string
  endsAt: string
  active: boolean // not revoked and within window
  revoked: boolean
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

  // Base production fee (bps) from OrderSettings — the rate everyone pays while
  // the engine is in shadow. The badge fees only apply once `enabled` flips.
  const baseProductionFeeBps = (await getOrderSettings().catch(() => null))?.productionFeeBps ?? 500

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
    // Fee today (respects the live/shadow flag) vs. the fee they'd pay if the
    // engine went live at their QUALIFIED badge — the revenue-impact preview.
    const feeNow = resolveManufacturerFeeBps({ baseProductionFeeBps, badge: currentBadge, policy, enabled })
    const feeIfLive = resolveManufacturerFeeBps({ baseProductionFeeBps, badge: qualifiedBadge, policy, enabled: true })
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
      feeNowPct: feeBpsToPct(feeNow.bps),
      feeIfLivePct: feeBpsToPct(feeIfLive.bps),
      feeWouldChange: feeIfLive.bps !== feeNow.bps,
    }
  })
  rows.sort((a, b) => b.meritScore - a.meritScore)

  // MM-7 — fee-grace policy.
  const feeGrace = {
    enabled: policyRow?.feeGraceEnabled ?? false,
    value: policyRow?.feeGraceValue ?? 3,
    unit: (policyRow?.feeGraceUnit ?? 'MONTHS') as 'DAYS' | 'MONTHS',
    feeBps: policyRow?.feeGraceFeeBps ?? 0,
    feePct: feeBpsToPct(policyRow?.feeGraceFeeBps ?? 0),
  }

  // All active manufacturers (dropdown for manual grants) + existing grants.
  const mfrs = await prisma.partnerService
    .findMany({ where: { type: 'MANUFACTURING', status: 'ACTIVE' }, select: { id: true, partner: { select: { companyName: true } } }, orderBy: { partner: { companyName: 'asc' } } })
    .catch(() => [])
  const manufacturers = mfrs.map((m) => ({ serviceId: m.id, name: m.partner.companyName }))
  const nameByService = new Map(manufacturers.map((m) => [m.serviceId, m.name]))

  const grantRows = await prisma.manufacturerFeeGrant
    .findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, partnerServiceId: true, feeBps: true, startsAt: true, endsAt: true, revokedAt: true } })
    .catch(() => [] as Array<{ id: string; partnerServiceId: string; feeBps: number; startsAt: Date; endsAt: Date; revokedAt: Date | null }>)
  const nowMs = Date.now()
  const grants: FeeGrantRow[] = grantRows.map((g) => ({
    id: g.id,
    serviceId: g.partnerServiceId,
    companyName: nameByService.get(g.partnerServiceId) ?? '(unknown)',
    feeBps: g.feeBps,
    feePct: feeBpsToPct(g.feeBps),
    startsAt: g.startsAt.toISOString(),
    endsAt: g.endsAt.toISOString(),
    active: g.revokedAt == null && g.startsAt.getTime() <= nowMs && g.endsAt.getTime() > nowMs,
    revoked: g.revokedAt != null,
  }))

  return {
    policy, enabled, windows, rows, distribution, mismatches,
    hasSnapshots: snaps.length > 0,
    baseProductionFeeBps,
    baseProductionFeePct: feeBpsToPct(baseProductionFeeBps),
    feeGrace, grants, manufacturers,
  }
}
