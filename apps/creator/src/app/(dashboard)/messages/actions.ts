'use server'

// Messages hub server actions — CREATOR side. Guards here (brief ownership /
// DM participation); message mechanics live in @ilaunchify/orders messaging.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  getRoomMembers,
  getOrCreateDmConversation,
  getThreadPresence,
  isConversationParticipant,
  listDirectMessages,
  listRoomChatMessages,
  markConversationRead,
  markRoomRead,
  recordHeartbeat,
  sendDirectMessage,
  sendRoomChatMessage,
  type ChatAttachment,
  type ThreadPresenceView,
} from '@ilaunchify/orders'
import { uploadFile, roomChatAttachmentKey, dmChatAttachmentKey, getSignedReadUrl } from '@ilaunchify/storage'
import type { ShellChatMessage } from '@ilaunchify/ui'
import { z } from 'zod'

export type MessagesActionResult = { ok: boolean; error?: string; warning?: string }

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
  rawAttachment?: { key: string; name: string; mimeType: string; size: number },
): Promise<MessagesActionResult> {
  const user = await requireUser()
  const parsed = z.string().trim().max(4000).safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message too long' }
  if (!parsed.data && !rawAttachment) return { ok: false, error: 'Empty message' }

  const room = await ownedRoom(roomId, user.id)
  if (!room) return { ok: false, error: 'Room not found' }

  let objectRef: Awaited<ReturnType<typeof trustedObjectRef>> = null
  if (rawObjectRef) {
    const refParsed = ObjectRefSchema.safeParse(rawObjectRef)
    if (!refParsed.success) return { ok: false, error: 'Invalid object reference' }
    objectRef = await trustedObjectRef(roomId, refParsed.data.objectId)
    if (!objectRef) return { ok: false, error: 'That object is not in this room' }
  }

  const attachment = trustedAttachment(rawAttachment, `rooms/${roomId}/chat/`)
  if (attachment && 'error' in attachment) return { ok: false, error: attachment.error }

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
    ...(attachment ? { attachment } : {}),
    notifyUserIds: members.filter((m) => m.side === 'PARTNER').map((m) => m.userId),
    roomTitle: room.brief.title,
  })
  return res.ok ? { ok: true, ...(res.warning ? { warning: res.warning } : {}) } : { ok: false, error: res.error }
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
  rawAttachment?: { key: string; name: string; mimeType: string; size: number },
): Promise<MessagesActionResult> {
  const user = await requireUser()
  const parsed = z.string().trim().max(4000).safeParse(rawBody)
  if (!parsed.success) return { ok: false, error: 'Message too long' }
  if (!parsed.data && !rawAttachment) return { ok: false, error: 'Empty message' }
  if (!(await isConversationParticipant(conversationId, user.id)))
    return { ok: false, error: 'Conversation not found' }

  const attachment = trustedAttachment(rawAttachment, `dms/${conversationId}/chat/`)
  if (attachment && 'error' in attachment) return { ok: false, error: attachment.error }

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
    ...(attachment ? { attachment } : {}),
  })
  return res.ok ? { ok: true, ...(res.warning ? { warning: res.warning } : {}) } : { ok: false, error: res.error }
}

export async function markDmReadAction(conversationId: string): Promise<void> {
  const user = await requireUser()
  if (!(await isConversationParticipant(conversationId, user.id))) return
  await markConversationRead(conversationId, user.id)
}

/**
 * Presence heartbeat + thread snapshot (short-poll realtime seam). Records
 * "I'm here (and typing?)" and returns the thread members' presence so the
 * shell can paint dots + the typing line without a full refresh.
 */
export async function heartbeatAction(
  thread: { kind: 'room' | 'dm'; id: string } | null,
  typing: boolean,
): Promise<ThreadPresenceView[]> {
  const user = await requireUser()
  if (!thread) {
    await recordHeartbeat(user.id, null, false)
    return []
  }
  const threadKey = `${thread.kind}:${thread.id}`

  if (thread.kind === 'room') {
    const room = await ownedRoom(thread.id, user.id)
    if (!room) return []
    await recordHeartbeat(user.id, threadKey, typing)
    const members = await getRoomMembers(thread.id)
    return getThreadPresence(members.map((m) => m.userId), threadKey)
  }

  if (!(await isConversationParticipant(thread.id, user.id))) return []
  await recordHeartbeat(user.id, threadKey, typing)
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: thread.id },
    select: { userId: true },
  })
  return getThreadPresence(participants.map((p) => p.userId), threadKey)
}

/** Fail-soft signed URL for a chat attachment (same semantics as the page). */
async function signAttachment(a: ChatAttachment | null): Promise<ShellChatMessage['attachment']> {
  if (!a) return null
  try {
    const url = await getSignedReadUrl(a.key)
    return { name: a.name, url, mimeType: a.mimeType, size: a.size }
  } catch {
    return null
  }
}

