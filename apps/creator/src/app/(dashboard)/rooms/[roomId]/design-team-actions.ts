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
