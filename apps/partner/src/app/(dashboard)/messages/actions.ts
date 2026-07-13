'use server'

// Messages hub server actions — PARTNER side. Guards here (room must belong
// to the acting partner org / DM participation); mechanics in @ilaunchify/orders.

import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import {
  getRoomMembers,
  getOrCreateDmConversation,
  getThreadPresence,
  isConversationParticipant,
  markConversationRead,
  markRoomRead,
  recordHeartbeat,
  sendDirectMessage,
  sendRoomChatMessage,
  type ChatAttachment,
  type ThreadPresenceView,
} from '@ilaunchify/orders'
import { uploadFile, roomChatAttachmentKey, dmChatAttachmentKey } from '@ilaunchify/storage'
import { z } from 'zod'

export type MessagesActionResult = { ok: boolean; error?: string; warning?: string }

// Chat attachments — same rail + limits as ticket attachments.
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const AttachmentSchema = z.object({
  key: z.string().min(1).max(300),
  name: z.string().min(1).max(120),
  mimeType: z.string().min(1).max(80),
  size: z.number().int().positive().max(UPLOAD_MAX_BYTES),
})

/** Validate a client-echoed attachment: correct thread prefix + allowed type. */
function trustedAttachment(
  raw: unknown,
  prefix: string,
): ChatAttachment | { error: string } | null {
  if (raw === undefined || raw === null) return null
  const parsed = AttachmentSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Invalid attachment' }
  if (!parsed.data.key.startsWith(prefix)) return { error: 'Attachment does not belong to this thread' }
  if (!ALLOWED_MIME.has(parsed.data.mimeType)) return { error: 'Unsupported file type' }
  return parsed.data
}

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
  rawObjectRef?: { objectId: string },
  rawAttachment?: { key: string; name: string; mimeType: string; size: number },
): Promise<MessagesActionResult> {
  const ctx = await actingContext()
  if (!ctx) return { ok: false, error: 'No partner access' }
  const parsed = z.string().trim().max(4000).safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message too long' }
  if (!parsed.data && !rawAttachment) return { ok: false, error: 'Empty message' }

  const room = await orgRoom(roomId, ctx.access.partnerId)
  if (!room) return { ok: false, error: 'Room not found' }

  const { members, me } = await selfInRoom(roomId, ctx.user.id)
  if (!me) return { ok: false, error: 'Not a member of this room' }

  let objectRef: Awaited<ReturnType<typeof trustedObjectRef>> = null
  if (rawObjectRef) {
    const refParsed = ObjectRefSchema.safeParse(rawObjectRef)
    if (!refParsed.success) return { ok: false, error: 'Invalid object reference' }
    objectRef = await trustedObjectRef(roomId, refParsed.data.objectId)
    if (!objectRef) return { ok: false, error: 'That object is not in this room' }
  }

  const attachment = trustedAttachment(rawAttachment, `rooms/${roomId}/chat/`)
  if (attachment && 'error' in attachment) return { ok: false, error: attachment.error }

  const res = await sendRoomChatMessage({
    roomId,
    author: { userId: me.userId, name: me.name, roleLabel: me.roleLabel, side: 'PARTNER' },
    body: parsed.data,
    ...(objectRef ? { objectRef } : {}),
    ...(attachment ? { attachment } : {}),
    notifyUserIds: members.filter((m) => m.side === 'CREATOR').map((m) => m.userId),
    roomTitle: room.brief.title,
  })
  return res.ok ? { ok: true, ...(res.warning ? { warning: res.warning } : {}) } : { ok: false, error: res.error }
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
  rawAttachment?: { key: string; name: string; mimeType: string; size: number },
): Promise<MessagesActionResult> {
  const ctx = await actingContext()
  if (!ctx) return { ok: false, error: 'No partner access' }
  const parsed = z.string().trim().max(4000).safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message too long' }
  if (!parsed.data && !rawAttachment) return { ok: false, error: 'Empty message' }
  if (!(await isConversationParticipant(conversationId, ctx.user.id)))
    return { ok: false, error: 'Conversation not found' }

  const attachment = trustedAttachment(rawAttachment, `dms/${conversationId}/chat/`)
  if (attachment && 'error' in attachment) return { ok: false, error: attachment.error }

  const res = await sendDirectMessage({
    conversationId,
    authorUserId: ctx.user.id,
    authorName: ctx.user.name ?? 'Team member',
    authorRoleLabel: null,
    body: parsed.data,
    ...(attachment ? { attachment } : {}),
  })
  return res.ok ? { ok: true, ...(res.warning ? { warning: res.warning } : {}) } : { ok: false, error: res.error }
}

export async function markDmReadAction(conversationId: string): Promise<void> {
  const ctx = await actingContext()
  if (!ctx) return
  if (!(await isConversationParticipant(conversationId, ctx.user.id))) return
  await markConversationRead(conversationId, ctx.user.id)
}

/** Presence heartbeat + thread snapshot (short-poll realtime seam). */
export async function heartbeatAction(
  thread: { kind: 'room' | 'dm'; id: string } | null,
  typing: boolean,
): Promise<ThreadPresenceView[]> {
  const ctx = await actingContext()
  if (!ctx) return []
  if (!thread) {
    await recordHeartbeat(ctx.user.id, null, false)
    return []
  }
  const threadKey = `${thread.kind}:${thread.id}`

  if (thread.kind === 'room') {
    const room = await orgRoom(thread.id, ctx.access.partnerId)
    if (!room) return []
    await recordHeartbeat(ctx.user.id, threadKey, typing)
    const members = await getRoomMembers(thread.id)
    return getThreadPresence(members.map((m) => m.userId), threadKey)
  }

  if (!(await isConversationParticipant(thread.id, ctx.user.id))) return []
  await recordHeartbeat(ctx.user.id, threadKey, typing)
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: thread.id },
    select: { userId: true },
  })
  return getThreadPresence(participants.map((p) => p.userId), threadKey)
}

/** Upload a composer file to thread-scoped R2 storage (membership-guarded). */
export async function uploadChatAttachmentAction(
  thread: { kind: 'room' | 'dm'; id: string },
  formData: FormData,
): Promise<{ ok: boolean; attachment?: ChatAttachment; error?: string }> {
  const ctx = await actingContext()
  if (!ctx) return { ok: false, error: 'No partner access' }
  if (thread.kind === 'room') {
    if (!(await orgRoom(thread.id, ctx.access.partnerId))) return { ok: false, error: 'Room not found' }
  } else if (!(await isConversationParticipant(thread.id, ctx.user.id))) {
    return { ok: false, error: 'Conversation not found' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No file' }
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: 'File too large (max 15 MB)' }
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: 'Unsupported file type' }

  const key =
    thread.kind === 'room'
      ? roomChatAttachmentKey({ roomId: thread.id, filename: file.name })
      : dmChatAttachmentKey({ conversationId: thread.id, filename: file.name })
  await uploadFile({
    key,
    body: Buffer.from(await file.arrayBuffer()),
    contentType: mime,
    contentDisposition: `attachment; filename="${file.name.replace(/"/g, '')}"`,
  })
  return { ok: true, attachment: { key, name: file.name, mimeType: mime, size: file.size } }
}
