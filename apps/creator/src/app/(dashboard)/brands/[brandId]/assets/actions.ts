'use server'

// Brand Assets server actions.
// Per docs/DESIGN_STUDIO_REBUILD.md §4 — the corrected scope.
//
// Three asset categories, one server action group:
//   - Logos     (uploadLogoVariant / removeLogoVariant)
//   - Colors    (setBrandColors — primary/secondary/accent + brandSwatches[])
//   - Fonts     (setBrandFonts — array of FONT_CATALOG family keys, Brand Kit V2)
//   - Tagline   (setBrandTagline — single string)
//
// Ownership check via creatorProfile.userId === user.id (wrapped here so V1.5+
// can swap in CreatorMembership without touching call-sites — per
// ilaunchify-creator-team-model-v1.5 memory).

import {
  prisma,
  createBrandFont,
  deleteBrandFont,
  getBrandFontsByIds,
} from '@ilaunchify/db'
import { requireUser, getCreatorTier, canUploadCustomFonts } from '@ilaunchify/auth'
import { isKnownFontFamily, isCustomFontRef, customFontId, CUSTOM_FONT_PREFIX } from '@ilaunchify/ui'
import { revalidatePath } from 'next/cache'
import { uploadFile, brandAssetKey } from '@ilaunchify/storage'

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/
const MAX_SWATCHES = 2 // beyond the named primary/secondary/accent
const MAX_FONTS = 3
const LOGO_MAX_BYTES = 5 * 1024 * 1024
const LOGO_ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
])

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export type LogoVariant = 'PRIMARY' | 'ICON' | 'HORIZONTAL'

// ---- Ownership helper (V1.5+ wraps this; see memory note) -------------------

async function authorizeBrandAccess(brandId: string) {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) {
    return { user: null, error: 'Brand not found or you do not have access.' as const }
  }
  return { user, error: null as null }
}

// ---- Logos -----------------------------------------------------------------

const VARIANT_TO_KIND: Record<LogoVariant, 'logo' | 'logo_icon' | 'logo_horizontal'> = {
  PRIMARY: 'logo',
  ICON: 'logo_icon',
  HORIZONTAL: 'logo_horizontal',
}

const VARIANT_TO_BRAND_FIELD: Record<LogoVariant, 'logoAssetId' | 'logoIconAssetId' | 'logoHorizontalAssetId'> = {
  PRIMARY: 'logoAssetId',
  ICON: 'logoIconAssetId',
  HORIZONTAL: 'logoHorizontalAssetId',
}

export async function uploadLogoVariant(formData: FormData): Promise<Result<{ assetId: string }>> {
  const brandId = String(formData.get('brandId') ?? '')
  const variantRaw = String(formData.get('variant') ?? '')
  const variant = variantRaw as LogoVariant
  if (!['PRIMARY', 'ICON', 'HORIZONTAL'].includes(variant)) {
    return { ok: false, error: `Unknown logo variant "${variantRaw}".` }
  }

  const { user, error } = await authorizeBrandAccess(brandId)
  if (error) return { ok: false, error }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'No file uploaded.' }
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: 'Logo too large (max 5 MB).' }
  }
  if (!LOGO_ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      error: `File type "${file.type}" not supported. Use PNG, JPEG, WebP, or SVG.`,
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = brandAssetKey({ brandId, kind: VARIANT_TO_KIND[variant], filename: file.name })
  const upload = await uploadFile({ key, body: buffer, contentType: file.type })

  const asset = await prisma.asset.create({
    data: {
      ownerType: 'BRAND',
      ownerId: brandId,
      type: 'LOGO',
      source: 'USER_UPLOAD',
      storageKey: upload.key,
      mimeType: file.type,
      sizeBytes: upload.sizeBytes,
      uploadedByUserId: user.id,
    },
  })

  await prisma.brand.update({
    where: { id: brandId },
    data: { [VARIANT_TO_BRAND_FIELD[variant]]: asset.id },
  })

  revalidatePath(`/brands/${brandId}/assets`)
  return { ok: true, assetId: asset.id }
}

