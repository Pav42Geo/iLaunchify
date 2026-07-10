// Opportunity Pool loader — assembles PartnerFitFacts from the partner's real
// capability surface (their PUBLISHED templates) and returns fit-scored PUBLIC
// projections of open briefs. CO_CREATION_MARKETPLACE_SPEC §8 (fit) + §9
// (staged reveal: raw ProductBrief rows never leave this module).
//
// Capability facts derivation (recon 2026-07-10): partners carry no direct
// niche/category links — their niches + categories derive from the PUBLISHED
// ProductTemplates on their MANUFACTURING services (ProductTemplateNiche +
// Subcategory.categoryId), MOQ floor = min(template.moqMin), rating =
// best PartnerService.ratingBayesian. A manufacturer with no published
// templates has no capability signal → empty pool (page shows why).

import { prisma } from '@ilaunchify/db'
import {
  scoreBriefFit,
  toPublicBriefProjection,
  type PartnerFitFacts,
  type PublicBriefProjection,
} from '@ilaunchify/marketplace'

export interface PoolEntry {
  brief: PublicBriefProjection
  categoryName: string | null
  fitScore: number
  /** Count of live interests from other makers (social proof on the card). */
  interestedCount: number
  /** This partner's own interest on the brief, if any. */
  mine: { id: string; status: string } | null
}

export interface MyInterestEntry {
  id: string
  status: string
  briefId: string
  briefTitle: string
  nicheSlug: string
  /** Set when SELECTED — the private room to open. */
  roomId: string | null
  priceLow: string | null
  priceHigh: string | null
  moq: number | null
  leadTimeWeeks: number | null
  offersSample: boolean
  pitch: string
  createdAt: string
}

export interface PartnerPoolFacts extends PartnerFitFacts {
  /** First ACTIVE MANUFACTURING service — snapshotted onto BriefInterest.serviceId. */
  serviceId: string | null
  hasCapabilitySignal: boolean
}

/** Assemble the fit facts for one partner (MANUFACTURING lines only). */
export async function loadPartnerFitFacts(partnerId: string): Promise<PartnerPoolFacts> {
  const services = await prisma.partnerService.findMany({
    where: { partnerId, type: 'MANUFACTURING', status: 'ACTIVE' },
    select: { id: true, ratingBayesian: true },
  })
  const serviceIds = services.map((s) => s.id)

  const templates = serviceIds.length
    ? await prisma.productTemplate.findMany({
        where: { manufacturerServiceId: { in: serviceIds }, status: 'PUBLISHED' },
        select: {
          subcategory: { select: { categoryId: true } },
          niches: { select: { niche: { select: { slug: true } } } },
          // MOQ is per sellable variant — the partner's floor is their lowest.
          variants: { where: { isActive: true }, select: { moqMin: true } },
        },
      })
    : []

  const nicheSlugs = [
    ...new Set(templates.flatMap((t) => t.niches.map((n) => n.niche.slug))),
  ]
  const categoryIds = [
    ...new Set(templates.map((t) => t.subcategory?.categoryId).filter((x): x is string => !!x)),
  ]
  const moqs = templates
    .flatMap((t) => t.variants.map((v) => v.moqMin))
    .filter((m): m is number => typeof m === 'number')
  const ratings = services
    .map((s) => (s.ratingBayesian === null ? null : Number(s.ratingBayesian)))
    .filter((r): r is number => r !== null)

  return {
    nicheSlugs,
    categoryIds,
    // Claim support isn't declared anywhere yet → undefined = neutral half
    // credit in scoreBriefFit. The Express Interest form captures per-brief
    // claim fit instead (BriefInterest.claimFit).
    claimsSupported: undefined,
    moqFloor: moqs.length ? Math.min(...moqs) : null,
    volumeCapacity: null,
    meritRating: ratings.length ? Math.max(...ratings) : null,
    serviceId: serviceIds[0] ?? null,
    hasCapabilitySignal: nicheSlugs.length > 0,
  }
}

const LIVE_INTEREST_STATUSES = ['SUBMITTED', 'SHORTLISTED', 'SELECTED'] as const

/**
 * Load the pool for one partner: INTEREST_OPEN briefs → hard-filter
 * eligibility (§8 — ineligible briefs never surface) → fit-scored public
 * projections, newest first.
 */
export async function loadOpportunityPool(partnerId: string): Promise<{
  facts: PartnerPoolFacts
  entries: PoolEntry[]
  myInterests: MyInterestEntry[]
}> {
  const facts = await loadPartnerFitFacts(partnerId)

  const briefs = facts.hasCapabilitySignal
    ? await prisma.productBrief.findMany({
        where: { status: 'INTEREST_OPEN', nicheSlug: { in: [...facts.nicheSlugs] } },
        include: {
          creator: { select: { displayName: true, handle: true } },
          categoryRef: { select: { id: true, name: true } },
          interests: { select: { id: true, partnerId: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    : []

  const entries: PoolEntry[] = []
  for (const b of briefs) {
    const fit = scoreBriefFit(
      {
        nicheSlug: b.nicheSlug,
        categoryId: b.categoryId,
        claims: b.claims,
        targetVolume: b.targetVolume,
      },
      facts,
    )
    if (!fit.eligible) continue // hard filters gate visibility, never weighted

    const mine = b.interests.find((i) => i.partnerId === partnerId)
    entries.push({
      brief: toPublicBriefProjection({
        ...b,
        creator: {
          displayName: b.creator.displayName,
          handle: b.creator.handle ? `@${b.creator.handle}` : null,
          audienceSize: null,
        },
      }),
      categoryName: b.categoryRef?.name ?? null,
      fitScore: fit.score,
      interestedCount: b.interests.filter((i) =>
        (LIVE_INTEREST_STATUSES as readonly string[]).includes(i.status),
      ).length,
      mine: mine ? { id: mine.id, status: mine.status } : null,
    })
  }

  const myRows = await prisma.briefInterest.findMany({
    where: { partnerId },
    include: {
      brief: {
        select: { id: true, title: true, nicheSlug: true, room: { select: { id: true, partnerId: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const myInterests: MyInterestEntry[] = myRows.map((i) => ({
    id: i.id,
    status: i.status,
    briefId: i.brief.id,
    briefTitle: i.brief.title,
    nicheSlug: i.brief.nicheSlug,
    // Only surface the room when it's OURS (SELECTED) — a room created with a
    // different maker after a pass must never leak here.
    roomId: i.brief.room && i.brief.room.partnerId === partnerId ? i.brief.room.id : null,
    priceLow: i.priceLow === null ? null : String(i.priceLow),
    priceHigh: i.priceHigh === null ? null : String(i.priceHigh),
    moq: i.moq,
    leadTimeWeeks: i.leadTimeWeeks,
    offersSample: i.offersSample,
    pitch: i.pitch,
    createdAt: i.createdAt.toISOString(),
  }))

  return { facts, entries, myInterests }
}
