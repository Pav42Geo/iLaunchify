'use server'

// Brand kit server actions.
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
  setBrandTextStyleSpec,
  createBrandPalette,
  renameBrandPalette,
  deleteBrandPalette,
  countBrandPalettes,
  addBrandSwatch,
  updateBrandSwatch,
  removeBrandSwatch,
  type BrandTextRole,
  type BrandSwatchInput,
} from '@ilaunchify/db'
import {
  requireUser,
  getCreatorTier,
  canUploadCustomFonts,
  canUseColorHarmony,
  brandLimits,
} from '@ilaunchify/auth'
import {
  isKnownFontFamily,
  isCustomFontRef,
  customFontId,
  CUSTOM_FONT_PREFIX,
  normalizeHex,
  hexToCmyk,
  nearestColorName,
  type HarmonyMethod,
} from '@ilaunchify/ui'
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

// ---- Text styles (Brand Kit V2 Slice 4) ------------------------------------

const TEXT_ROLES: BrandTextRole[] = ['HEADING', 'SUBHEADING', 'BODY']
const TEXT_CASES = ['none', 'uppercase', 'lowercase', 'capitalize']
const FONT_WEIGHTS = ['Regular', 'Medium', 'SemiBold', 'Bold']
const COLOR_TOKENS = ['primary', 'secondary', 'accent']

/** Save one role's full text style (font + size/weight/case/color). The font must be
 *  a catalog family or a custom ref already on this brand; colorRef is a palette token
 *  or a hex. Owner-guarded. */
export async function saveBrandTextStyle(input: {
  brandId: string
  role: BrandTextRole
  fontKey?: string | null
  fontSize?: number | null
  fontWeight?: string | null
  textCase?: string | null
  colorRef?: string | null
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  if (!TEXT_ROLES.includes(input.role)) return { ok: false, error: 'Unknown text style.' }

  // Validate the font ref if a non-empty one is provided. A null/empty fontKey means
  // "leave the font unchanged" (the styling fields can still be edited on their own).
  const fontKey = input.fontKey || undefined
  if (fontKey !== undefined) {
    if (isCustomFontRef(fontKey)) {
      const id = customFontId(fontKey)
      const owned = id ? await getBrandFontsByIds(input.brandId, [id]) : []
      if (owned.length === 0) return { ok: false, error: 'That custom font is not on this brand.' }
    } else if (!isKnownFontFamily(fontKey)) {
      return { ok: false, error: 'That font is not available.' }
    }
  }
  if (input.fontWeight != null && !FONT_WEIGHTS.includes(input.fontWeight)) {
    return { ok: false, error: 'Invalid font weight.' }
  }
  if (input.textCase != null && !TEXT_CASES.includes(input.textCase)) {
    return { ok: false, error: 'Invalid text case.' }
  }
  if (
    input.colorRef != null &&
    input.colorRef !== '' &&
    !COLOR_TOKENS.includes(input.colorRef) &&
    !HEX_REGEX.test(input.colorRef)
  ) {
    return { ok: false, error: 'Color must be a brand swatch or a #hex value.' }
  }
  const fontSize =
    input.fontSize == null ? input.fontSize : Math.min(400, Math.max(6, Math.round(input.fontSize)))

  const ok = await setBrandTextStyleSpec(input.brandId, input.role, {
    ...(fontKey !== undefined ? { fontKey } : {}),
    ...(input.fontSize !== undefined ? { fontSize } : {}),
    ...(input.fontWeight !== undefined ? { fontWeight: input.fontWeight } : {}),
    ...(input.textCase !== undefined ? { textCase: input.textCase } : {}),
    ...(input.colorRef !== undefined ? { colorRef: input.colorRef || null } : {}),
  })
  if (!ok) {
    return { ok: false, error: 'Text styles need a database update — run db push, then retry.' }
  }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

// ---- Color palettes (Brand Kit V2 Slice 5) ---------------------------------

const MAX_PALETTES = 12
const MAX_PANTONE_LEN = 40

function sanitizeSwatch(input: BrandSwatchInput): BrandSwatchInput | { error: string } {
  const out: BrandSwatchInput = {}
  if (input.kind !== undefined) {
    if (input.kind !== 'SOLID' && input.kind !== 'GRADIENT') return { error: 'Invalid swatch type.' }
    out.kind = input.kind
  }
  if (input.hex !== undefined) {
    if (input.hex !== null && !HEX_REGEX.test(input.hex)) return { error: 'Color must be a #hex value.' }
    out.hex = input.hex
  }
  if (input.name !== undefined) out.name = input.name ? input.name.slice(0, 40) : null
  for (const k of ['cmykC', 'cmykM', 'cmykY', 'cmykK'] as const) {
    if (input[k] !== undefined) {
      const v = input[k]
      out[k] = v == null ? null : Math.min(100, Math.max(0, Math.round(v)))
    }
  }
  if (input.pantone !== undefined) {
    out.pantone = input.pantone ? input.pantone.slice(0, MAX_PANTONE_LEN) : null
  }
  if (input.gradient !== undefined) {
    if (input.gradient === null) out.gradient = null
    else {
      const stops = (input.gradient.stops ?? []).filter((s) => HEX_REGEX.test(s.color))
      if (stops.length < 2) return { error: 'A gradient needs at least two valid color stops.' }
      out.gradient = {
        angle: Math.min(360, Math.max(0, Math.round(input.gradient.angle ?? 90))),
        stops: stops.map((s) => ({ color: s.color, pos: Math.min(100, Math.max(0, Math.round(s.pos))) })),
      }
    }
  }
  return out
}

export async function createPalette(input: { brandId: string; name: string }): Promise<Result<{ paletteId: string }>> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  const name = input.name.trim().slice(0, 40) || 'Palette'
  if ((await countBrandPalettes(input.brandId)) >= MAX_PALETTES) {
    return { ok: false, error: `Up to ${MAX_PALETTES} palettes per brand.` }
  }
  const id = await createBrandPalette(input.brandId, name)
  if (!id) return { ok: false, error: 'Palettes need a database update — run db push, then retry.' }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true, paletteId: id }
}

