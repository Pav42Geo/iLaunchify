// Rooms & Messages hub — service layer (2026-07-13).
//
// One Messages surface per app (creator /messages, partner /messages): a rail
// of collaboration rooms + 1:1 direct messages, a chat pane where the author's
// SPECIALIST ROLE travels with every message (Twitch-badge pattern — the
// creator always knows who they're talking with), and a members panel grouped
// by side (Discord pattern). Design contract: design/room-messages-prototype.html
// (light rail per Pavel 2026-07-13).
//
// CALLERS OWN THE GUARDS (same rule as room-service.ts): every function assumes
// the actor's room/conversation membership was verified by the calling server
// action. Loaders here scope by userId/partnerId in the query itself.
//
// Anti-spam notification rule: ROOM_MESSAGE_RECEIVED / DIRECT_MESSAGE_RECEIVED
// dispatch only when the recipient had NO unread messages in that thread —
// the first message pings, the rest ride the unread badge.

import { prisma, getCoCreationSettings, type RoomStatus } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'
import { logAuditAs } from '@ilaunchify/audit'
import { evaluateContactLeak, CONTACT_LEAK_WARNING } from './contact-leak'

import {
  chatAttachmentFromPayload,
  countUnread,
  isOnline,
  isTypingIn,
  memberRoleLabel,
  messagePreview,
  type ChatAttachment,
  type MessagingSide,
} from './messaging-pure'

// Pure helpers live in messaging-pure.ts (network-free test suite); re-export
// so consumers keep one import surface.
export {
  chatAttachmentFromPayload,
  countUnread,
  isOnline,
  isTypingIn,
  memberRoleLabel,
  messagePreview,
  PRESENCE_ONLINE_MS,
  TYPING_ACTIVE_MS,
  type ChatAttachment,
  type MessagingSide,
  type PresenceRow,
} from './messaging-pure'

// ─────────────────────────────────────────────────────────────────────────────
// Types (UI contract — consumed by packages/ui MessagesShell)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessageView {
  id: string
  authorRole: string
  authorUserId: string | null
  authorName: string | null
  authorRoleLabel: string | null
  body: string
  objectRef: { kind: string; objectId: string; title: string; subtitle?: string } | null
  attachment: ChatAttachment | null
  createdAt: string // ISO
}

export interface RoomThreadSummary {
  id: string
  title: string
  nicheSlug: string
  counterpartName: string
  status: string
  lastMessage: { byName: string | null; body: string; createdAt: string } | null
  unreadCount: number
}

export interface ConversationSummary {
  id: string
  otherUserId: string | null
  otherName: string
  otherRoleLabel: string | null
  otherSide: MessagingSide
  lastMessage: { mine: boolean; body: string; createdAt: string } | null
  unreadCount: number
}

export interface ThreadMemberView {
  userId: string
  name: string
  roleLabel: string
  side: MessagingSide
  isAdmin: boolean
}

