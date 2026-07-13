// Public partner profile ("Front Face") reader — shared by the creator-facing
// marketing route (/partners/[slug]) and the partner app's own /profile
// preview (Pavel 2026-07-12). Prisma-only (no auth deps) — viewer gating stays
// in apps/marketing lib/partner-profile.ts. The @ilaunchify/ui PartnerFrontFace
// component mirrors these VM shapes structurally.

import { prisma } from './index'

const NAMEABLE_SERVICE_TYPES = ['MANUFACTURING', 'COPACKING'] as const

// ---------------------------------------------------------------------------
// Front Face — full profile read (one partner by slug)
// ---------------------------------------------------------------------------

export interface ProfileServiceVM {
  type: string
  capabilities: Record<string, unknown>
  storageClasses: string[]
  weeklyPalletCapacity: number | null
  ratingMean: number | null
  ratingCount: number
}

export interface ProfileReviewVM {
  initials: string
  name: string
  role: string
  orders: number
  overall: number
  comment: string
  createdAt: string
}

export interface PartnerProfileVM {
  companyName: string
  slug: string
  tagline: string | null
  about: string | null
  bestForTags: string[]
  logoUrl: string | null
  coverImageUrl: string | null
  tier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
  city: string | null
  state: string | null
  sinceYear: number
  serviceTypes: string[]
  services: ProfileServiceVM[]
  certs: { name: string; qualifier: string }[]
  portfolio: { title: string; meta: string | null; imageUrl: string | null }[]
  stats: {
    ordersFulfilled: number
    ratingMean: number | null
    ratingCount: number
    meritScore: number | null
    verifiedCerts: number
  }
  merit: {
    feeBps: { verified: number; trusted: number; premier: number }
    pillars: { name: string; weight: number; score: number; sub: string }[] | null
    ordersCompleted: number | null
    monthsActive: number | null
    defectRatePer100: number | null
    thresholdPremier: number
  }
  reviews: ProfileReviewVM[]
  reviewSummary: { mean: number | null; count: number; buckets: { star: number; pct: number }[] }
  quickFacts: { k: string; v: string }[]
  activelyTaking: boolean
}

/**
 * Full Front Face read. Returns null when the partner doesn't exist or fails a
 * PARTNER-side gate (not published / not ACTIVE / no nameable service / not
 * FULL disclosure / invited-only). Viewer-side gating is the caller's job.
 */
