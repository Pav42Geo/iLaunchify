// Read + mark-read + archive helpers for the notification center UI.

import { prisma } from '@ilaunchify/db'
import type { Notification, NotificationEvent } from '@ilaunchify/db'

// De-cast 2026-07-06 (was cast-guarded pre-push) — archivedAt is in the client.
const NOT_ARCHIVED = { archivedAt: null } as const
const SET_ARCHIVED = () => ({ archivedAt: new Date() })

/**
 * In-app notifications for a user, newest first. Defaults to a 50-row cap
 * because the UI shows them in a dropdown / list — pagination later.
 */
export async function listNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: {
      userId,
      channel: 'IN_APP',
      ...NOT_ARCHIVED,
      ...(options.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 50,
  })
}

/**
 * Cursor-paginated feed for the /notifications pages (in-app P0,
 * docs/IN_APP_NOTIFICATIONS_AUDIT.md §5.3 — replaces the 200-row cliff).
 * Cursor = the last row's id; stable because ordering is (createdAt, id) desc.
 */
export async function listNotificationsPage(
  userId: string,
  options: {
    limit?: number
    unreadOnly?: boolean
    /** Restrict to these events (e.g. eventsInCategory(slug)). */
    events?: NotificationEvent[]
    /** Id of the last row of the previous page. */
    cursor?: string
  } = {},
): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
  const limit = options.limit ?? 50
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      channel: 'IN_APP',
      ...NOT_ARCHIVED,
      ...(options.unreadOnly ? { readAt: null } : {}),
      ...(options.events ? { event: { in: options.events } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra row = "has next page"
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return {
    notifications: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  }
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, channel: 'IN_APP', readAt: null, ...NOT_ARCHIVED },
  })
}

/** Flip a row back to unread (feed overflow menu). */
export async function markUnread(params: {
  userId: string
  notificationId: string
}): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: params.notificationId, userId: params.userId, channel: 'IN_APP' },
    data: { readAt: null },
  })
}

/** Archive one row (hidden from bell + feed, never deleted). In-app P1. */
export async function archiveNotification(params: {
  userId: string
  notificationId: string
}): Promise<void> {
  await prisma.notification.updateMany({
    // updateMany so the userId filter is a security fence, not a throw.
    where: { id: params.notificationId, userId: params.userId },
    data: { readAt: new Date(), ...SET_ARCHIVED() },
  })
}

/**
 * Auto-archive READ in-app rows older than `olderThanDays` (Pavel 2026-07-06:
 * 30 days). Cron-driven — see apps/admin /api/cron/archive-notifications.
 */
export async function autoArchiveRead(olderThanDays = 30): Promise<{ count: number }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  const res = await prisma.notification.updateMany({
    where: {
      channel: 'IN_APP',
      readAt: { lt: cutoff },
      ...NOT_ARCHIVED,
    },
    data: SET_ARCHIVED(),
  })
  return { count: res.count }
}

export async function markRead(params: {
  userId: string
  notificationId: string
}): Promise<void> {
  // Use updateMany so we both filter on userId (security) and skip if row
  // doesn't belong to this user without throwing.
  await prisma.notification.updateMany({
    where: { id: params.notificationId, userId: params.userId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function markAllRead(userId: string): Promise<{ count: number }> {
  const res = await prisma.notification.updateMany({
    where: { userId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  })
  return { count: res.count }
}