function toObjectRef(v: unknown): ChatMessageView['objectRef'] {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.kind !== 'string' || typeof o.objectId !== 'string' || typeof o.title !== 'string')
    return null
  return {
    kind: o.kind,
    objectId: o.objectId,
    title: o.title,
    ...(typeof o.subtitle === 'string' ? { subtitle: o.subtitle } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail loaders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rooms rail for one user. Creator side scopes by brief ownership; partner
 * side by the partner org(s) the user belongs to. ACTIVE rooms first, then
 * recently closed-won (production context lives on).
 */
export async function listMessagingRooms(
  userId: string,
  side: MessagingSide,
  partnerId?: string,
): Promise<RoomThreadSummary[]> {
  const visible: RoomStatus[] = ['ACTIVE', 'CLOSED_WON']
  const where =
    side === 'CREATOR'
      ? { brief: { creator: { userId } }, status: { in: visible } }
      : { partnerId: partnerId ?? '__none__', status: { in: visible } }

  const rooms = await prisma.coCreationRoom.findMany({
    where,
    include: {
      brief: {
        select: { title: true, nicheSlug: true, creator: { select: { displayName: true } } },
      },
      partner: { select: { companyName: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 60 },
      readCursors: { where: { userId }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  })

  return rooms
    .map((r) => {
      const last = r.messages[0] ?? null
      const cursor = r.readCursors[0]?.lastReadAt ?? null
      return {
        id: r.id,
        title: r.brief.title,
        nicheSlug: r.brief.nicheSlug,
        counterpartName:
          side === 'CREATOR' ? r.partner.companyName : r.brief.creator.displayName,
        status: r.status,
        lastMessage: last
          ? {
              byName: last.authorName ?? (last.authorRole === side ? 'You' : null),
              body: messagePreview(last.body, 60),
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unreadCount: countUnread(r.messages, { userId, side }, cursor),
        lastAt: last?.createdAt.getTime() ?? r.updatedAt.getTime(),
      }
    })
    .sort((a, b) => b.lastAt - a.lastAt)
    .map(({ lastAt: _lastAt, ...rest }) => rest)
}

/** DM rail for one user, most recent first, with unread counts. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const mine = await prisma.conversationParticipant.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          participants: true,
          messages: { orderBy: { createdAt: 'desc' }, take: 30 },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
    take: 30,
  })

  return mine.map((p) => {
    const other = p.conversation.participants.find((x) => x.userId !== userId)
    const last = p.conversation.messages[0] ?? null
    const unread = p.conversation.messages.filter(
      (m) =>
        m.authorUserId !== userId &&
        m.createdAt.getTime() > (p.lastReadAt?.getTime() ?? 0),
    ).length
    return {
      id: p.conversationId,
      otherUserId: other?.userId ?? null,
      otherName: other?.displayName ?? 'Collaborator',
      otherRoleLabel: other?.roleLabel ?? null,
      otherSide: (other?.side === 'PARTNER' ? 'PARTNER' : 'CREATOR') as MessagingSide,
      lastMessage: last
        ? {
            mine: last.authorUserId === userId,
            body: messagePreview(last.body, 60),
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unreadCount: unread,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread loaders
// ─────────────────────────────────────────────────────────────────────────────

export async function listRoomChatMessages(roomId: string, take = 200): Promise<ChatMessageView[]> {
  const rows = await prisma.roomMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'asc' },
    take,
  })
  return rows.map((m) => ({
    id: m.id,
    authorRole: m.authorRole,
    authorUserId: m.authorUserId,
    authorName: m.authorName,
    authorRoleLabel: m.authorRoleLabel,
    body: m.body,
    objectRef: toObjectRef(m.objectRef),
    attachment: chatAttachmentFromPayload(m.attachment),
    createdAt: m.createdAt.toISOString(),
  }))
}

export async function listDirectMessages(
  conversationId: string,
  take = 200,
): Promise<
  { id: string; authorUserId: string; body: string; attachment: ChatAttachment | null; createdAt: string }[]
> {
  const rows = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take,
  })
  return rows.map((m) => ({
    id: m.id,
    authorUserId: m.authorUserId,
    body: m.body,
    attachment: chatAttachmentFromPayload(m.attachment),
    createdAt: m.createdAt.toISOString(),
  }))
}

/**
 * Members panel, grouped by side. Creator side = the brief owner (creator
 * teammates arrive with the V1.5 creator-team model); partner side = every
 * non-removed PartnerMembership of the maker org, with the specialist label.
 */
export async function getRoomMembers(roomId: string): Promise<ThreadMemberView[]> {
  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    select: {
      partnerId: true,
      brief: { select: { creator: { select: { userId: true, displayName: true } } } },
    },
  })
  if (!room) return []

  const memberships = await prisma.partnerMembership.findMany({
    where: { partnerId: room.partnerId, removedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true } },
      serviceMemberships: { where: { removedAt: null }, select: { roles: true } },
    },
    orderBy: { acceptedAt: 'asc' },
    take: 25,
  })

  const creatorRow: ThreadMemberView = {
    userId: room.brief.creator.userId,
    name: room.brief.creator.displayName,
    roleLabel: 'Owner',
    side: 'CREATOR',
    isAdmin: true,
  }

  const partnerRows: ThreadMemberView[] = memberships.map((m) => ({
    userId: m.user.id,
    name: m.user.name ?? m.user.email,
    roleLabel: memberRoleLabel({
      title: m.title,
      isAdmin: m.isAdmin,
      serviceRoles: m.serviceMemberships.flatMap((s) => s.roles as string[]),
    }),
    side: 'PARTNER',
    isAdmin: m.isAdmin,
  }))

  return [creatorRow, ...partnerRows]
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export interface SendRoomMessageInput {
  roomId: string
  author: { userId: string; name: string; roleLabel: string | null; side: MessagingSide }
  body: string
  objectRef?: { kind: string; objectId: string; title: string; subtitle?: string }
  /** Pre-uploaded R2 attachment (key validated by the calling action). */
  attachment?: ChatAttachment
  /** Users on the other side to ping if this is their first unread. */
  notifyUserIds?: string[]
  roomTitle?: string
}

export type MessagingResult =
  | { ok: true; id?: string; warning?: string }
  | { ok: false; error: string }

/**
 * Anti-circumvention choke point (single place for room chat + DMs).
 * Returns BLOCK error copy, a WARN(-and-flag) warning, or nothing.
 */
async function applyContactLeakPolicy(input: {
  body: string
  actor: { id: string; role: 'CREATOR' | 'PARTNER' }
  entityType: 'RoomMessage' | 'DirectMessage'
  threadId: string
}): Promise<{ blocked?: string; warning?: string; flag?: () => Promise<void> }> {
  const policy = (await getCoCreationSettings()).contactLeakPolicy
  const verdict = evaluateContactLeak(input.body, policy)
  if (verdict.action === 'ALLOW') return {}
  if (verdict.action === 'BLOCK') return { blocked: CONTACT_LEAK_WARNING }
  const result: { warning: string; flag?: () => Promise<void> } = {
    warning: CONTACT_LEAK_WARNING,
  }
  if (verdict.action === 'WARN_AND_FLAG') {
    // Flag runs AFTER the message row exists (caller invokes with the id).
    result.flag = async () => {
      await logAuditAs(
        { id: input.actor.id, role: input.actor.role },
        {
          entityType: input.entityType,
          entityId: input.threadId,
          action: 'CONTACT_LEAK_FLAGGED',
          payload: {
            kinds: [...new Set(verdict.matches.map((m) => m.kind))],
            excerpts: verdict.matches.slice(0, 5).map((m) => m.excerpt),
          },
        },
      ).catch(() => undefined) // flag is best-effort; never fail the send
    }
  }
  return result
}

export async function sendRoomChatMessage(input: SendRoomMessageInput): Promise<MessagingResult> {
  const body = input.body.trim()
  // Attachment-only sends are fine; text-only sends still need text.
  if (!body && !input.attachment) return { ok: false, error: 'Empty message' }
  if (body.length > 4000) return { ok: false, error: 'Message too long' }

  // Anti-circumvention (admin policy: OFF / WARN / WARN_AND_FLAG / BLOCK).
  const leak = await applyContactLeakPolicy({
    body,
    actor: { id: input.author.userId, role: input.author.side },
    entityType: 'RoomMessage',
    threadId: input.roomId,
  })
  if (leak.blocked) return { ok: false, error: leak.blocked }

  const created = await prisma.roomMessage.create({
    data: {
      roomId: input.roomId,
      authorRole: input.author.side,
      authorUserId: input.author.userId,
      authorName: input.author.name,
      authorRoleLabel: input.author.roleLabel,
      body,
      ...(input.objectRef ? { objectRef: input.objectRef } : {}),
      ...(input.attachment ? { attachment: input.attachment } : {}),
    },
  })
  // Sender has obviously read their own message.
  await markRoomRead(input.roomId, input.author.userId)

  // First-unread-only ping for each counterpart.
  for (const uid of input.notifyUserIds ?? []) {
    if (uid === input.author.userId) continue
    const cursor = await prisma.roomReadCursor.findUnique({
      where: { roomId_userId: { roomId: input.roomId, userId: uid } },
      select: { lastReadAt: true },
    })
    const unreadBefore = await prisma.roomMessage.count({
      where: {
        roomId: input.roomId,
        id: { not: created.id },
        authorUserId: { not: uid },
        createdAt: { gt: cursor?.lastReadAt ?? new Date(0) },
      },
    })
    if (unreadBefore === 0) {
      await dispatchNotification({
        userId: uid,
        event: 'ROOM_MESSAGE_RECEIVED',
        audience: input.author.side === 'CREATOR' ? 'partner' : 'creator',
        data: {
          roomId: input.roomId,
          roomTitle: input.roomTitle ?? 'your collaboration room',
          byName: input.author.name,
          ...(input.author.roleLabel ? { roleLabel: input.author.roleLabel } : {}),
          preview: body ? messagePreview(body) : `📎 ${input.attachment?.name ?? 'attachment'}`,
        },
      })
    }
  }
  if (leak.flag) await leak.flag()
  return { ok: true, id: created.id, ...(leak.warning ? { warning: leak.warning } : {}) }
}

export async function markRoomRead(roomId: string, userId: string): Promise<void> {
  await prisma.roomReadCursor.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  })
}

export interface DmParty {
  userId: string
  displayName: string
  roleLabel: string | null
  side: MessagingSide
}

/** Find-or-create the 1:1 thread between two users (optionally room-scoped). */
export async function getOrCreateDmConversation(
  me: DmParty,
  other: DmParty,
  originRoomId?: string,
): Promise<{ id: string }> {
  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: me.userId } } },
        { participants: { some: { userId: other.userId } } },
      ],
    },
    select: { id: true },
  })
  if (existing) return existing

  return prisma.conversation.create({
    data: {
      ...(originRoomId ? { originRoomId } : {}),
      participants: {
        create: [
          {
            userId: me.userId,
            displayName: me.displayName,
            roleLabel: me.roleLabel,
            side: me.side,
            lastReadAt: new Date(),
          },
          {
            userId: other.userId,
            displayName: other.displayName,
            roleLabel: other.roleLabel,
            side: other.side,
          },
        ],
      },
    },
    select: { id: true },
  })
}