export async function renamePalette(input: {
  brandId: string
  paletteId: string
  name: string
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  const ok = await renameBrandPalette(input.brandId, input.paletteId, input.name.trim().slice(0, 40) || 'Palette')
  if (!ok) return { ok: false, error: 'Could not rename that palette.' }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

export async function deletePalette(input: { brandId: string; paletteId: string }): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  const ok = await deleteBrandPalette(input.brandId, input.paletteId)
  if (!ok) return { ok: false, error: 'Could not delete that palette.' }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

export async function addSwatch(input: {
  brandId: string
  paletteId: string
  swatch: BrandSwatchInput
}): Promise<Result<{ swatchId: string }>> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  const clean = sanitizeSwatch(input.swatch)
  if ('error' in clean) return { ok: false, error: clean.error }
  const id = await addBrandSwatch(input.brandId, input.paletteId, clean)
  if (!id) return { ok: false, error: 'Could not add that color.' }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true, swatchId: id }
}

export async function updateSwatch(input: {
  brandId: string
  swatchId: string
  swatch: BrandSwatchInput
}): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  const clean = sanitizeSwatch(input.swatch)
  if ('error' in clean) return { ok: false, error: clean.error }
  const ok = await updateBrandSwatch(input.brandId, input.swatchId, clean)
  if (!ok) return { ok: false, error: 'Could not update that color.' }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

export async function removeSwatch(input: { brandId: string; swatchId: string }): Promise<Result> {
  const { error } = await authorizeBrandAccess(input.brandId)
  if (error) return { ok: false, error }
  const ok = await removeBrandSwatch(input.brandId, input.swatchId)
  if (!ok) return { ok: false, error: 'Could not remove that color.' }
  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true }
}

/**
 * Save a generated/picked palette (Brand Palette Generator, Phase 1). The colors are
 * generated client-side; this persists the final list. Server-enforced gating: any
 * harmony method other than AUTO requires Builder+ (`canUseColorHarmony`); the palette
 * count cap is enforced per tier. Each color gets auto CMYK (reference) + nearest name.
 */
export interface SavedSwatch {
  id: string
  kind: 'SOLID' | 'GRADIENT'
  hex: string | null
  name: string | null
  cmykC: number | null
  cmykM: number | null
  cmykY: number | null
  cmykK: number | null
  pantone: string | null
  gradient: { angle: number; stops: { color: string; pos: number }[] } | null
}
export interface SavedPalette {
  id: string
  name: string
  swatches: SavedSwatch[]
}

export async function generateAndSaveBrandPalette(input: {
  brandId: string
  method: HarmonyMethod
  name: string
  colors: string[] // hex, 2–6
}): Promise<Result<{ palette: SavedPalette }>> {
  const { user, error } = await authorizeBrandAccess(input.brandId)
  if (error || !user) return { ok: false, error: error ?? 'Not authorized.' }

  const tier = await getCreatorTier(user.id)
  if (input.method !== 'AUTO' && !canUseColorHarmony(tier)) {
    return {
      ok: false,
      error: 'Color-harmony methods are a Builder feature. Upgrade, or use Auto.',
    }
  }

  const colors = input.colors
    .map((c) => normalizeHex(c))
    .filter((c): c is string => c !== null)
    .slice(0, 6)
  if (colors.length < 2) return { ok: false, error: 'A palette needs at least 2 colors.' }

  const cap = brandLimits(tier).palettesPerKit
  if (Number.isFinite(cap) && (await countBrandPalettes(input.brandId)) >= cap) {
    return { ok: false, error: `Your plan includes ${cap} palettes per kit. Upgrade for more.` }
  }

  const name = input.name.trim().slice(0, 40) || 'Generated palette'
  const paletteId = await createBrandPalette(input.brandId, name)
  if (!paletteId) {
    return { ok: false, error: 'Palettes need a database update — run db push, then retry.' }
  }

  const swatches: SavedSwatch[] = []
  for (const hex of colors) {
    const cmyk = hexToCmyk(hex)
    const swName = nearestColorName(hex)
    const id = await addBrandSwatch(input.brandId, paletteId, {
      kind: 'SOLID',
      hex,
      name: swName,
      cmykC: cmyk.c,
      cmykM: cmyk.m,
      cmykY: cmyk.y,
      cmykK: cmyk.k,
    })
    if (id) {
      swatches.push({
        id,
        kind: 'SOLID',
        hex,
        name: swName,
        cmykC: cmyk.c,
        cmykM: cmyk.m,
        cmykY: cmyk.y,
        cmykK: cmyk.k,
        pantone: null,
        gradient: null,
      })
    }
  }

  revalidatePath(`/brands/${input.brandId}/assets`)
  return { ok: true, palette: { id: paletteId, name, swatches } }
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
