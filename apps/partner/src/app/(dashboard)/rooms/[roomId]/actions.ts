'use server'

// Collaboration Room server actions — PARTNER (maker) side. Membership guard:
// the acting user's partner org must be the room's selected partner. Makers
// submit versions, comment, and message — they never approve/review their own
// work (creator-only), so no review action is exposed here.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import {
  addObjectComment,
  addRoomMessage,
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
    fields: z
      .array(z.object({ label: z.string().trim().max(80), value: z.string().trim().max(300) }))
      .max(40)
      .optional(),
  })
  .strict()

async function partnerRoomCtx(roomId: string): Promise<RoomCtx | null> {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)
  if (!access) return null
  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, partnerId: access.partnerId, status: 'ACTIVE' },
    include: {
      brief: { include: { creator: { select: { userId: true } } } },
      partner: { select: { companyName: true } },
    },
  })
  if (!room) return null
  return {
    actor: user,
    actingAs: 'PARTNER',
    actorName: room.partner.companyName,
    counterpartUserId: room.brief.creator.userId,
    roomId: room.id,
  }
}

function guardFail(): RoomActionResult {
  return { ok: false, error: 'Room not found or not active' }
}

export async function partnerSubmitVersion(
  roomId: string,
  objectId: string,
  payload: Record<string, unknown>,
): Promise<RoomActionResult> {
  const ctx = await partnerRoomCtx(roomId)
  if (!ctx) return guardFail()
  const parsed = PayloadSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: 'Invalid payload' }
  const res = await submitObjectVersion(ctx, objectId, parsed.data)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function partnerComment(
  roomId: string,
  objectId: string,
  body: string,
  anchor?: string,
): Promise<RoomActionResult> {
  const ctx = await partnerRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await addObjectComment(ctx, objectId, body, anchor)
  revalidatePath(`/rooms/${roomId}`)
  return res
}

export async function partnerMessage(roomId: string, body: string): Promise<RoomActionResult> {
  const ctx = await partnerRoomCtx(roomId)
  if (!ctx) return guardFail()
  const res = await addRoomMessage(ctx, body)
  revalidatePath(`/rooms/${roomId}`)
  return res
}
