'use server'

// Design team (invited designer) server actions — CREATOR side.
// Shared Design Workspace C2/C3 (D-W1…D-W6 LOCKED 2026-07-13). Room-ownership
// guards HERE; seat mechanics in @ilaunchify/orders design-collaboration-service.
// Separate file from actions.ts on purpose (that file is Code's single-writer).

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  inviteDesigner,
  revokeDesignerSeat,
  listRoomDesignerSeats,
  decideDesignReview,
  requestDesignReview,
  setDesignReviewAutoApprove,
  getCollaboratorAccessForUser,
  type DesignerSeatView,
} from '@ilaunchify/orders'
import { z } from 'zod'

type Result = { ok: boolean; error?: string }

/** Room owned by this creator, with what the invite email needs. */
async function ownedRoom(roomId: string, userId: string) {
  return prisma.coCreationRoom.findFirst({
    where: { id: roomId, brief: { creator: { userId } } },
    select: {
      id: true,
      status: true,
      brief: {
        select: {
          title: true,
          creator: { select: { userId: true, displayName: true, subscriptionTier: true } },
        },
      },
    },
  })
}

export async function inviteDesignerAction(roomId: string, rawEmail: string): Promise<Result> {
  const user = await requireUser()
  const parsed = z.string().trim().min(3).max(200).safeParse(rawEmail)
  if (!parsed.success) return { ok: false, error: 'Enter a valid email address.' }

  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }
  if (room.status !== 'ACTIVE') return { ok: false, error: 'This room is closed.' }

  const res = await inviteDesigner({
    actor: { id: user.id, role: 'CREATOR' },
    roomId,
    creatorUserId: user.id,
    creatorTier: room.brief.creator.subscriptionTier.toLowerCase(),
    creatorName: room.brief.creator.displayName,
    briefTitle: room.brief.title,
    email: parsed.data,
  })
  if (res.ok) revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function revokeDesignerAction(roomId: string, seatId: string): Promise<Result> {
  const user = await requireUser()
  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }

  const res = await revokeDesignerSeat({
    actor: { id: user.id, role: 'CREATOR' },
    roomId,
    seatId,
  })
  if (res.ok) revalidatePath(`/rooms/${roomId}`)
  return res
}

/** Loader used by the room page (ownership re-checked here for safety). */
export async function loadDesignerSeats(roomId: string): Promise<DesignerSeatView[]> {
  const user = await requireUser()
  const room = await ownedRoom(roomId, user.id)
  if (!room) return []
  return listRoomDesignerSeats(roomId)
}

/**
 * C7 — creator decides the internal design review (from the room card or the
 * Studio). Canva rule downstream: further edits raise a NEW request.
 */
export async function decideDesignReviewAction(
  roomId: string,
  requestId: string,
  decision: 'APPROVED' | 'CHANGES_REQUESTED',
  note?: string,
): Promise<Result> {
  const user = await requireUser()
  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }

  const res = await decideDesignReview({
    actor: { id: user.id, role: 'CREATOR' },
    actorName: room.brief.creator.displayName,
    roomId,
    requestId,
    decision,
    briefTitle: room.brief.title,
    note,
  })
  if (res.ok) revalidatePath(`/rooms/${roomId}`)
  return res
}

/**
 * Creator's per-room auto-approve toggle (Pavel 2026-07-13): strictly a
 * creator⇄designer setting — deliberately no admin path.
 */
export async function setAutoApproveAction(roomId: string, enabled: boolean): Promise<Result> {
  const user = await requireUser()
  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }
  const res = await setDesignReviewAutoApprove({
    actor: { id: user.id, role: 'CREATOR' },
    roomId,
    enabled,
  })
  if (res.ok) revalidatePath(`/rooms/${roomId}`)
  return res
}

/**
 * C7 — mark the room's design ready for internal review. Callable by the
 * creator OR an invited designer with edit access (Code's Studio button
 * imports this); the workspace-access engine is the guard.
 */
export async function requestDesignReviewAction(
  roomId: string,
  designId: string,
  note?: string,
): Promise<Result> {
  const user = await requireUser()

  const access = await getCollaboratorAccessForUser(roomId, user.id)
  if (!access.canEdit) return { ok: false, error: 'No edit access to this workspace' }

  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    select: {
      status: true,
      brief: { select: { title: true, creator: { select: { userId: true } } } },
    },
  })
  if (!room || room.status !== 'ACTIVE') return { ok: false, error: 'Room not found' }

  const res = await requestDesignReview({
    actor: { id: user.id, role: access.isOwner ? 'CREATOR' : 'DESIGNER' },
    actorName: user.name ?? user.email ?? 'A collaborator',
    roomId,
    designId,
    creatorUserId: room.brief.creator.userId,
    briefTitle: room.brief.title,
    note,
  })
  if (res.ok) revalidatePath(`/rooms/${roomId}`)
  return res
}
