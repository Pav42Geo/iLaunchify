'use server'

// Collaboration Room server actions — CREATOR side. Membership guard here
// (room must belong to a brief this user owns); FSM/audit/decision-log/
// notification mechanics live in @ilaunchify/orders room-service.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  addObjectComment,
  addRoomMessage,
  reopenObject,
  reviewObject,
  submitObjectVersion,
  type RoomCtx,
} from '@ilaunchify/orders'
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
        }),
      )
      .max(60)
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

export async function creatorMessage(roomId: string, body: string): Promise<RoomActionResult> {
  const ctx = await creatorRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await addRoomMessage(ctx, body)
  revalidatePath(`/rooms/${roomId}`)
  return res
}
