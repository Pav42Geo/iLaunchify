// Read + mark-read helpers for the notification center UI.

import { prisma } from '@ilaunchify/db'
import type { Notification, NotificationEvent } from '@ilaunchify/db'

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
    where: { userId, channel: 'IN_APP', readAt: null },
  })
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
