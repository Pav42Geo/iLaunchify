'use server'

// Per-flavor images (task #203). The partner uploads ONE photo per flavor in the
// New-Product builder's Flavors table; this action:
//   1. validates auth + ownership (the flavor belongs to a draft owned by the
//      partner's manufacturing service),
//   2. validates mime (PNG/JPEG/WebP) + size (<=10MB),
//   3. with `sharp` derives TWO sizes from the single upload:
//        • HERO  — fit within ~1200px (keep aspect, never upscale), re-encoded
//        • THUMB — 320x320 cover (square) for the PDP chip,
//   4. uploads both to R2 (public, publicUrl set) + creates two Asset rows,
//   5. links them on the FlavorPreset (swatchImageFileId = thumb, heroImageFileId
//      = hero), cast-guarded against a stale generated client,
//   6. writes an AuditLog row.
//
// SERVER-ONLY: sharp must never reach a client/edge bundle. This file is a
// dedicated `'use server'` module; only its exported actions cross the boundary.
//
// Stable-id note: the builder's saveFlavors does a delete-all + recreate, so a
// FlavorPreset's id is NOT stable across name edits. The client therefore passes
// the flavor NAME; we resolve (productTemplateId, name) -> FlavorPreset here. The
// creator must have a saved (named) flavor row first — the action returns a clear
// error otherwise (the debounced autosave usually beats the upload).

import sharp from 'sharp'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile, deleteFile, flavorAssetKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

/** Public bucket base URL (CDN domain). Mirrors mockup-render-actions. When unset
 *  the asset's publicUrl stays null and the PDP loader falls back to a signed URL. */
function r2PublicBaseUrl(): string | null {
  const base = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/+$/, '')
  return base || null
}

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const HERO_MAX_PX = 1200
const THUMB_PX = 320

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

export interface FlavorImageData {
  /** PDP-chip thumbnail URL (publicUrl of the THUMB asset). null = no image. */
  thumbnailUrl: string | null
  /** Large gallery hero URL (publicUrl of the HERO asset). null = no image. */
  heroUrl: string | null
}

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, partner: null as null, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  if (!partner) return { user, partner: null as null, error: 'Partner profile not found.' }
  return { user, partner, error: null as null }
}

/** Resolve the FlavorPreset by (productTemplateId, name) AND assert the template is
 *  owned by one of the partner's manufacturing services. Returns the preset id or
 *  an error. Cast-guarded — swatchImageFileId/heroImageFileId post-date the client. */
async function resolveOwnedFlavor(
  productTemplateId: string,
  flavorName: string,
  ownServiceIds: string[],
): Promise<{ flavorPresetId: string; thumbAssetId: string | null; heroAssetId: string | null } | { error: string }> {
  const tpl = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    select: { manufacturerServiceId: true },
  })
  if (!tpl) return { error: 'Draft not found.' }
  if (tpl.manufacturerServiceId && !ownServiceIds.includes(tpl.manufacturerServiceId)) {
    return { error: 'Not your product.' }
  }
  const fp = prisma as unknown as {
    flavorPreset: {
      findFirst: (a: unknown) => Promise<{ id: string; swatchImageFileId: string | null; heroImageFileId: string | null } | null>
    }
  }
  const preset = await fp.flavorPreset
    .findFirst({
      where: { productTemplateId, name: flavorName.trim() },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, swatchImageFileId: true, heroImageFileId: true },
    })
    .catch(() => null)
  if (!preset) return { error: 'Save the flavor name first, then add its image.' }
  return { flavorPresetId: preset.id, thumbAssetId: preset.swatchImageFileId, heroAssetId: preset.heroImageFileId }
}

/** Best-effort purge of an Asset row + its R2 object by id. Never throws. */
async function purgeAsset(assetId: string | null): Promise<void> {
  if (!assetId) return
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { storageKey: true } }).catch(() => null)
  if (asset?.storageKey) await deleteFile(asset.storageKey).catch(() => {})
  await prisma.asset.delete({ where: { id: assetId } }).catch(() => {})
}

/**
 * Upload ONE image for a flavor; derive + store a hero + a thumbnail.
 * FormData fields: productTemplateId, flavorName, file.
 */
