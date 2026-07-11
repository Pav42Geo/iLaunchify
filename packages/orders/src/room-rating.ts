// P1 two-sided room reviews (CO_CREATION_MARKETPLACE_SPEC §16 P1, 2026-07-10).
//
// Direction 1 — creator rates the MAKER after CLOSED_WON: writes a ROOM-scoped
// PartnerRating row that feeds the SAME PartnerService.ratingBayesian
// aggregate as dispatch ratings (single recompute writer) — this is what
// "reviews into ranking" means: room outcomes move merit, merit moves fit.
//
// Direction 2 — maker rates the CREATOR: net-new CreatorRating rows +
// CreatorProfile aggregate, surfaced on the maker's pool cards so makers can
// judge who they'd work with. Never affects the creator's ability to post.
//
// Both verified by construction: only a CLOSED_WON room's members can rate,
// one rating per side per room, 30-day mind-change window (mirror of §5.1).

import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import {
  aggregateRatings,
  overallFromDimensions,
  RATING_EDIT_WINDOW_DAYS,
  type DimensionScores,
  type RatingDimensionDef,
} from './partner-rating'
import { recomputePartnerRatingAggregate } from './partner-rating-recompute'

// ---------------------------------------------------------------------------
// Dimension registries (co-creation is collaboration work, not unit production
// — different axes from the dispatch registries).
// ---------------------------------------------------------------------------

/** Creator → maker (the collaboration, not the delivered units). */
export const CO_CREATION_RATING_DIMENSIONS: readonly RatingDimensionDef[] = [
  { slug: 'formulation', label: 'Formulation', sublabel: 'Recipe quality vs your brief' },
  { slug: 'communication', label: 'Communication', sublabel: 'Updates, honesty, responsiveness' },
  { slug: 'speed', label: 'Speed', sublabel: 'Version turnaround in the room' },
  { slug: 'professionalism', label: 'Professionalism', sublabel: 'Easy to work with, kept commitments' },
]

/** Maker → creator (brief + collaboration quality). */
export const CREATOR_RATING_DIMENSIONS: readonly RatingDimensionDef[] = [
  { slug: 'clarity', label: 'Clarity', sublabel: 'Brief and feedback were clear' },
  { slug: 'responsiveness', label: 'Responsiveness', sublabel: 'Reviews and replies came promptly' },
  { slug: 'decisiveness', label: 'Decisiveness', sublabel: 'Decisions stuck — no endless churn' },
  { slug: 'professionalism', label: 'Professionalism', sublabel: 'Respectful, realistic, fair' },
]

function validateAgainst(
  defs: readonly RatingDimensionDef[],
  scores: DimensionScores,
): { ok: true; clean: DimensionScores } | { ok: false; error: string } {
  const allowed = new Set(defs.map((d) => d.slug))
  const clean: DimensionScores = {}
  for (const [slug, v] of Object.entries(scores)) {
    if (!allowed.has(slug)) return { ok: false, error: `Unknown dimension "${slug}"` }
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return { ok: false, error: `"${slug}" must be a whole star count 1–5` }
    }
    clean[slug] = v
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: 'Rate at least one dimension' }
  return { ok: true, clean }
}

type Result = { ok: true } | { ok: false; error: string }

type Actor = { id: string; role: string }

// ---------------------------------------------------------------------------
// Direction 1 — creator rates the maker (→ PartnerService.ratingBayesian)
// ---------------------------------------------------------------------------

