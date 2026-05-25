'use server'

// Brand Identity Studio server actions.
// Per docs/BRAND_IDENTITY_STUDIO.md + task #165.
//
// All actions ownership-checked: creator must own the brand via
// CreatorProfile.userId === auth user.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'
import type { BrandArchetype, PhotographyStyle, IllustrationStyle } from '@prisma/client'

type Result = { ok: true } | { ok: false; error: string }

async function authorize(brandId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { user: null, brand: null, error: 'NOT_A_CREATOR' as const }
  }
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      creatorProfile: { select: { userId: true } },
    },
  })
  if (!brand) return { user, brand: null, error: 'BRAND_NOT_FOUND' as const }
  if (brand.creatorProfile.userId !== user.id) {
    return { user, brand: null, error: 'NOT_YOUR_BRAND' as const }
  }
  return { user, brand, error: null as null }
}

// -----------------------------------------------------------------------------
// COLORS — full 11-role colorSystem JSON + colorPaletteId reference
// -----------------------------------------------------------------------------

export interface ColorSystemPatch {
  primary?: string
  secondary?: string
  accent?: string
  surface?: string
  background?: string
  textPrimary?: string
  textSecondary?: string
  success?: string
  warning?: string
  error?: string
  border?: string
}

export async function saveBrandColors(input: {
  brandId: string
  colorSystem: ColorSystemPatch
  colorPaletteId?: string | null
  customPaletteOverride?: boolean
}): Promise<Result> {
  const { brand, error } = await authorize(input.brandId)
  if (error) return { ok: false, error }

  // Validate hex format on every supplied role
  for (const [role, value] of Object.entries(input.colorSystem)) {
    if (value && !/^#[0-9a-fA-F]{6}$/.test(value)) {
      return { ok: false, error: `${role} must be a 6-digit hex (got "${value}")` }
    }
  }

  // Merge with any existing colorSystem so missing keys preserve
  const existing = await prisma.brand.findUnique({
    where: { id: brand.id },
    select: { colorSystem: true },
  })
  const prev = (existing?.colorSystem as Record<string, string> | null) ?? {}
  const next = { ...prev, ...input.colorSystem }

  await prisma.brand.update({
    where: { id: brand.id },
    data: {
      colorSystem: next,
      // Top-level legacy convenience fields stay in sync with primary/secondary/accent
      colorPrimary: next.primary ?? null,
      colorSecondary: next.secondary ?? null,
      colorAccent: next.accent ?? null,
      ...(input.colorPaletteId !== undefined ? { colorPaletteId: input.colorPaletteId } : {}),
      ...(input.customPaletteOverride !== undefined
        ? { customPaletteOverride: input.customPaletteOverride }
        : {}),
    },
  })

  revalidatePath(`/brands/${brand.id}/identity`)
  return { ok: true }
}

