'use server'

import { requireUser } from '@ilaunchify/auth'
import { markRead, markAllRead } from '@ilaunchify/notifications'

export async function markNotificationRead({
  notificationId,
}: { notificationId: string }) {
  const user = await requireUser()
  await markRead({ userId: user.id, notificationId })
}

export async function markAllNotificationsRead() {
  const user = await requireUser()
  return markAllRead(user.id)
}
