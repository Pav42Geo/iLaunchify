'use server'

// Messages hub server actions — PARTNER side. Guards here (room must belong
// to the acting partner org / DM participation); mechanics in @ilaunchify/orders.

import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import {
  getRoomMembers,
  getOrCreateDmConversation,
  isConversationParticipant,
  markConversationRead,
  markRoomRead,
  sendDirectMessage,
  sendRoomChatMessage,
} from '@ilaunchify/orders'
import { z } from 'zod'

export type MessagesActionResult = { ok: boolean; error?: string }

const BodySchema = z.string().trim().min(1).max(4000)

async function actingContext() {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)
  return access ? { user, access } : null
}

async function orgRoom(roomId: string, partnerId: string) {
  return prisma.coCreationRoom.findFirst({
    where: { id: roomId, partnerId },
    select: { id: true, brief: { select: { title: true } } },
  })
}

/** This member's own name + specialist label, straight from the members list. */
async function selfInRoom(roomId: string, userId: string) {
  const members = await getRoomMembers(roomId)
  return {
    members,
    me: members.find((m) => m.userId === userId && m.side === 'PARTNER') ?? null,
  }
}

export async function sendRoomMessageAction(
  roomId: string,
  rawBody: string,
): Promise<MessagesActionResult> {
  const ctx = await actingContext()
  if (!ctx) return { ok: false, error: 'No partner access' }
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message must be 1–4000 characters' }

  const room = await orgRoom(roomId, ctx.access.partnerId)
  if (!room) return { ok: false, error: 'Room not found' }

  const { members, me } = await selfInRoom(roomId, ctx.user.id)
  if (!me) return { ok: false, error: 'Not a member of this room' }

  const res = await sendRoomChatMessage({
    roomId,
    author: { userId: me.userId, name: me.name, roleLabel: me.roleLabel, side: 'PARTNER' },
    body: parsed.data,
    notifyUserIds: members.filter((m) => m.side === 'CREATOR').map((m) => m.userId),
    roomTitle: room.brief.title,
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

export async function markRoomReadAction(roomId: string): Promise<void> {
  const ctx = await actingContext()
  if (!ctx) return
  const room = await orgRoom(roomId, ctx.access.partnerId)
  if (!room) return
  await markRoomRead(roomId, ctx.user.id)
}

export async function startDmAction(
  roomId: string,
  otherUserId: string,
): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  const ctx = await actingContext()
  if (!ctx) return { ok: false, error: 'No partner access' }
  const room = await orgRoom(roomId, ctx.access.partnerId)
  if (!room) return { ok: false, error: 'Room not found' }

  const { members, me } = await selfInRoom(roomId, ctx.user.id)
  if (!me) return { ok: false, error: 'Not a member of this room' }
  const other = members.find((m) => m.userId === otherUserId && m.userId !== ctx.user.id)
  if (!other) return { ok: false, error: 'Not a member of this room' }

  const conv = await getOrCreateDmConversation(
    { userId: me.userId, displayName: me.name, roleLabel: me.roleLabel, side: 'PARTNER' },
    { userId: other.userId, displayName: other.name, roleLabel: other.roleLabel, side: other.side },
    roomId,
  )
  return { ok: true, conversationId: conv.id }
}

export async function sendDmAction(
  conversationId: string,
  rawBody: string,
): Promise<MessagesActionResult> {
  const ctx = await actingContext()
  if (!ctx) return { ok: false, error: 'No partner access' }
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message must be 1–4000 characters' }
  if (!(await isConversationParticipant(conversationId, ctx.user.id)))
    return { ok: false, error: 'Conversation not found' }

  const res = await sendDirectMessage({
    conversationId,
    authorUserId: ctx.user.id,
    authorName: ctx.user.name ?? 'Team member',
    authorRoleLabel: null,
    body: parsed.data,
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

export async function markDmReadAction(conversationId: string): Promise<void> {
  const ctx = await actingContext()
  if (!ctx) return
  if (!(await isConversationParticipant(conversationId, ctx.user.id))) return
  await markConversationRead(conversationId, ctx.user.id)
}
