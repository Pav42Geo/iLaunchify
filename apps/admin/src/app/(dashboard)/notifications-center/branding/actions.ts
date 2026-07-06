'use server'

// Notification Center — Branding singleton actions (checklist D).
// One row (singletonKey "default") holds the global email chrome: header
// identity, accent/ink, footer text, unsubscribe/preferences copy + link,
// from-name, reply-to. Absent row = the LOCKED design-system defaults.

import { prisma, resolveLogoForPlacement, Prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  DEFAULT_NOTIFICATION_BRANDING,
  renderEmailShell,
} from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export interface BrandingInput {
  logoUrl: string | null
  brandName: string
  accentHex: string
  inkHex: string
  footerText: string | null
  unsubscribeText: string
  preferencesText: string
  preferenceCenterUrl: string | null
  fromName: string | null
  replyToEmail: string | null
  /** Audience-aware header nav links (Amazon-style, ≤4 each) — Stage 4. */
  headerLinks: Partial<Record<'creator' | 'partner' | 'admin', Array<{ label: string; url: string }>>> | null
}

function validateHeaderLinks(links: BrandingInput['headerLinks']): string | null {
  if (!links) return null
  for (const [audience, rows] of Object.entries(links)) {
    if (!rows) continue
    if (rows.length > 4) return `Max 4 header links per audience (${audience})`
    for (const l of rows) {
      if (!l.label.trim() || l.label.length > 30) return `Header link labels must be 1–30 chars (${audience})`
      if (!/^https?:\/\//.test(l.url)) return `Header link URLs must be absolute (${audience}: "${l.label}")`
    }
  }
  return null
}

const HEX = /^#[0-9a-fA-F]{6}$/

export async function saveBranding(input: BrandingInput): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.brandName.trim()) return { ok: false, error: 'Brand name is required' }
  if (!HEX.test(input.accentHex)) return { ok: false, error: 'Accent must be a #RRGGBB hex' }
  if (!HEX.test(input.inkHex)) return { ok: false, error: 'Ink must be a #RRGGBB hex' }
  if (input.logoUrl && !/^https:\/\//.test(input.logoUrl)) {
    return { ok: false, error: 'Logo URL must be https' }
  }
  if (input.preferenceCenterUrl && !/^https?:\/\//.test(input.preferenceCenterUrl)) {
    return { ok: false, error: 'Preference center URL must be absolute' }
  }
  if (input.replyToEmail && !input.replyToEmail.includes('@')) {
    return { ok: false, error: 'Reply-to must be an email address' }
  }
  const linkError = validateHeaderLinks(input.headerLinks)
  if (linkError) return { ok: false, error: linkError }

  // Drop empty rows/audiences; null when nothing remains.
  const cleanedLinks = input.headerLinks
    ? Object.fromEntries(
        Object.entries(input.headerLinks)
          .map(([a, rows]) => [a, (rows ?? []).filter((l) => l.label.trim() && l.url.trim())])
          .filter(([, rows]) => (rows as unknown[]).length > 0),
      )
    : null

  const data = {
    headerLinks:
      cleanedLinks && Object.keys(cleanedLinks).length > 0
        ? (cleanedLinks as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    logoUrl: input.logoUrl?.trim() || null,
    brandName: input.brandName.trim(),
    accentHex: input.accentHex,
    inkHex: input.inkHex,
    footerText: input.footerText?.trim() || null,
    unsubscribeText: input.unsubscribeText.trim() || 'Unsubscribe from these emails',
    preferencesText: input.preferencesText.trim() || 'Manage your email preferences',
    preferenceCenterUrl: input.preferenceCenterUrl?.trim() || null,
    fromName: input.fromName?.trim() || null,
    replyToEmail: input.replyToEmail?.trim() || null,
    updatedById: admin.id,
  }

  const row = await prisma.notificationBranding.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', ...data },
    update: data,
  })

  await logAuditAs(admin, {
    entityType: 'NotificationBranding',
    entityId: row.id,
    action: 'BRANDING_UPDATED',
    payload: { brandName: data.brandName, accentHex: data.accentHex },
  })
  revalidatePath('/notifications-center/branding')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// In-app notification sound (Pavel 2026-07-06) — the bell's ping. Admin can
// toggle it, upload a custom mp3 (R2, same rail as Theme Studio logos), or
// reset to the bundled default (/sounds/notification.mp3 in every app).
// soundEnabled/soundUrl writes are cast-guarded until db:push + db:generate.
// ---------------------------------------------------------------------------

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
    create: { singletonKey: 'default', ...({ soundUrl: url } as unknown as Record<string, never>) },
    update: { updatedById: admin.id, ...({ soundUrl: url } as unknown as Record<string, never>) },
  })
  await logAuditAs(admin, {
    entityType: 'NotificationBranding',
    entityId: row.id,
    action: 'NOTIFICATION_SOUND_UPLOADED',
    payload: { key: upload.key, sizeBytes: upload.sizeBytes },
  })
  revalidatePath('/notifications-center/branding')
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
  } as unknown as Record<string, never>
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
  revalidatePath('/notifications-center/branding')
  return { ok: true }
}

/** Render the shell preview for UNSAVED form state (same path as real sends). */
export async function previewBranding(input: BrandingInput): Promise<{ html: string }> {
  await requireRole('ADMIN')
  // Same logo precedence as the dispatcher: explicit URL → Theme Studio
  // 'emailHeader' placement → text header.
  const placementLogo = input.logoUrl
    ? null
    : await resolveLogoForPlacement('emailHeader', 'light')
        .then((r) => r.src)
        .catch(() => null)
  return {
    html: renderEmailShell({
      branding: {
        ...DEFAULT_NOTIFICATION_BRANDING,
        ...input,
        logoUrl: input.logoUrl ?? placementLogo,
      },
      subject: 'Acme Foods Co. accepted your manufacturer dispatch',
      bodySource:
        'Your order for **Daily Greens Powder** (#12345678) is one step closer to production.\n\nWe’ll keep you posted at every step.',
      cta: { label: 'View order', url: 'https://example.com/orders/1' },
      unsubscribeUrl: 'https://example.com/unsubscribe?token=preview',
      audience: 'creator', // header links preview from the creator set
    }),
  }
}
