// Read + mark-read helpers for the notification center UI.

import { prisma } from '@ilaunchify/db'
import type { Notification } from '@prisma/client'

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
