'use server'

// Theme Studio Phase D — platform logo upload/delete. platform:admin gated +
// audited. Files go to R2 via @ilaunchify/storage; one row per (kind, variant)
// slot in PlatformBrandAsset. If R2_PUBLIC_BASE_URL is set we store a stable
// public URL (renders everywhere without signing); else we sign on read.

import { uploadFile, deleteFile } from '@ilaunchify/storage'
import {
  upsertPlatformLogo,
  deletePlatformLogoRow,
  isLogoKind,
  isLogoVariant,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const OK_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB — logos should be small

export async function uploadPlatformLogo(formData: FormData): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const kind = String(formData.get('kind') ?? '')
  const variant = String(formData.get('variant') ?? '')
  const file = formData.get('file')

  if (!isLogoKind(kind)) return { ok: false, error: 'Invalid logo kind.' }
  if (!isLogoVariant(variant)) return { ok: false, error: 'Invalid logo variant.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No image provided.' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'Image too large (max 4 MB).' }
  const contentType = file.type || 'image/png'
  if (!OK_MIMES.includes(contentType)) return { ok: false, error: 'Upload a PNG, JPG, WEBP, or SVG.' }

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `platform/logos/${kind}-${variant}-${Date.now()}-${safe}`
  const buffer = Buffer.from(await file.arrayBuffer())

  let upload
  try {
    upload = await uploadFile({
      key,
      body: buffer,
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })
  } catch (err) {
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }

  const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '')
  const publicUrl = publicBase ? `${publicBase}/${upload.key}` : null

  let prevKey: string | null = null
  try {
    prevKey = await upsertPlatformLogo({
      kind,
      variant,
      storageKey: upload.key,
      publicUrl,
      mimeType: contentType,
      sizeBytes: upload.sizeBytes,
      uploadedBy: admin.id,
    })
  } catch (err) {
    return { ok: false, error: `Saved the file but could not record it: ${(err as Error).message}` }
  }

  // Best-effort cleanup of the replaced object.
  if (prevKey && prevKey !== upload.key) await deleteFile(prevKey).catch(() => {})

  await logAuditAs(admin, {
    entityType: 'ThemeTokenOverride',
    entityId: `${kind}:${variant}`,
    action: 'PLATFORM_LOGO_UPLOADED',
    payload: { kind, variant, storageKey: upload.key, sizeBytes: upload.sizeBytes },
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function deletePlatformLogo(kind: string, variant: string): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  if (!isLogoKind(kind)) return { ok: false, error: 'Invalid logo kind.' }
  if (!isLogoVariant(variant)) return { ok: false, error: 'Invalid logo variant.' }

  let removedKey: string | null = null
  try {
    removedKey = await deletePlatformLogoRow(kind, variant)
  } catch (err) {
    return { ok: false, error: `Could not remove: ${(err as Error).message}` }
  }
  if (removedKey) await deleteFile(removedKey).catch(() => {})

  await logAuditAs(admin, {
    entityType: 'ThemeTokenOverride',
    entityId: `${kind}:${variant}`,
    action: 'PLATFORM_LOGO_DELETED',
    payload: { kind, variant },
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}
