'use server'

// Company profile media — logo + cover upload/remove (Front Face, slice 2).
// Mirrors the platform-logo rail (apps/admin theme-studio/logos/actions.ts):
// R2 via @ilaunchify/storage with public-immutable cache headers; the STABLE
// public URL (R2_PUBLIC_BASE_URL) is stored on Partner.logoUrl/coverImageUrl.
// Public profile images require the public read base — without it we refuse
// (a signed URL would expire in creators' browsers). Audited; ownership-guarded.

import { uploadFile, deleteFile, partnerFileKey, isDevFsMode, devFsReadDataUrl } from '@ilaunchify/storage'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type MediaResult = { ok: true; url: string } | { ok: false; error: string }

const OK_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 6 * 1024 * 1024 // 6 MB

const FIELD: Record<'logo' | 'cover', 'logoUrl' | 'coverImageUrl'> = {
  logo: 'logoUrl',
  cover: 'coverImageUrl',
}

function publicBase(): string | null {
  return (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '') ?? null
}

// LOCAL DEV (no R2 creds): @ilaunchify/storage writes to .dev-storage/ and has
// no public bucket to serve from, so the profile image is inlined as a data:
// URL. Capped well under the 6 MB upload ceiling because this value lands in a
// DB column; production (R2 configured) always stores a short public URL.
const DEV_FS_INLINE_MAX_BYTES = 1_500_000

/** Best-effort delete of a previously stored public object by its URL. */
async function deleteByPublicUrl(url: string | null): Promise<void> {
  const base = publicBase()
  if (!url || !base || !url.startsWith(`${base}/`)) return
  await deleteFile(url.slice(base.length + 1)).catch(() => {})
}

export async function uploadPartnerProfileImage(
  kind: 'logo' | 'cover',
  formData: FormData,
): Promise<MediaResult> {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, logoUrl: true, coverImageUrl: true },
  })
  if (!partner) return { ok: false, error: 'No partner account.' }
  if (!FIELD[kind]) return { ok: false, error: 'Invalid image kind.' }

  const base = publicBase()
  const devFs = isDevFsMode()
  if (!base && !devFs)
    return { ok: false, error: 'Public image hosting is not configured (R2_PUBLIC_BASE_URL).' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No image provided.' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Image too large (max 6 MB).' }
  const contentType = file.type || 'image/png'
  if (!OK_MIMES.includes(contentType))
    return { ok: false, error: 'Upload a PNG, JPG, WEBP, or SVG.' }

  const key = partnerFileKey({
    partnerId: partner.id,
    section: 'public_profile',
    filename: `${kind}-${file.name}`,
  })
  let upload
  try {
    upload = await uploadFile({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  let url: string
  if (base) {
    url = `${base}/${upload.key}`
  } else {
    // dev-fs: inline the bytes so the image renders with no bucket configured.
    if (file.size > DEV_FS_INLINE_MAX_BYTES) {
      return {
        ok: false,
        error: 'Local dev without object storage: pick an image under 1.5 MB (or configure R2 for full-size uploads).',
      }
    }
    url = await devFsReadDataUrl(upload.key)
  }
  const prevUrl = kind === 'logo' ? partner.logoUrl : partner.coverImageUrl
  await prisma.partner.update({ where: { id: partner.id }, data: { [FIELD[kind]]: url } })
  await deleteByPublicUrl(prevUrl)

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: kind === 'logo' ? 'PROFILE_LOGO_UPLOADED' : 'PROFILE_COVER_UPLOADED',
    payload: { storageKey: upload.key, sizeBytes: upload.sizeBytes },
  })
  revalidatePath('/settings/company')
  return { ok: true, url }
}

export async function removePartnerProfileImage(kind: 'logo' | 'cover'): Promise<MediaResult> {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, logoUrl: true, coverImageUrl: true },
  })
  if (!partner) return { ok: false, error: 'No partner account.' }
  if (!FIELD[kind]) return { ok: false, error: 'Invalid image kind.' }

  const prevUrl = kind === 'logo' ? partner.logoUrl : partner.coverImageUrl
  await prisma.partner.update({ where: { id: partner.id }, data: { [FIELD[kind]]: null } })
  await deleteByPublicUrl(prevUrl)

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: kind === 'logo' ? 'PROFILE_LOGO_REMOVED' : 'PROFILE_COVER_REMOVED',
    payload: {},
  })
  revalidatePath('/settings/company')
  return { ok: true, url: '' }
}