// Apply a curated ColorPalette in one shot — overrides every role + the link.
export async function applyCuratedPalette(input: {
  brandId: string
  paletteId: string
}): Promise<Result> {
  const { brand, error } = await authorize(input.brandId)
  if (error) return { ok: false, error }

  const palette = await prisma.colorPalette.findUnique({
    where: { id: input.paletteId },
    select: { id: true, colorSystem: true, status: true },
  })
  if (!palette || palette.status !== 'ACTIVE') {
    return { ok: false, error: 'That palette is not available.' }
  }

  const cs = palette.colorSystem as Record<string, string>
  await prisma.brand.update({
    where: { id: brand.id },
    data: {
      colorSystem: cs,
      colorPrimary: cs.primary ?? null,
      colorSecondary: cs.secondary ?? null,
      colorAccent: cs.accent ?? null,
      colorPaletteId: palette.id,
      customPaletteOverride: false,
    },
  })

  revalidatePath(`/brands/${brand.id}/identity`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// TYPOGRAPHY
// -----------------------------------------------------------------------------

export async function saveBrandTypography(input: {
  brandId: string
  typographyPairId?: string | null
  typographyAccentId?: string | null
  typeScaleRatio?: number
}): Promise<Result> {
  const { brand, error } = await authorize(input.brandId)
  if (error) return { ok: false, error }

  // Validate ratio is a known sensible value
  if (input.typeScaleRatio !== undefined) {
    const valid = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618]
    if (!valid.includes(input.typeScaleRatio)) {
      return { ok: false, error: 'Type scale ratio must be one of: 1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618.' }
    }
  }

  // Verify font IDs (if provided) exist + active
  for (const id of [input.typographyPairId, input.typographyAccentId]) {
    if (id) {
      if (id === input.typographyAccentId) {
        const font = await prisma.typographyFont.findUnique({ where: { id }, select: { id: true } })
        if (!font) return { ok: false, error: 'Accent font not found.' }
      } else {
        const pair = await prisma.typographyPair.findUnique({ where: { id }, select: { id: true } })
        if (!pair) return { ok: false, error: 'Typography pair not found.' }
      }
    }
  }

  await prisma.brand.update({
    where: { id: brand.id },
    data: {
      ...(input.typographyPairId !== undefined ? { typographyPairId: input.typographyPairId } : {}),
      ...(input.typographyAccentId !== undefined ? { typographyAccentId: input.typographyAccentId } : {}),
      ...(input.typeScaleRatio !== undefined ? { typeScaleRatio: input.typeScaleRatio } : {}),
    },
  })

  revalidatePath(`/brands/${brand.id}/identity`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// VOICE & TONE
// -----------------------------------------------------------------------------

export async function saveBrandVoice(input: {
  brandId: string
  voiceArchetype?: BrandArchetype | null
  voiceFormality?: number | null // 1-5
  voicePlayfulness?: number | null // 1-5
  voiceWarmth?: number | null // 1-5
  voiceNotes?: string | null
  writingToneWords?: string[]
  brandKeywords?: string[]
  bannedWords?: string[]
  personaDescription?: string | null
}): Promise<Result> {
  const { brand, error } = await authorize(input.brandId)
  if (error) return { ok: false, error }

  // Clamp sliders to 1-5
  function clampSlider(v: number | null | undefined): number | null | undefined {
    if (v === null || v === undefined) return v
    return Math.max(1, Math.min(5, Math.round(v)))
  }

  // Trim word lists; cap writingToneWords at 4 (per schema comment)
  const tone = input.writingToneWords?.map((w) => w.trim()).filter(Boolean).slice(0, 4)

  await prisma.brand.update({
    where: { id: brand.id },
    data: {
      ...(input.voiceArchetype !== undefined ? { voiceArchetype: input.voiceArchetype } : {}),
      ...(input.voiceFormality !== undefined ? { voiceFormality: clampSlider(input.voiceFormality) } : {}),
      ...(input.voicePlayfulness !== undefined ? { voicePlayfulness: clampSlider(input.voicePlayfulness) } : {}),
      ...(input.voiceWarmth !== undefined ? { voiceWarmth: clampSlider(input.voiceWarmth) } : {}),
      ...(input.voiceNotes !== undefined ? { voiceNotes: input.voiceNotes?.trim() || null } : {}),
      ...(tone !== undefined ? { writingToneWords: tone } : {}),
      ...(input.brandKeywords !== undefined
        ? { brandKeywords: input.brandKeywords.map((w) => w.trim()).filter(Boolean) }
        : {}),
      ...(input.bannedWords !== undefined
        ? { bannedWords: input.bannedWords.map((w) => w.trim()).filter(Boolean) }
        : {}),
      ...(input.personaDescription !== undefined
        ? { personaDescription: input.personaDescription?.trim() || null }
        : {}),
    },
  })

  revalidatePath(`/brands/${brand.id}/identity`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// TAGLINES
// -----------------------------------------------------------------------------

export async function saveBrandTaglines(input: {
  brandId: string
  tagline?: string | null
  secondaryTaglines?: string[]
}): Promise<Result> {
  const { brand, error } = await authorize(input.brandId)
  if (error) return { ok: false, error }

  await prisma.brand.update({
    where: { id: brand.id },
    data: {
      ...(input.tagline !== undefined ? { tagline: input.tagline?.trim() || null } : {}),
      ...(input.secondaryTaglines !== undefined
        ? { secondaryTaglines: input.secondaryTaglines.map((t) => t.trim()).filter(Boolean) }
        : {}),
    },
  })

  revalidatePath(`/brands/${brand.id}/identity`)
  return { ok: true }
}
