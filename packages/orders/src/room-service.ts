// Co-creation Room mutation core — CO_CREATION_MARKETPLACE_SPEC §5/§7/§12.
//
// One shared engine for both app views (creator + partner). CALLERS OWN THE
// GUARDS: every function assumes the actor's room membership + role were
// verified by the calling server action (tenant isolation = threat #1;
// centralized guards live in the apps, this module never trusts its inputs
// for authorization). What lives here, uniformly for both sides:
//   FSM asserts (room-object-fsm) → DB writes → AuditLog → RoomEvent
//   (the decision log = dispute evidence trail) → notification dispatch.
//
// Milestone release coupling ("approve recipe → release the tied milestone")
// is deliberately NOT here yet — funds move only through packages/payments;
// that wiring lands with the payments slice (D-CC1: V1 milestones carry no
// platform fee; user-facing copy says "payment protection", never "escrow").

import { prisma, type Prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { assertBuildObjectTransition } from './room-object-fsm'
import { autoMatchRecipePayload } from './room-label'

/** The session user shape logAuditAs expects. */
export type RoomActor = { id: string; role: 'ADMIN' | 'CREATOR' | 'PARTNER'; adminRole?: string | null }

export type RoomRole = 'CREATOR' | 'PARTNER'

export interface RoomCtx {
  actor: RoomActor
  /** Which side of the room the actor is on (drives copy + notifications). */
  actingAs: RoomRole
  /** Display name recorded in the decision log ("Maria approved…"). */
  actorName: string
  /** The other side's userId for notifications (creator ⇄ partner founder). */
  counterpartUserId: string
  roomId: string
}

export type RoomResult = { ok: true } | { ok: false; error: string }

async function loadObject(roomId: string, objectId: string) {
  return prisma.buildObject.findFirst({ where: { id: objectId, roomId } })
}

/**
 * Submit a new version of a build object (maker side normally, but the
 * creator may also submit — e.g. self-designed label). DRAFT/CHANGES_REQUESTED
 * → SUBMITTED → IN_REVIEW in one step (the demo's "Needs review").
 */
export async function submitObjectVersion(
  ctx: RoomCtx,
  objectId: string,
  payload: Record<string, unknown>,
): Promise<RoomResult> {
  const object = await loadObject(ctx.roomId, objectId)
  if (!object) return { ok: false, error: 'Object not found' }

  assertBuildObjectTransition(object.status, 'SUBMITTED')
  assertBuildObjectTransition('SUBMITTED', 'IN_REVIEW')

  // RECIPE rows auto-match against the catalog at submit time so the live
  // facts panel starts resolved (name-exact; the maker can pin misses later).
  if (object.kind === 'RECIPE') {
    const room = await prisma.coCreationRoom.findUnique({
      where: { id: ctx.roomId },
      select: { partnerId: true },
    })
    if (room) payload = await autoMatchRecipePayload(payload, room.partnerId)
  }

  // First submission keeps version 1; each resubmission increments.
  const version = object.status === 'DRAFT' ? 1 : object.currentVersion + 1

  await prisma.$transaction(async (tx) => {
    await tx.buildObjectVersion.create({
      data: {
        objectId: object.id,
        version,
        payload: payload as Prisma.InputJsonValue,
        submittedByPartner: ctx.actingAs === 'PARTNER',
      },
    })
    await tx.buildObject.update({
      where: { id: object.id },
      data: { status: 'IN_REVIEW', currentVersion: version },
    })
    await tx.roomEvent.create({
      data: {
        roomId: ctx.roomId,
        kind: 'OBJECT_SUBMITTED',
        data: { objectId: object.id, objectKind: object.kind, version, by: ctx.actorName },
      },
    })
  })

  await logAuditAs(ctx.actor, {
    entityType: 'BuildObject',
    entityId: object.id,
    action: 'BUILD_OBJECT_SUBMITTED',
    fromValue: object.status,
    toValue: 'IN_REVIEW',
    payload: { roomId: ctx.roomId, kind: object.kind, version },
  })

  await dispatchNotification({
    userId: ctx.counterpartUserId,
    event: 'BUILD_OBJECT_SUBMITTED',
    audience: ctx.actingAs === 'PARTNER' ? 'creator' : 'partner',
    data: { roomId: ctx.roomId, objectKind: object.kind, version, byName: ctx.actorName },
  })

  return { ok: true }
}

/** Approve or request changes on an IN_REVIEW object (creator side). */
export async function reviewObject(
  ctx: RoomCtx,
  objectId: string,
  decision: 'APPROVE' | 'REQUEST_CHANGES',
  note?: string,
): Promise<RoomResult> {
  const object = await loadObject(ctx.roomId, objectId)
  if (!object) return { ok: false, error: 'Object not found' }

  const to = decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED'
  assertBuildObjectTransition(object.status, to)

  await prisma.$transaction(async (tx) => {
    await tx.buildObject.update({ where: { id: object.id }, data: { status: to } })
    await tx.roomEvent.create({
      data: {
        roomId: ctx.roomId,
        kind: decision === 'APPROVE' ? 'OBJECT_APPROVED' : 'OBJECT_CHANGES_REQUESTED',
        data: {
          objectId: object.id,
          objectKind: object.kind,
          version: object.currentVersion,
          by: ctx.actorName,
          ...(note ? { note } : {}),
        },
      },
    })
  })

  await logAuditAs(ctx.actor, {
    entityType: 'BuildObject',
    entityId: object.id,
    action: decision === 'APPROVE' ? 'BUILD_OBJECT_APPROVED' : 'BUILD_OBJECT_CHANGES_REQUESTED',
    fromValue: object.status,
    toValue: to,
    payload: { roomId: ctx.roomId, kind: object.kind, version: object.currentVersion, note: note ?? null },
  })

  await dispatchNotification({
    userId: ctx.counterpartUserId,
    event: decision === 'APPROVE' ? 'BUILD_OBJECT_APPROVED' : 'BUILD_OBJECT_CHANGES_REQUESTED',
    audience: ctx.actingAs === 'CREATOR' ? 'partner' : 'creator',
    data: {
      roomId: ctx.roomId,
      objectKind: object.kind,
      version: object.currentVersion,
      byName: ctx.actorName,
      ...(note ? { note } : {}),
    },
  })

  return { ok: true }
}

/** Re-open an APPROVED/LOCKED object — any change to a locked object re-opens review. */
export async function reopenObject(ctx: RoomCtx, objectId: string): Promise<RoomResult> {
  const object = await loadObject(ctx.roomId, objectId)
  if (!object) return { ok: false, error: 'Object not found' }

  assertBuildObjectTransition(object.status, 'IN_REVIEW')

  await prisma.$transaction(async (tx) => {
    await tx.buildObject.update({ where: { id: object.id }, data: { status: 'IN_REVIEW' } })
    await tx.roomEvent.create({
      data: {
        roomId: ctx.roomId,
        kind: 'OBJECT_REOPENED',
        data: { objectId: object.id, objectKind: object.kind, by: ctx.actorName },
      },
    })
  })

  await logAuditAs(ctx.actor, {
    entityType: 'BuildObject',
    entityId: object.id,
    action: 'BUILD_OBJECT_REOPENED',
    fromValue: object.status,
    toValue: 'IN_REVIEW',
    payload: { roomId: ctx.roomId, kind: object.kind },
  })

  return { ok: true }
}

/**
 * Comment on an object — anchored to a formula line key or a label pin
 * ("x,y" coordinates), or unanchored. Content, not a state change: RoomEvent
 * for the activity feed, no AuditLog row.
 */
export async function addObjectComment(
  ctx: RoomCtx,
  objectId: string,
  body: string,
  anchor?: string,
): Promise<RoomResult> {
  const object = await loadObject(ctx.roomId, objectId)
  if (!object) return { ok: false, error: 'Object not found' }
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Empty comment' }
  if (trimmed.length > 2000) return { ok: false, error: 'Comment too long' }

  await prisma.$transaction(async (tx) => {
    await tx.buildObjectComment.create({
      data: {
        objectId: object.id,
        anchor: anchor?.slice(0, 120) ?? null,
        authorRole: ctx.actingAs,
        body: trimmed,
      },
    })
    await tx.roomEvent.create({
      data: {
        roomId: ctx.roomId,
        kind: 'COMMENT_ADDED',
        data: { objectId: object.id, objectKind: object.kind, by: ctx.actorName, anchor: anchor ?? null },
      },
    })
  })

  return { ok: true }
}

/** Send a room message (chat rail). Plain content — no audit, no event. */
export async function addRoomMessage(ctx: RoomCtx, body: string): Promise<RoomResult> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Empty message' }
  if (trimmed.length > 4000) return { ok: false, error: 'Message too long' }

  await prisma.roomMessage.create({
    data: { roomId: ctx.roomId, authorRole: ctx.actingAs, body: trimmed },
  })
  return { ok: true }
}
