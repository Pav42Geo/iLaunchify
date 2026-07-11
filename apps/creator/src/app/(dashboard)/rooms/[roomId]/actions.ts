'use server'

// Collaboration Room server actions — CREATOR side. Membership guard here
// (room must belong to a brief this user owns); FSM/audit/decision-log/
// notification mechanics live in @ilaunchify/orders room-service.

import { revalidatePath } from 'next/cache'
import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  addObjectComment,
  addRoomMessage,
  agreeMilestoneTerms,
  assertBriefTransition,
  assertInterestTransition,
  declineMilestoneTerms,
  evaluateMakerSwitch,
  reopenObject,
  reviewObject,
  submitObjectVersion,
  type RoomCtx,
} from '@ilaunchify/orders'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { z } from 'zod'

export type RoomActionResult = { ok: boolean; error?: string }

const PayloadSchema = z
  .object({
    rows: z
      .array(
        z.object({
          name: z.string().trim().max(120),
          amount: z.string().trim().max(40),
          note: z.string().trim().max(120),
          ingredientId: z.string().max(64).optional(),
        }),
      )
      .max(60)
      .optional(),
    // Facts-panel serving block (RECIPE) — drives the live label math.
    serving: z
      .object({
        sizeG: z.number().positive().max(100_000).nullable().optional(),
        sizeDesc: z.string().trim().max(60).optional(),
        perContainer: z.number().int().positive().max(10_000).nullable().optional(),
        netQuantity: z
          .object({
            kind: z.enum(['solid', 'liquid', 'count']),
            grams: z.number().positive().max(1_000_000).optional(),
            milliliters: z.number().positive().max(1_000_000).optional(),
            count: z.number().int().positive().max(100_000).optional(),
            countUnit: z.string().trim().max(30).optional(),
          })
          .nullable()
          .optional(),
      })
      .optional(),
    // Domain label blocks (RECIPE) — structured maker-authored data the room's
    // facts label renders verbatim / through the canonical engines.
    supplement: z
      .object({
        dietaryIngredients: z
          .array(
            z.object({
              id: z.string().max(64),
              name: z.string().trim().max(160),
              amountPerServing: z.number().positive().max(1_000_000),
              unit: z.string().trim().max(20),
              percentDV: z.number().min(0).max(100_000).nullable().optional(),
              isOtherIngredient: z.boolean().optional(),
              sortWeight: z.number().optional(),
              blendId: z.string().max(64).optional(),
            }),
          )
          .max(80),
        blends: z
          .array(
            z.object({
              id: z.string().max(64),
              name: z.string().trim().max(120),
              totalAmount: z.number().positive().max(1_000_000),
              unit: z.string().trim().max(20),
              percentDV: z.number().nullable().optional(),
            }),
          )
          .max(20),
        servingForm: z.string().trim().max(60),
        servingsPerContainer: z.number().positive().max(10_000),
        nutrition: z.record(z.string(), z.number()).optional(),
      })
      .optional(),
    pet: z
      .object({
        gaRows: z
          .array(z.object({ label: z.string().trim().max(80), value: z.string().trim().max(40) }))
          .max(40),
        adequacyStatement: z.string().trim().max(500).optional(),
        feedingDirections: z.string().trim().max(1000).optional(),
      })
      .optional(),
    otc: z
      .object({
        activeIngredients: z
          .array(
            z.object({ name: z.string().trim().max(160), purpose: z.string().trim().max(120) }),
          )
          .max(20),
        uses: z.array(z.string().trim().max(200)).max(20),
        warnings: z
          .array(z.object({ text: z.string().trim().max(300), bold: z.boolean().optional() }))
          .max(60),
        directions: z.string().trim().max(1000),
        otherInformation: z.array(z.string().trim().max(200)).max(20).optional(),
        inactiveIngredients: z.string().trim().max(1000),
        questions: z.string().trim().max(120).optional(),
      })
      .optional(),
    fields: z
      .array(z.object({ label: z.string().trim().max(80), value: z.string().trim().max(300) }))
      .max(40)
      .optional(),
  })
  .strict()

