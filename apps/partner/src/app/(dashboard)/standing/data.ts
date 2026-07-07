// Partner "Your standing" — data (MM-6, docs/MANUFACTURER_MERIT_ENGINE.md §7).
// The manufacturer-facing view of the merit engine: current badge, the four
// pillars, the path to the next badge, the fee each badge unlocks, and the
// ratings they can contest. Read-only + honest: while the engine runs in shadow
// the badge is a PROJECTION (labeled as such), and thin history never penalizes.

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import {
  DEFAULT_MERIT_POLICY,
  resolveManufacturerFeeBps,
  resolveActivePromo,
  feeBpsToPct,
  type MeritPolicy,
  type MeritBadge,
  type GraceUnit,
  type FeeGrantLike,
} from '@ilaunchify/orders'

export interface StandingPillar {
  key: 'craft' | 'reliability' | 'contribution' | 'standing'
  label: string
  hint: string
  weightPct: number
  score: number | null // 0–100, null = no snapshot yet
}

export interface ContestableRating {
  id: string
  overall: number
  roleLabel: string
  comment: string | null
  createdAt: string
  excluded: boolean
  appealStatus: string | null // null = no appeal filed
}

export interface StandingView {
  serviceId: string
  serviceLabel: string
  hasSnapshot: boolean
  currentBadge: MeritBadge
  projectedBadge: MeritBadge
  meritScore: number | null
  pillars: StandingPillar[]
  gaps: string[] // engine-computed path to the next badge
  ordersCompleted: number
  monthsActive: number
  feeNowPct: string
  feeProjectedPct: string
  /** Active fee grace/promo, if any — overrides the fee for a window. */
  promo: { feePct: string; source: 'MANUAL_GRANT' | 'GLOBAL_GRACE'; endsAt: string } | null
}

export interface StandingPage {
  live: boolean // MeritPolicy.enabled — badge economics active vs. preview
  baseFeePct: string
  feeLadder: { badge: MeritBadge; label: string; pct: string; blurb: string }[]
  services: StandingView[]
  ratings: ContestableRating[]
  hasManufacturing: boolean
}

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print production',
  WAREHOUSE: 'Fulfillment',
}
const RATING_ROLE_LABEL: Record<string, string> = {
  MANUFACTURER: 'Manufacturing', PRINTER: 'Print', COPACKER: 'Co-packing', WAREHOUSE: 'Fulfillment',
}
const PILLAR_META: { key: StandingPillar['key']; label: string; hint: string }[] = [
  { key: 'craft', label: 'Craft', hint: 'Product quality — buyer ratings and a low defect / reprint rate.' },
  { key: 'reliability', label: 'Reliability', hint: 'Accepting orders and delivering on time, with few strikes.' },
  { key: 'contribution', label: 'Contribution', hint: 'Your footprint on the platform — completed orders and live products.' },
  { key: 'standing', label: 'Standing', hint: 'Tenure and a clean recent record — trust built over time.' },
]

