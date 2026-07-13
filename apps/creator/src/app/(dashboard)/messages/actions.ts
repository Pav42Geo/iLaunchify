'use server'

// Messages hub server actions — CREATOR side. Guards here (brief ownership /
// DM participation); message mechanics live in @ilaunchify/orders messaging.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
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

// ⧉ object anchor — only the id is trusted from the client; title/subtitle are
// re-derived server-side from the room's own object so a message can never
// carry a spoofed card.
const ObjectRefSchema = z.object({ objectId: z.string().min(1).max(64) })

const KIND_LABEL: Record<string, string> = {
  RECIPE: 'Recipe',
  PACKAGING: 'Packaging',
  LABEL: 'Label',
  SAMPLE: 'Sample',
  SPEC_SHEET: 'Spec sheet',
}

/** Resolve a client-picked object id into a trusted objectRef (or null). */
async function trustedObjectRef(roomId: string, objectId: string) {
  const obj = await prisma.buildObject.findFirst({
    where: { id: objectId, roomId },
    select: { id: true, kind: true, status: true, currentVersion: true },
  })
  if (!obj) return null
  const label = KIND_LABEL[obj.kind as string] ?? obj.kind
  return {
    kind: obj.kind as string,
    objectId: obj.id,
    title: `${label} v${obj.currentVersion}`,
    subtitle: (obj.status as string).replace(/_/g, ' ').toLowerCase(),
  }
}

/** Room this creator owns (via brief) or null. */
async function ownedRoom(roomId: string, userId: string) {
  return prisma.coCreationRoom.findFirst({
    where: { id: roomId, brief: { creator: { userId } } },
    select: {
      id: true,
      brief: { select: { title: true, creator: { select: { displayName: true } } } },
    },
  })
}

export async function sendRoomMessageAction(
  roomId: string,
  rawBody: string,
  rawObjectRef?: { objectId: string },
): Promise<MessagesActionResult> {
  const user = await requireUser()
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message must be 1–4000 characters' }

  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }

  let objectRef: Awaited<ReturnType<typeof trustedObjectRef>> = null
  if (rawObjectRef) {
    const refParsed = ObjectRefSchema.safeParse(rawObjectRef)
    if (!refParsed.success) return { ok: false, error: 'Invalid object reference' }
    objectRef = await trustedObjectRef(roomId, refParsed.data.objectId)
    if (!objectRef) return { ok: false, error: 'That object is not in this room' }
  }

  const members = await getRoomMembers(roomId)
  const res = await sendRoomChatMessage({
    roomId,
    author: {
      userId: user.id,
      name: room.brief.creator.displayName,
      roleLabel: 'Owner',
      side: 'CREATOR',
    },
    body: parsed.data,
    ...(objectRef ? { objectRef } : {}),
    notifyUserIds: members.filter((m) => m.side === 'PARTNER').map((m) => m.userId),
    roomTitle: room.brief.title,
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

export async function markRoomReadAction(roomId: string): Promise<void> {
  const user = await requireUser()
  const room = await ownedRoom(roomId, user.id)
  if (!room) return
  await markRoomRead(roomId, user.id)
}

export async function startDmAction(
  roomId: string,
  otherUserId: string,
): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
  const user = await requireUser()
  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }

  // The DM target must actually be a member of this room.
  const members = await getRoomMembers(roomId)
  const other = members.find((m) => m.userId === otherUserId && m.userId !== user.id)
  if (!other) return { ok: false, error: 'Not a member of this room' }

  const conv = await getOrCreateDmConversation(
    {
      userId: user.id,
      displayName: room.brief.creator.displayName,
      roleLabel: 'Creator',
      side: 'CREATOR',
    },
    {
      userId: other.userId,
      displayName: other.name,
      roleLabel: other.roleLabel,
      side: other.side,
    },
    roomId,
  )
  return { ok: true, conversationId: conv.id }
}

export async function sendDmAction(
  conversationId: string,
  rawBody: string,
): Promise<MessagesActionResult> {
  const user = await requireUser()
  const parsed = BodySchema.safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message must be 1–4000 characters' }
  if (!(await isConversationParticipant(conversationId, user.id)))
    return { ok: false, error: 'Conversation not found' }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { displayName: true },
  })
  const res = await sendDirectMessage({
    conversationId,
    authorUserId: user.id,
    authorName: profile?.displayName ?? 'Creator',
    authorRoleLabel: 'Creator',
    body: parsed.data,
  })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

export async function markDmReadAction(conversationId: string): Promise<void> {
  const user = await requireUser()
  if (!(await isConversationParticipant(conversationId, user.id))) return
  await markConversationRead(conversationId, user.id)
}