async function creatorRoomCtx(roomId: string): Promise<RoomCtx | null> {
  const user = await requireUser()
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, brief: { creator: { userId: user.id } }, status: 'ACTIVE' },
    include: {
      brief: { include: { creator: { select: { displayName: true } } } },
      partner: { select: { userId: true } },
    },
  })
  if (!room) return null
  return {
    actor: user,
    actingAs: 'CREATOR',
    actorName: room.brief.creator.displayName,
    counterpartUserId: room.partner.userId,
    roomId: room.id,
  }
}

function guardFail(): RoomActionResult {
  return { ok: false, error: 'Room not found or not active' }
}

export async function creatorSubmitVersion(
  roomId: string,
  objectId: string,
  payload: Record<string, unknown>,
): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const parsed = PayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'Invalid payload' }
  const res = await submitObjectVersion(ctx, objectId, parsed.data)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function creatorReview(
  roomId: string,
  objectId: string,
  decision: 'APPROVE' | 'REQUEST_CHANGES',
  note?: string,
): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  if (decision !== 'APPROVE' && decision !== 'REQUEST_CHANGES') {
    return { ok: false, error: 'Invalid decision' }
  }
  const res = await reviewObject(ctx, objectId, decision, note?.slice(0, 500))
  revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function creatorReopen(roomId: string, objectId: string): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await reopenObject(ctx, objectId)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function creatorComment(
  roomId: string,
  objectId: string,
  body: string,
  anchor?: string,
): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await addObjectComment(ctx, objectId, body, anchor)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

/** Agree to the maker's proposed milestone terms (funding stays payments-gated). */
export async function creatorAgreeMilestoneTerms(
  roomId: string,
  milestoneId: string,
): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await agreeMilestoneTerms(ctx, milestoneId)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

/** Decline the proposal — the maker can re-propose. */
export async function creatorDeclineMilestoneTerms(
  roomId: string,
  milestoneId: string,
  reason?: string,
): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await declineMilestoneTerms(ctx, milestoneId, reason)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function creatorMessage(roomId: string, body: string): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await addRoomMessage(ctx, body)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

/**
 * D-CC3 — switch makers (policy admin-choosable in Co-Creation Settings).
 * Archives THIS room as CLOSED_CANCELLED (full decision log preserved as
 * dispute evidence), old maker's interest → PASSED (respectful notice),
 * previously-passed interests reopen → SHORTLISTED, brief → SHORTLISTING so
 * the creator picks again. Cutoffs enforced per policy; switching after money
 * moves is a support/dispute path, never this action.
 */