/**
 * History pagination — the page BEFORE `beforeId` (membership-guarded).
 * Returns shell-shaped messages ascending, attachments pre-signed.
 */
export async function loadEarlierMessagesAction(
  thread: { kind: 'room' | 'dm'; id: string },
  beforeId: string,
): Promise<{ ok: boolean; messages?: ShellChatMessage[]; hasEarlier?: boolean; error?: string }> {
  const user = await requireUser()
  const cursor = z.string().min(1).max(64).safeParse(beforeId)
  if (!cursor.success) return { ok: false, error: 'Invalid cursor' }

  if (thread.kind === 'room') {
    if (!(await ownedRoom(thread.id, user.id))) return { ok: false, error: 'Room not found' }
    const { messages, hasEarlier } = await listRoomChatMessages(thread.id, { beforeId: cursor.data })
    return {
      ok: true,
      hasEarlier,
      messages: await Promise.all(
        messages.map(async (m) => ({ ...m, attachment: await signAttachment(m.attachment) })),
      ),
    }
  }

  if (!(await isConversationParticipant(thread.id, user.id)))
    return { ok: false, error: 'Conversation not found' }
  const parts = await prisma.conversationParticipant.findMany({
    where: { conversationId: thread.id },
    select: { userId: true, displayName: true, roleLabel: true, side: true },
  })
  const other = parts.find((p) => p.userId !== user.id)
  const { messages, hasEarlier } = await listDirectMessages(thread.id, { beforeId: cursor.data })
  return {
    ok: true,
    hasEarlier,
    messages: await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        authorUserId: m.authorUserId,
        authorName: m.authorUserId === user.id ? 'You' : (other?.displayName ?? 'Collaborator'),
        authorRoleLabel: m.authorUserId === user.id ? null : (other?.roleLabel ?? null),
        authorRole: m.authorUserId === user.id ? 'CREATOR' : other?.side === 'PARTNER' ? 'PARTNER' : 'CREATOR',
        body: m.body,
        objectRef: null,
        attachment: await signAttachment(m.attachment),
        createdAt: m.createdAt,
      })),
    ),
  }
}

/**
 * Dock snapshot — the mini-chat window's poll (membership-guarded). Returns
 * the newest window of shell-shaped messages + names for the typing line.
 */
export async function loadDockThreadAction(thread: { kind: 'room' | 'dm'; id: string }): Promise<{
  ok: boolean
  title?: string
  subtitle?: string
  messages?: ShellChatMessage[]
  memberNames?: Record<string, string>
  error?: string
}> {
  const user = await requireUser()

  if (thread.kind === 'room') {
    const room = await ownedRoom(thread.id, user.id)
    if (!room) return { ok: false, error: 'Room not found' }
    const [{ messages }, members] = await Promise.all([
      listRoomChatMessages(thread.id, { limit: 40 }),
      getRoomMembers(thread.id),
    ])
    return {
      ok: true,
      title: room.brief.title,
      memberNames: Object.fromEntries(members.map((m) => [m.userId, m.name])),
      messages: await Promise.all(
        messages.map(async (m) => ({ ...m, attachment: await signAttachment(m.attachment) })),
      ),
    }
  }

  if (!(await isConversationParticipant(thread.id, user.id)))
    return { ok: false, error: 'Conversation not found' }
  const parts = await prisma.conversationParticipant.findMany({
    where: { conversationId: thread.id },
    select: { userId: true, displayName: true, roleLabel: true, side: true },
  })
  const other = parts.find((p) => p.userId !== user.id)
  const { messages } = await listDirectMessages(thread.id, { limit: 40 })
  return {
    ok: true,
    title: other?.displayName ?? 'Direct message',
    subtitle: other?.roleLabel ?? undefined,
    memberNames: Object.fromEntries(parts.map((p) => [p.userId, p.displayName])),
    messages: await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        authorUserId: m.authorUserId,
        authorName: m.authorUserId === user.id ? 'You' : (other?.displayName ?? 'Collaborator'),
        authorRoleLabel: m.authorUserId === user.id ? null : (other?.roleLabel ?? null),
        authorRole: m.authorUserId === user.id ? 'CREATOR' : other?.side === 'PARTNER' ? 'PARTNER' : 'CREATOR',
        body: m.body,
        objectRef: null,
        attachment: await signAttachment(m.attachment),
        createdAt: m.createdAt,
      })),
    ),
  }
}

/** Upload a composer file to thread-scoped R2 storage (membership-guarded). */
export async function uploadChatAttachmentAction(
  thread: { kind: 'room' | 'dm'; id: string },
  formData: FormData,
): Promise<{ ok: boolean; attachment?: ChatAttachment; error?: string }> {
  const user = await requireUser()
  if (thread.kind === 'room') {
    if (!(await ownedRoom(thread.id, user.id))) return { ok: false, error: 'Room not found' }
  } else if (!(await isConversationParticipant(thread.id, user.id))) {
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