export async function rateRoomMaker(
  actor: Actor,
  roomId: string,
  scores: DimensionScores,
  comment?: string,
): Promise<Result> {
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, status: 'CLOSED_WON', brief: { creator: { userId: actor.id } } },
    include: {
      brief: { include: { interests: { where: { status: 'SELECTED' }, select: { serviceId: true, partnerId: true } } } },
    },
  })
  if (!room) return { ok: false, error: 'Only a completed room you own can be rated' }

  const v = validateAgainst(CO_CREATION_RATING_DIMENSIONS, scores)
  if (!v.ok) return v
  const overall = overallFromDimensions(v.clean)

  // The rated SERVICE: the selected interest's snapshot, else the maker's
  // first producing line (never invent — bail if neither exists).
  const selected = room.brief.interests.find((i) => i.partnerId === room.partnerId)
  let serviceId = selected?.serviceId ?? null
  let role: string = 'MANUFACTURER'
  if (serviceId) {
    const svc = await prisma.partnerService.findUnique({ where: { id: serviceId }, select: { type: true } })
    role = svc?.type === 'COPACKING' ? 'COPACKER' : 'MANUFACTURER'
  } else {
    const svc = await prisma.partnerService.findFirst({
      where: { partnerId: room.partnerId, type: { in: ['MANUFACTURING', 'COPACKING'] }, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true },
    })
    if (!svc) return { ok: false, error: 'The maker has no producing service line to rate' }
    serviceId = svc.id
    role = svc.type === 'COPACKING' ? 'COPACKER' : 'MANUFACTURER'
  }

  const existing = await prisma.partnerRating.findFirst({
    where: { creatorUserId: actor.id, roomId: room.id },
  })
  if (existing && existing.editableUntil < new Date()) {
    return { ok: false, error: 'The 30-day edit window for this rating has closed' }
  }

  const trimmed = comment?.trim().slice(0, 500) || null
  if (existing) {
    await prisma.partnerRating.update({
      where: { id: existing.id },
      data: { dimensions: v.clean, overall, comment: trimmed },
    })
  } else {
    await prisma.partnerRating.create({
      data: {
        roomId: room.id,
        // orderId/dispatchId stay null — room-scoped linkage.
        partnerServiceId: serviceId,
        creatorUserId: actor.id,
        role,
        dimensions: v.clean,
        overall,
        comment: trimmed,
        editableUntil: new Date(Date.now() + RATING_EDIT_WINDOW_DAYS * 24 * 3_600_000),
      },
    })
  }

  await recomputePartnerRatingAggregate(serviceId, role)

  await logAuditAs(actor as never, {
    entityType: 'PartnerRating',
    entityId: existing?.id ?? room.id,
    action: existing ? 'ROOM_MAKER_RATING_UPDATED' : 'ROOM_MAKER_RATED',
    payload: { roomId: room.id, partnerServiceId: serviceId, overall },
  })

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Direction 2 — maker rates the creator (→ CreatorProfile aggregate)
// ---------------------------------------------------------------------------

/** Neutral cold-start prior until the platform has creator-rating volume. */
const CREATOR_RATING_PRIOR = 3.75

export async function recomputeCreatorRatingAggregate(creatorProfileId: string): Promise<void> {
  const ratings = await prisma.creatorRating.findMany({
    where: { creatorProfileId, excludedAt: null },
    select: { overall: true, dimensions: true },
  })
  const agg = aggregateRatings(
    ratings.map((r: { overall: unknown; dimensions: unknown }) => ({
      overall: Number(r.overall),
      dimensions: (r.dimensions ?? {}) as DimensionScores,
    })),
    CREATOR_RATING_PRIOR,
  )
  await prisma.creatorProfile.update({
    where: { id: creatorProfileId },
    data: {
      ratingMean: agg.mean,
      ratingBayesian: agg.bayesian,
      ratingCount: agg.count,
    },
  })
}

export async function rateRoomCreator(
  actor: Actor,
  partnerId: string,
  roomId: string,
  scores: DimensionScores,
  comment?: string,
): Promise<Result> {
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, status: 'CLOSED_WON', partnerId },
    include: { brief: { select: { creatorId: true } } },
  })
  if (!room) return { ok: false, error: 'Only a completed room your org won can be rated' }

  const v = validateAgainst(CREATOR_RATING_DIMENSIONS, scores)
  if (!v.ok) return v
  const overall = overallFromDimensions(v.clean)

  const existing = await prisma.creatorRating.findFirst({ where: { partnerId, roomId: room.id } })
  if (existing && existing.editableUntil < new Date()) {
    return { ok: false, error: 'The 30-day edit window for this rating has closed' }
  }

  const trimmed = comment?.trim().slice(0, 500) || null
  if (existing) {
    await prisma.creatorRating.update({
      where: { id: existing.id },
      data: { dimensions: v.clean, overall, comment: trimmed },
    })
  } else {
    await prisma.creatorRating.create({
      data: {
        roomId: room.id,
        creatorProfileId: room.brief.creatorId,
        partnerId,
        raterUserId: actor.id,
        dimensions: v.clean,
        overall,
        comment: trimmed,
        editableUntil: new Date(Date.now() + RATING_EDIT_WINDOW_DAYS * 24 * 3_600_000),
      },
    })
  }

  await recomputeCreatorRatingAggregate(room.brief.creatorId)

  await logAuditAs(actor as never, {
    entityType: 'CreatorRating',
    entityId: existing?.id ?? room.id,
    action: existing ? 'ROOM_CREATOR_RATING_UPDATED' : 'ROOM_CREATOR_RATED',
    payload: { roomId: room.id, creatorProfileId: room.brief.creatorId, overall },
  })

  return { ok: true }
}