export async function creatorSwitchMaker(
  roomId: string,
): Promise<RoomActionResult & { briefId?: string }> {
  const user = await requireUser()
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, status: 'ACTIVE', brief: { creator: { userId: user.id } } },
    include: {
      brief: { include: { interests: true, creator: { select: { displayName: true } } } },
      milestones: { select: { status: true, termsStatus: true } },
      objects: { select: { kind: true, status: true, _count: { select: { versions: true } } } },
      partner: { select: { userId: true, companyName: true } },
    },
  })
  if (!room) return guardFail()

  const [settings, priorRooms] = await Promise.all([
    getCoCreationSettings(),
    prisma.coCreationRoom.count({ where: { briefId: room.briefId, status: { not: 'ACTIVE' } } }),
  ])

  // One cutoff engine for action + page (packages/orders/maker-switch.ts).
  const verdict = evaluateMakerSwitch(
    {
      policy: settings.makerSwitchPolicy,
      graceDays: settings.makerSwitchGraceDays,
      maxSwitches: settings.maxMakerSwitches,
    },
    {
      roomStatus: room.status,
      roomCreatedAt: room.createdAt,
      ndaSignedAt: room.ndaSignedAt,
      milestoneStatuses: room.milestones.map((m) => m.status),
      milestoneTermsStatuses: room.milestones.map((m) => m.termsStatus),
      recipeStatus: room.objects.find((o) => o.kind === 'RECIPE')?.status ?? null,
      hasAnySubmission: room.objects.some((o) => o._count.versions > 0),
      priorRooms,
    },
  )
  if (!verdict.allowed) return { ok: false, error: verdict.reason }

  // FSM edges asserted up front (brief-fsm carries the D-CC3 edges).
  try {
    assertBriefTransition(room.brief.status, 'SHORTLISTING')
    assertInterestTransition('SELECTED', 'PASSED')
    assertInterestTransition('PASSED', 'SHORTLISTED')
  } catch {
    return { ok: false, error: 'This brief is not in a switchable state' }
  }

  const selected = room.brief.interests.find(
    (i) => i.status === 'SELECTED' && i.partnerId === room.partnerId,
  )
  const reopenIds = room.brief.interests.filter((i) => i.status === 'PASSED').map((i) => i.id)

  await prisma.$transaction(async (tx) => {
    await tx.coCreationRoom.update({ where: { id: room.id }, data: { status: 'CLOSED_CANCELLED' } })
    await tx.roomEvent.create({
      data: {
        roomId: room.id,
        kind: 'ROOM_CLOSED_SWITCHED',
        data: { by: room.brief.creator.displayName, partnerName: room.partner.companyName },
      },
    })
    if (selected) {
      await tx.briefInterest.update({ where: { id: selected.id }, data: { status: 'PASSED' } })
    }
    if (reopenIds.length) {
      await tx.briefInterest.updateMany({
        where: { id: { in: reopenIds } },
        data: { status: 'SHORTLISTED' },
      })
    }
    await tx.productBrief.update({ where: { id: room.briefId }, data: { status: 'SHORTLISTING' } })
  })

  await logAuditAs(user, {
    entityType: 'CoCreationRoom',
    entityId: room.id,
    action: 'COCREATION_MAKER_SWITCHED',
    fromValue: 'ACTIVE',
    toValue: 'CLOSED_CANCELLED',
    payload: {
      briefId: room.briefId,
      oldPartnerId: room.partnerId,
      policy: settings.makerSwitchPolicy,
      reopenedInterests: reopenIds.length,
    },
  })

  // Respectful notice to the old maker (same copy family as a pass).
  await dispatchNotification({
    userId: room.partner.userId,
    event: 'BRIEF_INTEREST_PASSED',
    audience: 'partner',
    data: { briefTitle: room.brief.title },
  })

  revalidatePath(`/rooms/${roomId}`)
  revalidatePath(`/briefs/${room.briefId}/interests`)
  revalidatePath('/briefs')
  return { ok: true, briefId: room.briefId }
}

/**
 * P1 two-sided reviews — creator rates the maker after CLOSED_WON. The
 * service does its own guards (room won + owned + edit window); the rating
 * flows into the SAME PartnerService.ratingBayesian that ranks the pool.
 */
export async function creatorRateMaker(
  roomId: string,
  scores: Record<string, number>,
  comment?: string,
): Promise<RoomActionResult> {
  const user = await requireUser()
  const { rateRoomMaker } = await import('@ilaunchify/orders')
  const res = await rateRoomMaker(user, roomId, scores, comment)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

/**
 * Close the room as WON: materialize the approved recipe into a draft
 * Product + Recipe (template-less; spec §6), room → CLOSED_WON, brief →
 * IN_PRODUCTION. Ordering then runs through the normal checkout. Creator-only.
 */
export async function creatorCloseRoomWon(
  roomId: string,
): Promise<RoomActionResult & { productId?: string }> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const { materializeRoomWon } = await import('@ilaunchify/orders')
  const res = await materializeRoomWon(ctx.actor, roomId)
  revalidatePath(`/rooms/${roomId}`)
  if (res.ok) revalidatePath('/products')
  return res.ok ? { ok: true, productId: res.productId } : res
}