export async function uploadFlavorImage(formData: FormData): Promise<Result<FlavorImageData>> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const productTemplateId = String(formData.get('productTemplateId') ?? '')
    const flavorName = String(formData.get('flavorName') ?? '').trim()
    const file = formData.get('file')

    if (!productTemplateId) return { ok: false, error: 'Save the draft first.' }
    if (!flavorName) return { ok: false, error: 'Name this flavor first.' }
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file selected.' }
    if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: 'Upload a PNG, JPEG, or WebP.' }
    if (file.size > MAX_BYTES) return { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` }

    const ownServiceIds = partner.services.map((s) => s.id)
    const resolved = await resolveOwnedFlavor(productTemplateId, flavorName, ownServiceIds)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    const { flavorPresetId, thumbAssetId: prevThumb, heroAssetId: prevHero } = resolved

    const input = Buffer.from(await file.arrayBuffer())

    // Derive both sizes. WebP for compact, high-quality output. Hero never
    // upscales (withoutEnlargement); thumb is a hard 320x320 cover crop.
    const heroBuf = await sharp(input)
      .rotate() // honor EXIF orientation
      .resize({ width: HERO_MAX_PX, height: HERO_MAX_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true })
    const thumbBuf = await sharp(input)
      .rotate()
      .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })

    const base = file.name.replace(/\.[^.]+$/, '') || 'flavor'
    const heroKey = flavorAssetKey({ productTemplateId, flavorPresetId, kind: 'hero', filename: `${base}.webp` })
    const thumbKey = flavorAssetKey({ productTemplateId, flavorPresetId, kind: 'thumb', filename: `${base}.webp` })

    await uploadFile({ key: heroKey, body: heroBuf.data, contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' })
    await uploadFile({ key: thumbKey, body: thumbBuf.data, contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' })

    const publicBase = r2PublicBaseUrl()
    const heroUrl = publicBase ? `${publicBase}/${heroKey}` : null
    const thumbUrl = publicBase ? `${publicBase}/${thumbKey}` : null

    const heroAsset = await prisma.asset.create({
      data: {
        ownerType: 'FLAVOR_PRESET', ownerId: flavorPresetId, type: 'HERO_IMAGE', source: 'USER_UPLOAD',
        storageKey: heroKey, publicUrl: heroUrl, mimeType: 'image/webp', sizeBytes: heroBuf.data.byteLength,
        widthPx: heroBuf.info.width, heightPx: heroBuf.info.height, isPublic: true, uploadedByUserId: user.id,
      },
      select: { id: true },
    })
    const thumbAsset = await prisma.asset.create({
      data: {
        ownerType: 'FLAVOR_PRESET', ownerId: flavorPresetId, type: 'PRODUCT_IMAGE', source: 'USER_UPLOAD',
        storageKey: thumbKey, publicUrl: thumbUrl, mimeType: 'image/webp', sizeBytes: thumbBuf.data.byteLength,
        widthPx: thumbBuf.info.width, heightPx: thumbBuf.info.height, isPublic: true, uploadedByUserId: user.id,
      },
      select: { id: true },
    })

    // Link onto the FlavorPreset (additive cols → cast guard).
    const fp = prisma as unknown as { flavorPreset: { update: (a: unknown) => Promise<unknown> } }
    await fp.flavorPreset.update({
      where: { id: flavorPresetId },
      data: { swatchImageFileId: thumbAsset.id, heroImageFileId: heroAsset.id },
    })

    // Replace: purge any previous hero/thumb assets so we don't orphan R2 objects.
    await purgeAsset(prevThumb)
    await purgeAsset(prevHero)

    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_TEMPLATE_UPDATE',
      payload: { flavorImage: 'upload', flavorPresetId, flavorName },
    }).catch(() => {})

    revalidatePath('/products/new')
    return { ok: true, data: { thumbnailUrl: thumbUrl, heroUrl } }
  } catch (err) {
    console.error('[uploadFlavorImage] failed:', err)
    return { ok: false, error: `Upload failed: ${(err as Error).message}` }
  }
}

/** Clear a flavor's images: null the two FlavorPreset fields + best-effort delete
 *  the Asset rows + R2 objects. Resolved by (productTemplateId, flavorName). */
export async function removeFlavorImage(productTemplateId: string, flavorName: string): Promise<Result> {
  try {
    const { user, partner, error } = await requirePartner()
    if (error) return { ok: false, error }
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    const ownServiceIds = partner.services.map((s) => s.id)
    const resolved = await resolveOwnedFlavor(productTemplateId, flavorName, ownServiceIds)
    if ('error' in resolved) return { ok: false, error: resolved.error }
    const { flavorPresetId, thumbAssetId, heroAssetId } = resolved

    const fp = prisma as unknown as { flavorPreset: { update: (a: unknown) => Promise<unknown> } }
    await fp.flavorPreset.update({
      where: { id: flavorPresetId },
      data: { swatchImageFileId: null, heroImageFileId: null },
    })
    await purgeAsset(thumbAssetId)
    await purgeAsset(heroAssetId)

    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_TEMPLATE_UPDATE',
      payload: { flavorImage: 'remove', flavorPresetId, flavorName },
    }).catch(() => {})

    revalidatePath('/products/new')
    return { ok: true }
  } catch (err) {
    console.error('[removeFlavorImage] failed:', err)
    return { ok: false, error: `Could not remove: ${(err as Error).message}` }
  }
}