export async function sendDirectMessage(input: {
  conversationId: string
  authorUserId: string
  authorName: string
  authorRoleLabel: string | null
  body: string
  attachment?: ChatAttachment
}): Promise<MessagingResult> {
  const body = input.body.trim()
  if (!body && !input.attachment) return { ok: false, error: 'Empty message' }
  if (body.length > 4000) return { ok: false, error: 'Message too long' }

  const me = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.authorUserId,
      },
    },
    include: { conversation: { include: { participants: true } } },
  })
  if (!me) return { ok: false, error: 'Not a participant' }

  // Anti-circumvention — DMs are the likeliest leak channel; same policy.
  const leak = await applyContactLeakPolicy({
    body,
    actor: { id: input.authorUserId, role: me.side === 'PARTNER' ? 'PARTNER' : 'CREATOR' },
    entityType: 'DirectMessage',
    threadId: input.conversationId,
  })
  if (leak.blocked) return { ok: false, error: leak.blocked }

  const created = await prisma.directMessage.create({
    data: {
      conversationId: input.conversationId,
      authorUserId: input.authorUserId,
      body,
      ...(input.attachment ? { attachment: input.attachment } : {}),
    },
  })
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  })
  await markConversationRead(input.conversationId, input.authorUserId)

  for (const p of me.conversation.participants) {
    if (p.userId === input.authorUserId) continue
    const unreadBefore = await prisma.directMessage.count({
      where: {
        conversationId: input.conversationId,
        id: { not: created.id },
        authorUserId: { not: p.userId },
        createdAt: { gt: p.lastReadAt ?? new Date(0) },
      },
    })
    if (unreadBefore === 0) {
      await dispatchNotification({
        userId: p.userId,
        event: 'DIRECT_MESSAGE_RECEIVED',
        audience: p.side === 'PARTNER' ? 'partner' : 'creator',
        data: {
          conversationId: input.conversationId,
          byName: input.authorName,
          ...(input.authorRoleLabel ? { roleLabel: input.authorRoleLabel } : {}),
          preview: body ? messagePreview(body) : `📎 ${input.attachment?.name ?? 'attachment'}`,
        },
      })
    }
  }
  if (leak.flag) await leak.flag()
  return { ok: true, id: created.id, ...(leak.warning ? { warning: leak.warning } : {}) }
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  })
}