export async function removeLogoVariant(input: {
  brandId: string
  variant: LogoVariant
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }

  await prisma.brand.update({
    where: { id: input.brandId },
    data: { [VARIANT_TO_BRAND_FIELD[input.variant]]: null },
  })

  // Note: we intentionally don't delete the Asset row — it stays in R2 + DB
  // as orphaned for a cleanup pass later (lazy GC). Avoids accidental loss.

  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

// ---- Colors ----------------------------------------------------------------

export async function setBrandColors(input: {
  brandId: string
  colorPrimary: string | null
  colorSecondary: string | null
  colorAccent: string | null
  brandSwatches: string[]
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }

  // Validate hex format on every supplied color
  const all = [
    input.colorPrimary,
    input.colorSecondary,
    input.colorAccent,
    ...input.brandSwatches,
  ].filter((v): v is string => v !== null && v !== '')
  for (const value of all) {
    if (!HEX_REGEX.test(value)) {
      return { ok: false, error: `"${value}" is not a 6-digit hex color.` }
    }
  }

  // Cap extra swatches at MAX_SWATCHES (UI also clamps).
  const swatches = input.brandSwatches.filter((v) => v && v !== '').slice(0, MAX_SWATCHES)

  await prisma.brand.update({
    where: { id: input.brandId },
    data: {
      colorPrimary: input.colorPrimary || null,
      colorSecondary: input.colorSecondary || null,
      colorAccent: input.colorAccent || null,
      brandSwatches: swatches,
    },
  })

  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

// ---- Fonts -----------------------------------------------------------------

export async function setBrandFonts(input: {
  brandId: string
  brandFontIds: string[]
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }

  // Brand fonts are FONT_CATALOG family keys, or `custom:<id>` refs to an uploaded
  // BrandFont (Slice 1 + 2). Keep only known values — self-heals legacy TypographyFont
  // ids by dropping them. For custom refs, verify the BrandFont belongs to THIS brand
  // so a creator can't inject another brand's font id. (Pavel 2026-06-22)
  const candidate = input.brandFontIds.filter(isKnownFontFamily).slice(0, MAX_FONTS)
  const customIds = candidate
    .filter(isCustomFontRef)
    .map((v) => customFontId(v))
    .filter((v): v is string => v !== null)
  const ownedRefs = new Set(
    customIds.length
      ? (await getBrandFontsByIds(input.brandId, customIds)).map((f) => `${CUSTOM_FONT_PREFIX}${f.id}`)
      : [],
  )
  const fontIds = candidate.filter((v) => !isCustomFontRef(v) || ownedRefs.has(v))

  await prisma.brand.update({
    where: { id: input.brandId },
    data: { brandFontIds: fontIds },
  })

  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

// ---- Tagline ---------------------------------------------------------------

export async function setBrandTagline(input: {
  brandId: string
  tagline: string
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }

  const trimmed = input.tagline.trim().slice(0, 120)
  await prisma.brand.update({
    where: { id: input.brandId },
    data: { tagline: trimmed || null },
  })

  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

// ---- Custom fonts (Brand Kit V2 Slice 2) -----------------------------------

const FONT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
// Web-renderable font files. WOFF2 preferred; TTF/OTF accepted (browsers render them).
const FONT_ALLOWED_EXT = ['.woff2', '.woff', '.ttf', '.otf'] as const

/**
 * Upload a creator custom font to a brand kit. Tier-gated to Builder+. Requires a
 * license attestation. Creates an Asset + BrandFont; the font becomes selectable in
 * the kit's font list (it is NOT auto-added to the active brandFontIds selection —
 * the creator picks it like any catalog font). Returns the new font id + family.
 */
export async function uploadBrandFont(
  formData: FormData,
): Promise<Result<{ fontId: string; family: string }>> {
  const { user, error } = await authorizeBrandAccess(
    String(formData.get('brandId') ?? ''),
  )
  if (error || !user) return { ok: false, error: error ?? 'Brand not found.' }
  const brandId = String(formData.get('brandId') ?? '')

  // Tier gate — custom font upload is a Builder+ advanced feature.
  const tier = await getCreatorTier(user.id)
  if (!canUploadCustomFonts(tier)) {
    return {
      ok: false,
      error: 'Custom font upload is available on Builder and Agency plans. Upgrade to add your own fonts.',
    }
  }

  const family = String(formData.get('family') ?? '').trim()
  if (family.length < 2 || family.length > 80) {
    return { ok: false, error: 'Font name must be 2–80 characters.' }
  }
  if (formData.get('licenseAttested') !== 'true') {
    return {
      ok: false,
      error: 'Please confirm you have the right to use and embed this font for print.',
    }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a font file (WOFF2, WOFF, TTF, or OTF).' }
  }
  if (file.size > FONT_MAX_BYTES) {
    return { ok: false, error: 'Font file is too large (max 5 MB).' }
  }
  const lower = file.name.toLowerCase()
  if (!FONT_ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
    return { ok: false, error: 'Unsupported file type. Use WOFF2, WOFF, TTF, or OTF.' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = brandAssetKey({ brandId, kind: 'font', filename: file.name })
  const upload = await uploadFile({
    key,
    body: buffer,
    contentType: file.type || 'font/woff2',
  })
  const asset = await prisma.asset.create({
    data: {
      ownerType: 'BRAND',
      ownerId: brandId,
      type: 'FONT',
      source: 'USER_UPLOAD',
      storageKey: upload.key,
      mimeType: file.type || 'font/woff2',
      sizeBytes: upload.sizeBytes,
      uploadedByUserId: user.id,
    },
    select: { id: true },
  })

  const fontId = await createBrandFont({
    brandId,
    family,
    webAssetId: asset.id,
    licenseAttested: true,
  })
  if (!fontId) {
    return { ok: false, error: 'Could not save the font. Please try again.' }
  }

  revalidatePath(`/brands/${brandId}/assets`)
  return { ok: true, fontId, family }
}

/** Delete a custom brand font + drop it from the active selection. */
export async function removeBrandFont(input: {
  brandId: string
  fontId: string
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }

  const removed = await deleteBrandFont(input.brandId, input.fontId)
  if (!removed) return { ok: false, error: 'Font not found.' }

  // Drop the custom ref from the brand's selected fonts if present.
  const ref = `${CUSTOM_FONT_PREFIX}${input.fontId}`
  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    select: { brandFontIds: true },
  })
  if (brand && brand.brandFontIds.includes(ref)) {
    await prisma.brand.update({
      where: { id: input.brandId },
      data: { brandFontIds: brand.brandFontIds.filter((v) => v !== ref) },
    })
  }

  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}