export async function getPartnerProfile(slug: string): Promise<PartnerProfileVM | null> {
  const partner = await prisma.partner.findUnique({
    where: { slug },
    select: {
      id: true,
      companyName: true,
      slug: true,
      tagline: true,
      about: true,
      bestForTags: true,
      logoUrl: true,
      coverImageUrl: true,
      tier: true,
      status: true,
      participationMode: true,
      profilePublishedAt: true,
      city: true,
      state: true,
      activatedAt: true,
      createdAt: true,
      services: {
        select: {
          id: true,
          type: true,
          status: true,
          disclosureLevel: true,
          capabilities: true,
          storageClasses: true,
          weeklyPalletCapacity: true,
          ratingMean: true,
          ratingCount: true,
        },
      },
      certificateInstances: {
        where: { status: 'VERIFIED' },
        select: { expiryDate: true, certificateType: { select: { name: true } } },
        orderBy: { expiryDate: 'desc' },
        take: 12,
      },
      portfolioItems: {
        where: { published: true },
        orderBy: { sortOrder: 'asc' },
        select: { title: true, meta: true, imageUrl: true },
        take: 12,
      },
      facilities: { select: { city: true, region: true } },
      productDefaults: {
        select: { moqMin: true, leadTimeRepeatDays: true, leadTimeFirstRunDays: true },
      },
    },
  })
  if (!partner) return null
  if (partner.status !== 'ACTIVE') return null
  if (partner.participationMode !== 'PUBLIC') return null
  if (!partner.profilePublishedAt || !partner.slug) return null

  const nameable = partner.services.filter(
    (s) =>
      NAMEABLE_SERVICE_TYPES.includes(s.type as (typeof NAMEABLE_SERVICE_TYPES)[number]) &&
      s.status === 'ACTIVE',
  )
  // Partner-side opt-in: at least one ACTIVE mfr/co-pack service with FULL disclosure.
  if (!nameable.some((s) => s.disclosureLevel === 'FULL')) return null

  const activeServices = partner.services.filter((s) => s.status === 'ACTIVE')
  const serviceIds = activeServices.map((s) => s.id)

  // Real stats — delivered dispatches, weighted rating, latest merit snapshot,
  // recent verified partner ratings. All fail-soft.
  const [deliveredCount, meritSnap, ratings, ratingAgg] = await Promise.all([
    serviceIds.length
      ? prisma.orderDispatch
          .count({ where: { partnerServiceId: { in: serviceIds }, status: 'DELIVERED' } })
          .catch(() => 0)
      : Promise.resolve(0),
    nameable.length
      ? prisma.partnerMeritSnapshot
          .findFirst({
            where: { partnerServiceId: { in: nameable.map((s) => s.id) } },
            orderBy: { computedAt: 'desc' },
          })
          .catch(() => null)
      : Promise.resolve(null),
    serviceIds.length
      ? prisma.partnerRating
          .findMany({
            where: { partnerServiceId: { in: serviceIds }, excludedAt: null, comment: { not: null } },
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: {
              creatorUserId: true,
              role: true,
              overall: true,
              comment: true,
              createdAt: true,
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.partnerRating
          .findMany({
            where: { partnerServiceId: { in: serviceIds }, excludedAt: null },
            select: { overall: true, creatorUserId: true },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ])

  // Reviewer display names (first name + last initial) — best-effort.
  const reviewerIds = [...new Set(ratings.map((r) => r.creatorUserId))]
  const reviewers = reviewerIds.length
    ? await prisma.user
        .findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
        .catch(() => [] as { id: string; name: string | null }[])
    : []
  const reviewerName = (id: string) => {
    const raw = reviewers.find((u) => u.id === id)?.name?.trim()
    if (!raw) return 'Creator'
    const [first, last] = raw.split(/\s+/)
    return last ? `${first} ${last.charAt(0).toUpperCase()}.` : (first ?? 'Creator')
  }
  const ordersByReviewer = new Map<string, number>()
  for (const r of ratingAgg) ordersByReviewer.set(r.creatorUserId, (ordersByReviewer.get(r.creatorUserId) ?? 0) + 1)

  // Weighted display rating across rated services (mean weighted by count).
  const rated = activeServices.filter((s) => s.ratingCount > 0 && s.ratingMean != null)
  const totalRatings = rated.reduce((a, s) => a + s.ratingCount, 0)
  const weightedMean = totalRatings
    ? rated.reduce((a, s) => a + Number(s.ratingMean) * s.ratingCount, 0) / totalRatings
    : null

  // Star buckets from the raw ratings (rounded overall).
  const bucketCounts = [0, 0, 0, 0, 0] // index 0 → 1★
  for (const r of ratingAgg) {
    const star = Math.min(5, Math.max(1, Math.round(Number(r.overall))))
    bucketCounts[star - 1] = (bucketCounts[star - 1] ?? 0) + 1
  }
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    pct: ratingAgg.length ? Math.round(((bucketCounts[star - 1] ?? 0) / ratingAgg.length) * 100) : 0,
  }))

  // Merit fee ladder — MeritPolicy SSOT with decided defaults.
  const policy = await prisma.meritPolicy.findUnique({ where: { id: 1 } }).catch(() => null)

  const since = (partner.activatedAt ?? partner.createdAt).getFullYear()
  const facilityCities = [
    ...new Set(
      [
        partner.city,
        ...partner.facilities.map((f) => f.city),
      ].filter((c): c is string => Boolean(c)),
    ),
  ]

  const mfrCaps = (nameable[0]?.capabilities ?? {}) as Record<string, unknown>
  const moqMin =
    partner.productDefaults?.moqMin ??
    (typeof mfrCaps.moqMin === 'number' ? (mfrCaps.moqMin as number) : null)
  const leadRepeat = partner.productDefaults?.leadTimeRepeatDays ?? null
  const leadFirst = partner.productDefaults?.leadTimeFirstRunDays ?? null

  const quickFacts: { k: string; v: string }[] = []
  if (moqMin != null) quickFacts.push({ k: 'Minimum order', v: `${moqMin.toLocaleString()} units` })
  if (leadFirst != null || leadRepeat != null)
    quickFacts.push({
      k: 'Lead time',
      v: leadFirst != null && leadRepeat != null ? `${leadRepeat}–${leadFirst} days` : `${leadFirst ?? leadRepeat} days`,
    })
  if (leadRepeat != null) quickFacts.push({ k: 'Reorder time', v: `${leadRepeat} days` })
  if (facilityCities.length) quickFacts.push({ k: 'Facilities', v: facilityCities.join(' · ') })
  quickFacts.push({ k: 'Markets', v: 'US' })

  return {
    companyName: partner.companyName,
    slug: partner.slug,
    tagline: partner.tagline,
    about: partner.about,
    bestForTags: partner.bestForTags ?? [],
    logoUrl: partner.logoUrl,
    coverImageUrl: partner.coverImageUrl,
    tier: partner.tier as PartnerProfileVM['tier'],
    city: partner.city,
    state: partner.state,
    sinceYear: since,
    serviceTypes: [...new Set(activeServices.map((s) => s.type as string))],
    services: activeServices.map((s) => ({
      type: s.type as string,
      capabilities: (s.capabilities ?? {}) as Record<string, unknown>,
      storageClasses: s.storageClasses ?? [],
      weeklyPalletCapacity: s.weeklyPalletCapacity,
      ratingMean: s.ratingMean == null ? null : Number(s.ratingMean),
      ratingCount: s.ratingCount,
    })),
    certs: partner.certificateInstances.map((c) => ({
      name: c.certificateType.name,
      qualifier: `exp ${c.expiryDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    })),
    portfolio: partner.portfolioItems,
    stats: {
      ordersFulfilled: deliveredCount,
      ratingMean: weightedMean,
      ratingCount: totalRatings,
      meritScore: meritSnap ? Number(meritSnap.meritScore) : null,
      verifiedCerts: partner.certificateInstances.length,
    },
    merit: {
      feeBps: {
        verified: policy?.verifiedFeeBps ?? 450,
        trusted: policy?.trustedFeeBps ?? 250,
        premier: policy?.premierFeeBps ?? 0,
      },
      pillars: meritSnap
        ? [
            { name: 'Craft', weight: policy?.craftWeight ?? 40, score: Number(meritSnap.craftScore), sub: 'Quality ratings & low defect rate' },
            { name: 'Reliability', weight: policy?.reliabilityWeight ?? 30, score: Number(meritSnap.reliabilityScore), sub: 'On-time, few strikes' },
            { name: 'Contribution', weight: policy?.contributionWeight ?? 20, score: Number(meritSnap.contributionScore), sub: 'Platform participation' },
            { name: 'Standing', weight: policy?.standingWeight ?? 10, score: Number(meritSnap.standingScore), sub: 'History & tenure' },
          ]
        : null,
      ordersCompleted: meritSnap?.ordersCompleted ?? null,
      monthsActive: meritSnap?.monthsActive ?? null,
      defectRatePer100: meritSnap?.defectRatePer100 == null ? null : Number(meritSnap.defectRatePer100),
      thresholdPremier: policy?.premierThreshold ?? 82,
    },
    reviews: ratings
      .filter((r) => (r.comment ?? '').trim().length > 0)
      .map((r) => ({
        initials: reviewerName(r.creatorUserId)
          .split(/\s+/)
          .map((w) => w.charAt(0))
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        name: reviewerName(r.creatorUserId),
        role: r.role,
        orders: ordersByReviewer.get(r.creatorUserId) ?? 1,
        overall: Number(r.overall),
        comment: (r.comment ?? '').trim(),
        createdAt: r.createdAt.toISOString(),
      })),
    reviewSummary: { mean: weightedMean, count: ratingAgg.length, buckets },
    quickFacts,
    activelyTaking: true, // PUBLIC participation implies open to briefs
  }
}
