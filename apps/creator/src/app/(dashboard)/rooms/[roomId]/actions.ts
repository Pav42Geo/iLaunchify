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
  autoRevokeRoomDesigners,
  declineMilestoneTerms,
  evaluateMakerSwitch,
  labelProofPayloadSchema,
  LABEL_PROOF_KIND,
  reopenObject,
  reviewObject,
  submitObjectVersion,
  type RoomCtx,
} from '@ilaunchify/orders'
import { labelProofKey, uploadFile } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { createHash } from 'node:crypto'
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
    // SAMPLE (P2 sample logistics): shipment block — submit = "shipped".
    shipment: z
      .object({
        carrier: z.enum(['USPS', 'UPS', 'FEDEX', 'DHL', 'OTHER']),
        trackingNumber: z.string().trim().min(1).max(60),
        eta: z.string().trim().max(10).optional(),
        notes: z.string().trim().max(300).optional(),
      })
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

// Creator self-design on the maker's dieline (CO_CREATION §7 — Design Studio
// bridge). The creator composes a normalized label-proof SVG in the Studio (the
// maker's immutable dieline substrate + brand layer + deterministic regulated
// panels); this action uploads it as a NEW artifact and lands it as a LABEL
// BuildObjectVersion via the same submit engine the maker uses. Distinct from
// creatorSubmitVersion (recipe/label-math): this path carries an artifact ref,
// not structured rows, so the LABEL viewer renders payload.svgKey.
const LabelProofInputSchema = z
  .object({
    // The composed SVG document (mm units). Capped generously — a proof is
    // vector, not a raster; a few hundred KB is already large.
    svg: z.string().min(32).max(4_000_000),
    dielineId: z.string().min(1).max(64),
    widthMm: z.number().positive().max(10_000),
    heightMm: z.number().positive().max(10_000),
    designId: z.string().max(64).optional(),
    designVersion: z.number().int().positive().max(1_000_000).optional(),
    regulatedFrames: z.array(z.string().max(60)).max(40).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict()

export async function creatorSubmitLabelProof(
  roomId: string,
  objectId: string,
  input: unknown,
): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()

  const parsed = LabelProofInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid label proof' }
  const data = parsed.data

  // Gate 1 — the target must be THIS room's LABEL object, and packaging must be
  // APPROVED first (the approved PACKAGING object is what pins the maker's
  // dieline; decision 2026-07-13). Load both in one query.
  const [label, packaging, room] = await Promise.all([
    prisma.buildObject.findFirst({ where: { id: objectId, roomId, kind: 'LABEL' }, select: { id: true } }),
    prisma.buildObject.findFirst({ where: { roomId, kind: 'PACKAGING' }, select: { status: true } }),
    prisma.coCreationRoom.findUnique({ where: { id: roomId }, select: { partnerId: true } }),
  ])
  if (!label) return { ok: false, error: 'That is not this room’s label object' }
  if (!room) return guardFail()
  if (packaging?.status !== 'APPROVED') {
    return { ok: false, error: 'Approve the packaging first — that pins the die-line you design on.' }
  }

  // Gate 2 — provenance: the die-line must belong to THIS room's maker. Blocks a
  // creator from referencing an arbitrary partner's die-line as the substrate.
  const dieline = await prisma.packagingDieline.findFirst({
    where: { id: data.dielineId, partnerService: { partnerId: room.partnerId } },
    select: { id: true },
  })
  if (!dieline) return { ok: false, error: 'That die-line is not from this maker' }

  // A10 — compliance pre-check is NON-GATING in V1 (room-compliance.ts: "it
  // informs, it never blocks"; the maker reviews the proof anyway per D-S3). The
  // Studio surfaces the readiness warning; submit is allowed. So no gate here.

  // Upload the composed SVG as a new, room+object-scoped artifact (the partner's
  // original file stays immutable — this is a separate key).
  const svgKey = labelProofKey({ roomId, objectId })
  const bytes = Buffer.from(data.svg, 'utf8')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  try {
    await uploadFile({ key: svgKey, body: bytes, contentType: 'image/svg+xml', cacheControl: 'private, max-age=0' })
  } catch {
    return { ok: false, error: 'Could not save the design — please try again' }
  }

  // Build + revalidate the shared payload contract, then land it through the
  // same FSM/audit/notification engine the maker's submissions use.
  const payload = labelProofPayloadSchema.safeParse({
    proofKind: LABEL_PROOF_KIND,
    svgKey,
    dielineId: data.dielineId,
    widthMm: data.widthMm,
    heightMm: data.heightMm,
    designId: data.designId,
    designVersion: data.designVersion,
    sha256,
    regulatedFrames: data.regulatedFrames ?? [],
    note: data.note,
  })
  if (!payload.success) return { ok: false, error: 'Invalid label proof' }

  const res = await submitObjectVersion(ctx, objectId, payload.data)
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

  // D-W5 parity: closing/switching a room kills every live designer seat
  // (LABEL-approve + closeRoomWon are already hooked). Best-effort.
  await autoRevokeRoomDesigners(user, roomId, 'ROOM_CLOSED').catch(() => undefined)

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
 * P1 dispute surface — opens a HIGH-priority support ticket linked to the
 * room (entityType CoCreationRoom; the decision log is the evidence trail),
 * plus a ROOM_DISPUTE_OPENED event so the counterpart sees it in the feed.
 * Admin mediates from the support inbox. Room state is NOT changed here —
 * pausing/refunds are admin decisions, never unilateral.
 */
export async function creatorOpenRoomDispute(
  roomId: string,
  description: string,
): Promise<RoomActionResult & { ticketId?: string }> {
  const user = await requireUser()
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, brief: { creator: { userId: user.id } } },
    include: {
      brief: { select: { title: true } },
      partner: { select: { companyName: true } },
    },
  })
  if (!room) return { ok: false, error: 'Room not found' }
  const body = description.trim()
  if (body.length < 20) return { ok: false, error: 'Describe the issue in a bit more detail (20+ characters)' }

  const { createTicket } = await import('@ilaunchify/support')
  const input = {
    requesterUserId: user.id,
    requesterRole: 'CREATOR' as const,
    subject: `Dispute: ${room.brief.title}`.slice(0, 180),
    body: `${body.slice(0, 8000)}\n\n---\nRoom: ${room.id}\nMaker: ${room.partner.companyName}\nRoom status: ${room.status}`,
    entityType: 'CoCreationRoom',
    entityId: room.id,
  }
  let ticket
  try {
    ticket = await createTicket({ ...input, categorySlug: 'co-creation-dispute' })
  } catch {
    // Category not seeded yet on this environment — never block a dispute.
    ticket = await createTicket({ ...input, categorySlug: 'other' })
  }

  await prisma.roomEvent.create({
    data: {
      roomId: room.id,
      kind: 'ROOM_DISPUTE_OPENED',
      data: { by: user.name ?? 'Creator', ticketId: ticket.id },
    },
  })
  await logAuditAs(user, {
    entityType: 'CoCreationRoom',
    entityId: room.id,
    action: 'ROOM_DISPUTE_OPENED',
    payload: { ticketId: ticket.id },
  })

  revalidatePath(`/rooms/${roomId}`)
  return { ok: true, ticketId: ticket.id }
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
