// Rooms & Messages — PURE helpers (no Prisma, no network). Kept separate from
// messaging.ts so the vitest pure-suite runner can execute messaging.test.ts
// without touching the DB client (same split as maker-switch / merit-fee).

export type MessagingSide = 'CREATOR' | 'PARTNER'

/**
 * Specialist label for a partner team member. Precedence:
 * explicit free-text title → service-role-derived → org admin → generic.
 */
export function memberRoleLabel(input: {
  title: string | null
  isAdmin: boolean
  serviceRoles: string[]
}): string {
  const title = input.title?.trim()
  if (title) return title
  const roles = new Set(input.serviceRoles)
  if (roles.has('PARTNER_PREPRESS') && roles.has('PARTNER_PRODUCTION')) return 'Prepress & Production'
  if (roles.has('PARTNER_PREPRESS')) return 'Prepress'
  if (roles.has('PARTNER_PRODUCTION')) return 'Production'
  if (input.isAdmin) return 'Team Admin'
  return 'Team Member'
}

/** Truncated single-line preview for notification copy. */
export function messagePreview(body: string, max = 80): string {
  const oneLine = body.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

// ── presence (DB-heartbeat + short-poll realtime layer, 2026-07-13) ─────────
// Honest semantics: a green dot means "active in Messages within the last
// minute", typing means a keystroke signal within the last few seconds for
// THIS thread. Never fabricated.

export const PRESENCE_ONLINE_MS = 60_000
export const TYPING_ACTIVE_MS = 6_000

export interface PresenceRow {
  lastSeenAt: Date | string
  typingThreadKey: string | null
  typingAt: Date | string | null
}

export function isOnline(row: Pick<PresenceRow, 'lastSeenAt'> | null, now = Date.now()): boolean {
  if (!row) return false
  return now - new Date(row.lastSeenAt).getTime() <= PRESENCE_ONLINE_MS
}

export function isTypingIn(row: PresenceRow | null, threadKey: string, now = Date.now()): boolean {
  if (!row || !row.typingAt || row.typingThreadKey !== threadKey) return false
  return now - new Date(row.typingAt).getTime() <= TYPING_ACTIVE_MS
}

// ── chat attachments ─────────────────────────────────────────────────────────

export interface ChatAttachment {
  key: string
  name: string
  mimeType: string
  size: number
}

/** Parse an attachment payload from an untrusted Json column (null on junk). */
export function chatAttachmentFromPayload(v: unknown): ChatAttachment | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (
    typeof o.key !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.mimeType !== 'string' ||
    typeof o.size !== 'number'
  )
    return null
  return { key: o.key, name: o.name, mimeType: o.mimeType, size: o.size }
}

/**
 * Unread count from a read cursor: messages strictly newer than the cursor and
 * not authored by the viewer (side-based for legacy rows without authorUserId).
 */
export function countUnread(
  messages: { createdAt: Date | string; authorUserId: string | null; authorRole: string }[],
  viewer: { userId: string; side: MessagingSide },
  lastReadAt: Date | string | null,
): number {
  const cutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0
  return messages.filter((m) => {
    const mine = m.authorUserId ? m.authorUserId === viewer.userId : m.authorRole === viewer.side
    return !mine && new Date(m.createdAt).getTime() > cutoff
  }).length
}

/**
 * Orphaned chat-attachment sweep (pure decision core). Composer uploads land
 * in R2 BEFORE the message is sent — abandoned drafts leave objects behind
 * forever. An object is an orphan when ALL hold:
 *   1. its key contains a `/chat/` segment (the `rooms/` prefix also holds
 *      label proofs etc. — those are NEVER candidates),
 *   2. it is older than the cutoff (never race an in-flight composer), and
 *   3. no message references the key.
 * Objects with an unknown lastModified are SKIPPED (can't prove age — honest).
 */
export function findOrphanedChatKeys(input: {
  objects: { key: string; lastModified: Date | string | null }[]
  referencedKeys: Iterable<string>
  cutoff: Date | string
}): string[] {
  const referenced =
    input.referencedKeys instanceof Set ? (input.referencedKeys as Set<string>) : new Set(input.referencedKeys)
  const cutoffMs = new Date(input.cutoff).getTime()
  return input.objects
    .filter((o) => {
      if (!o.key.includes('/chat/')) return false
      if (o.lastModified == null) return false
      if (new Date(o.lastModified).getTime() >= cutoffMs) return false
      return !referenced.has(o.key)
    })
    .map((o) => o.key)
}