/**
 * Number of threads (rooms + DMs) with unread messages — the sidebar badge.
 * Thread-count, not message-count (Slack-style: "3 conversations need you",
 * not "47 messages"), so a chatty thread never inflates the number.
 */
export async function countUnreadThreads(
  userId: string,
  side: MessagingSide,
  partnerId?: string,
): Promise<number> {
  const [rooms, convs] = await Promise.all([
    listMessagingRooms(userId, side, partnerId),
    listConversations(userId),
  ])
  return (
    rooms.filter((r) => r.unreadCount > 0).length + convs.filter((c) => c.unreadCount > 0).length
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence (DB heartbeat + short poll — see messaging-pure for semantics)
// ─────────────────────────────────────────────────────────────────────────────

export interface ThreadPresenceView {
  userId: string
  online: boolean
  typing: boolean
}

/**
 * Record a heartbeat for a user. `typing` marks the thread they're typing in
 * right now (cleared when false). Called every few seconds while /messages is
 * open — one upserted row per user, never unbounded growth.
 */
export async function recordHeartbeat(
  userId: string,
  threadKey: string | null,
  typing: boolean,
): Promise<void> {
  const now = new Date()
  const typingData = typing && threadKey ? { typingThreadKey: threadKey, typingAt: now } : { typingThreadKey: null, typingAt: null }
  await prisma.presenceState.upsert({
    where: { userId },
    create: { userId, lastSeenAt: now, ...typingData },
    update: { lastSeenAt: now, ...typingData },
  })
}

/** Presence snapshot for a thread's members (poll response). */
export async function getThreadPresence(
  userIds: string[],
  threadKey: string,
): Promise<ThreadPresenceView[]> {
  if (userIds.length === 0) return []
  const rows = await prisma.presenceState.findMany({ where: { userId: { in: userIds } } })
  const byUser = new Map(rows.map((r) => [r.userId, r]))
  const now = Date.now()
  return userIds.map((userId) => {
    const row = byUser.get(userId) ?? null
    return {
      userId,
      online: isOnline(row, now),
      typing: isTypingIn(row, threadKey, now),
    }
  })
}

/** Bulk online map (rail dots) — no typing, just lastSeenAt freshness. */
export async function getOnlineMap(userIds: string[]): Promise<Record<string, boolean>> {
  if (userIds.length === 0) return {}
  const rows = await prisma.presenceState.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, lastSeenAt: true },
  })
  const now = Date.now()
  const map: Record<string, boolean> = {}
  for (const id of userIds) map[id] = false
  for (const r of rows) map[r.userId] = isOnline(r, now)
  return map
}

/** Membership check for DM server actions (callers own the guards). */
export async function isConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  })
  return !!row
}