export async function loadStandingPage(): Promise<StandingPage> {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)

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
  const live = policyRow?.enabled ?? false
  const baseFeeBps = (await getOrderSettings().catch(() => null))?.productionFeeBps ?? 500

  // MM-7 — global fee-grace policy (cast-guarded until the migration lands).
  const pg = policyRow as unknown as { feeGraceEnabled?: boolean; feeGraceValue?: number; feeGraceUnit?: GraceUnit; feeGraceFeeBps?: number } | null
  const grace = { enabled: pg?.feeGraceEnabled ?? false, value: pg?.feeGraceValue ?? 0, unit: (pg?.feeGraceUnit ?? 'MONTHS') as GraceUnit, feeBps: pg?.feeGraceFeeBps ?? 0 }
  const now = new Date()

  const feeLadder: StandingPage['feeLadder'] = [
    { badge: 'VERIFIED', label: 'Verified', pct: feeBpsToPct(policy.feeBpsByBadge.VERIFIED), blurb: 'Everyone starts here on day one.' },
    { badge: 'TRUSTED', label: 'Trusted', pct: feeBpsToPct(policy.feeBpsByBadge.TRUSTED), blurb: 'Proven volume and quality over time.' },
    { badge: 'PREMIER', label: 'Premier', pct: feeBpsToPct(policy.feeBpsByBadge.PREMIER), blurb: 'Top standing — zero platform fee.' },
  ]

  const empty: StandingPage = { live, baseFeePct: feeBpsToPct(baseFeeBps), feeLadder, services: [], ratings: [], hasManufacturing: false }
  if (!access || access.serviceIds.length === 0) return empty

  // Merit is manufacturing-only (the sweep filters MANUFACTURING).
  const services = await prisma.partnerService.findMany({
    where: { id: { in: access.serviceIds }, type: 'MANUFACTURING' },
    select: { id: true, type: true, partner: { select: { tier: true } } },
  })
  if (services.length === 0) return empty
  const svcIdList = services.map((s) => s.id)

  // MM-7 — activation anchor (global grace) + manual grants (both cast-guarded).
  const activatedAt =
    (await (prisma as unknown as { partner: { findUnique: (a: unknown) => Promise<{ activatedAt: Date | null } | null> } }).partner
      .findUnique({ where: { id: access.partnerId }, select: { activatedAt: true } })
      .catch(() => null))?.activatedAt ?? null
  const allGrants = await (prisma as unknown as {
    manufacturerFeeGrant: { findMany: (a: unknown) => Promise<Array<{ partnerServiceId: string; feeBps: number; startsAt: Date; endsAt: Date; revokedAt: Date | null }>> }
  }).manufacturerFeeGrant
    .findMany({ where: { partnerServiceId: { in: svcIdList }, revokedAt: null } })
    .catch(() => [] as Array<{ partnerServiceId: string; feeBps: number; startsAt: Date; endsAt: Date; revokedAt: Date | null }>)

  const views: StandingView[] = []
  for (const svc of services) {
    const snap = await prisma.partnerMeritSnapshot
      .findFirst({ where: { partnerServiceId: svc.id }, orderBy: { computedAt: 'desc' } })
      .catch(() => null)
    const currentBadge = (svc.partner.tier ?? 'VERIFIED') as MeritBadge
    const projectedBadge = (snap?.qualifiedBadge ?? currentBadge) as MeritBadge
    // Active promo for this service (manual grant wins > global grace) overrides the fee.
    const manualGrants: FeeGrantLike[] = allGrants.filter((g) => g.partnerServiceId === svc.id).map((g) => ({ feeBps: g.feeBps, startsAt: g.startsAt, endsAt: g.endsAt, revokedAt: g.revokedAt }))
    const activePromo = resolveActivePromo({ now, activatedAt, grace, manualGrants })
    const feeNow = resolveManufacturerFeeBps({ baseProductionFeeBps: baseFeeBps, badge: currentBadge, policy, enabled: live, promoFeeBps: activePromo?.feeBps ?? null })
    const feeProjected = resolveManufacturerFeeBps({ baseProductionFeeBps: baseFeeBps, badge: projectedBadge, policy, enabled: true })
    const pillarScores: Record<string, number | null> = snap
      ? { craft: Number(snap.craftScore), reliability: Number(snap.reliabilityScore), contribution: Number(snap.contributionScore), standing: Number(snap.standingScore) }
      : { craft: null, reliability: null, contribution: null, standing: null }
    views.push({
      serviceId: svc.id,
      serviceLabel: SERVICE_LABEL[svc.type as string] ?? svc.type,
      hasSnapshot: !!snap,
      currentBadge,
      projectedBadge,
      meritScore: snap ? Number(snap.meritScore) : null,
      pillars: PILLAR_META.map((m) => ({
        key: m.key,
        label: m.label,
        hint: m.hint,
        weightPct: policy.weights[m.key],
        score: pillarScores[m.key] ?? null,
      })),
      gaps: snap && Array.isArray(snap.gapsJson) ? (snap.gapsJson as string[]) : [],
      ordersCompleted: snap?.ordersCompleted ?? 0,
      monthsActive: snap?.monthsActive ?? 0,
      feeNowPct: feeBpsToPct(feeNow.bps),
      feeProjectedPct: feeBpsToPct(feeProjected.bps),
      promo: activePromo ? { feePct: feeBpsToPct(activePromo.feeBps), source: activePromo.source, endsAt: activePromo.endsAt.toISOString() } : null,
    })
  }

  // Recent ratings the manufacturer can contest.
  const svcIds = svcIdList
  const ratings = await prisma.partnerRating.findMany({
    where: { partnerServiceId: { in: svcIds } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, overall: true, role: true, comment: true, createdAt: true, excludedAt: true },
  }).catch(() => [])
  const appeals = ratings.length
    ? await prisma.ratingAppeal.findMany({ where: { ratingId: { in: ratings.map((r) => r.id) } }, select: { ratingId: true, status: true } }).catch(() => [])
    : []
  const appealByRating = new Map(appeals.map((a) => [a.ratingId, a.status]))

  return {
    live,
    baseFeePct: feeBpsToPct(baseFeeBps),
    feeLadder,
    services: views,
    hasManufacturing: true,
    ratings: ratings.map((r) => ({
      id: r.id,
      overall: Number(r.overall),
      roleLabel: RATING_ROLE_LABEL[r.role] ?? r.role,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      excluded: r.excludedAt != null,
      appealStatus: appealByRating.get(r.id) ?? null,
    })),
  }
}
