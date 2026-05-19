'use server'

import { requireUser } from '@ilaunchify/auth'
import { setPreference, setQuietHours } from '@ilaunchify/notifications'
import type { NotificationChannel, NotificationEvent } from '@prisma/client'
import { revalidatePath } from 'next/cache'

export async function togglePreference(input: {
  event: NotificationEvent
  channel: NotificationChannel
  enabled: boolean
}) {
  const user = await requireUser()
  await setPreference({ userId: user.id, ...input })
  revalidatePath('/settings/notifications')
}

export async function saveQuietHours(input: {
  startUtc: number | null
  endUtc: number | null
}) {
  const user = await requireUser()
  await setQuietHours({ userId: user.id, ...input })
  revalidatePath('/settings/notifications')
}
