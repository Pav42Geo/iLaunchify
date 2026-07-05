'use server'

// Category-keyed notification preferences (docs/EMAIL_NOTIFICATION_CENTER.md
// — group-level opt-out). Replaced the legacy per-event toggles 2026-07-05;
// the dispatcher only consults category rows now.

import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { setCategoryPreferenceChecked, setQuietHours } from '@ilaunchify/notifications'
import type { NotificationChannel } from '@ilaunchify/db'
import { revalidatePath } from 'next/cache'

export async function toggleCategoryPreference(input: {
  category: string
  channel: NotificationChannel
  enabled: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  const r = await setCategoryPreferenceChecked({ userId: user.id, ...input })
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.reason === 'not-opt-outable'
          ? 'These notifications are required and can’t be turned off.'
          : 'Unknown notification group.',
    }
  }
  await logAuditAs(user, {
    entityType: 'NotificationPreference',
    entityId: `${user.id}:${input.category}:${input.channel}`,
    action: input.enabled ? 'PREFERENCE_ENABLED' : 'PREFERENCE_DISABLED',
    payload: input,
  })
  revalidatePath('/settings/notifications')
  return { ok: true }
}

export async function saveQuietHours(input: {
  startUtc: number | null
  endUtc: number | null
}) {
  const user = await requireUser()
  await setQuietHours({ userId: user.id, ...input })
  revalidatePath('/settings/notifications')
}
