'use server'

// Notification Center — In-app channel controls (Pavel 2026-07-06).
// The in-app channel's global knobs live HERE, not on the email Branding page:
// sound ping (toggle / custom mp3 / reset) + auto-archive window. Per-event
// coalescing windows stay on each Templates editor (delivery knob per event).
// Storage: the NotificationBranding singleton row (historical name — it's the
// Center's one control-plane row).

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const SOUND_MAX_BYTES = 1 * 1024 * 1024 // 1 MB — a ping should be tiny
const SOUND_MIMES = new Set(['audio/mpeg', 'audio/mp3'])

export async function uploadNotificationSound(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = await requireRole('ADMIN')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Pick an mp3 file.' }
  if (file.size > SOUND_MAX_BYTES) return { ok: false, error: 'File too large (max 1 MB).' }
  if (!SOUND_MIMES.has(file.type)) return { ok: false, error: 'Upload an MP3 (audio/mpeg).' }

  const { uploadFile } = await import('@ilaunchify/storage')
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `platform/notification-sound/${Date.now()}-${safe}`
  let upload
  try {
    upload = await uploadFile({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: 'audio/mpeg',
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '')
  if (!publicBase) {
    return { ok: false, error: 'R2_PUBLIC_BASE_URL is not configured — the sound needs a public URL.' }
  }
  const url = `${publicBase}/${upload.key}`

  const row = await prisma.notificationBranding.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', soundUrl: url },
    update: { updatedById: admin.id, soundUrl: url },
  })
  await logAuditAs(admin, {
    entityType: 'NotificationBranding',
    entityId: row.id,
    action: 'NOTIFICATION_SOUND_UPLOADED',
    payload: { key: upload.key, sizeBytes: upload.sizeBytes },
  })
  revalidatePath('/notifications-center/in-app')
  return { ok: true, url }
}

/** Toggle the ping on/off, or reset to the bundled default sound. */
export async function setNotificationSound(input: {
  enabled: boolean
  resetToDefault?: boolean
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const patch = {
    soundEnabled: input.enabled,
    ...(input.resetToDefault ? { soundUrl: null } : {}),
  }
  const row = await prisma.notificationBranding.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', ...patch },
    update: { updatedById: admin.id, ...patch },
  })
  await logAuditAs(admin, {
    entityType: 'NotificationBranding',
    entityId: row.id,
    action: 'NOTIFICATION_SOUND_UPDATED',
    payload: { enabled: input.enabled, resetToDefault: input.resetToDefault ?? false },
  })
  revalidatePath('/notifications-center/in-app')
  return { ok: true }
}

/** Global in-app behavior — currently the auto-archive window (cron-consumed). */
export async function saveInAppSettings(input: { autoArchiveDays: number }): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const days = input.autoArchiveDays
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, error: 'Auto-archive must be a whole number of days between 1 and 365' }
  }
  // Cast-guard (docs/POST_PUSH_CASTGUARD_CLEANUP.md): inAppAutoArchiveDays lands
  // with the next db:push + db:generate — inline directly after regen.
  const patch = { inAppAutoArchiveDays: days } as unknown as Record<string, never>
  const row = await prisma.notificationBranding.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', ...patch },
    update: { updatedById: admin.id, ...patch },
  })
  await logAuditAs(admin, {
    entityType: 'NotificationBranding',
    entityId: row.id,
    action: 'IN_APP_SETTINGS_UPDATED',
    payload: { autoArchiveDays: days },
  })
  revalidatePath('/notifications-center/in-app')
  return { ok: true }
}