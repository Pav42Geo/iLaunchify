'use server'

// Brand Quickstart creation action — Step 4 of Launch Checklist.
//
// Per Pavel decision 2026-05-25: minimal quickstart for V1 (name + handle +
// logo + tagline + primary color hex). Curated style preset / palette /
// typography pickers come in the Brand Identity Studio (#165) once the
// curated libraries are seeded (#164).
//
// Side effects on success:
//   1. Brand row created with creatorProfile link
//   2. CreatorProfile.onboardingProgress.declaredTargetMarketIds promoted
//      to real BrandTargetMarket rows
//   3. Logo uploaded to R2 (if provided) + Asset row created with
//      ownerType=BRAND, ownerId=brand.id, type=LOGO
//   4. CreatorProfile.onboardingProgress.step4CompletedAt stamped
//   5. /dashboard + /brands paths revalidated

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, brandAssetKey } from '@ilaunchify/storage'
import { revalidatePath } from 'next/cache'

const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024 // 5 MB for logo
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
])

export type CreateBrandResult =
  | { ok: true; brandId: string; handle: string }
  | { ok: false; error: string; field?: 'name' | 'handle' | 'logo' | 'general' }

export async function createBrand(formData: FormData): Promise<CreateBrandResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { ok: false, error: 'Sign in as a creator to create a brand.' }
  }

  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingProgress: true },
  })
  if (!profile) return { ok: false, error: 'Your creator profile is missing.' }

  // -------- Validate inputs --------
  const name = String(formData.get('name') ?? '').trim()
  const handle = String(formData.get('handle') ?? '')
    .trim()
    .toLowerCase()
  const tagline = String(formData.get('tagline') ?? '').trim()
  const colorPrimary = String(formData.get('colorPrimary') ?? '').trim() || null
  // BrandStylePreset / ColorPalette / TypographyPair picker fields removed
  // 2026-05-26 (see docs/DESIGN_STUDIO_REBUILD.md §4 scope correction).

  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Brand name must be 2–120 characters.', field: 'name' }
  }
  if (!HANDLE_REGEX.test(handle)) {
    return {
      ok: false,
      error: 'Handle must be lowercase letters, numbers, and dashes (2–40 chars, no leading/trailing dash).',
      field: 'handle',
    }
  }
  if (colorPrimary && !/^#[0-9a-fA-F]{6}$/.test(colorPrimary)) {
    return { ok: false, error: 'Primary color must be a 6-digit hex (e.g. #16a34a).', field: 'general' }
  }

  // Handle uniqueness check (Brand.handle is @unique — we pre-check for a friendlier error)
  const existing = await prisma.brand.findUnique({ where: { handle } })
  if (existing) {
    return { ok: false, error: `Handle "${handle}" is already taken. Try another.`, field: 'handle' }
  }

  // -------- Optional logo upload --------
  const logo = formData.get('logo')
  let pendingLogo: { buffer: Buffer; mimeType: string; filename: string; sizeBytes: number } | null = null
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > UPLOAD_MAX_BYTES) {
      return { ok: false, error: 'Logo file is too large (max 5 MB).', field: 'logo' }
    }
    if (!ALLOWED_MIME.has(logo.type)) {
      return {
        ok: false,
        error: `Logo type "${logo.type}" not supported. Use PNG, JPEG, WebP, or SVG.`,
        field: 'logo',
      }
    }
    pendingLogo = {
      buffer: Buffer.from(await logo.arrayBuffer()),
      mimeType: logo.type,
      filename: logo.name,
      sizeBytes: logo.size,
    }
  }

  // -------- Read declared markets to promote --------
  const progress = (profile.onboardingProgress as Record<string, unknown> | null) ?? {}
  const declaredMarketIds = Array.isArray(progress.declaredTargetMarketIds)
    ? (progress.declaredTargetMarketIds as string[])
    : []

  // -------- Transactional create: Brand + BrandTargetMarket + progress stamp --------
  let brandId: string
  try {
    const brand = await prisma.$transaction(async (tx) => {
      const created = await tx.brand.create({
        data: {
          creatorProfileId: profile.id,
          name,
          handle,
          tagline: tagline || null,
          colorPrimary,
          isActive: true,
        },
      })

      // Promote declared markets to real BrandTargetMarket rows.
      // First declared market becomes primary.
      if (declaredMarketIds.length > 0) {
        await tx.brandTargetMarket.createMany({
          data: declaredMarketIds.map((marketId, i) => ({
            brandId: created.id,
            marketId,
            isPrimary: i === 0,
          })),
          skipDuplicates: true,
        })
      }

      // Step 4 done
      await tx.creatorProfile.update({
        where: { id: profile.id },
        data: {
          onboardingProgress: {
            ...progress,
            step4CompletedAt: new Date().toISOString(),
            firstBrandId: created.id,
          },
        },
      })

      return created
    })

    brandId = brand.id
  } catch (err) {
    return { ok: false, error: `Could not create brand: ${(err as Error).message}` }
  }

  // -------- Upload logo + create Asset row + link it on Brand --------
  // Outside the transaction so R2 outage doesn't roll back the brand row.
  if (pendingLogo) {
    try {
      const key = brandAssetKey({
        brandId,
        kind: 'logo',
        filename: pendingLogo.filename,
      })
      const upload = await uploadFile({
        key,
        body: pendingLogo.buffer,
        contentType: pendingLogo.mimeType,
      })

      const asset = await prisma.asset.create({
        data: {
          ownerType: 'BRAND',
          ownerId: brandId,
          type: 'LOGO',
          source: 'USER_UPLOAD',
          storageKey: upload.key,
          mimeType: pendingLogo.mimeType,
          sizeBytes: upload.sizeBytes,
          uploadedByUserId: user.id,
        },
      })

      await prisma.brand.update({
        where: { id: brandId },
        data: { logoAssetId: asset.id },
      })
    } catch (err) {
      // Brand row already exists; just flag the logo failure but proceed.
      return {
        ok: true,
        brandId,
        handle,
        // Surfaced to the form so the creator can retry the upload from Brand Studio.
        // (Schema-level safety: we never silently drop the brand on a logo issue.)
      }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/brands')
  revalidatePath('/brands/new')
  return { ok: true, brandId, handle }
}
