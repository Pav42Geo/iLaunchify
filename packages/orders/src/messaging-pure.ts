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
