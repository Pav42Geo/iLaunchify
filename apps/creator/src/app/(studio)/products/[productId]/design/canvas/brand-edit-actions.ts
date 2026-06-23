'use server'

// Studio brand-kit EDITOR loader (docs/BRAND_KIT_PROPOSAL.md). Powers the Brand
// drawer's "Edit kit" mode so the creator edits logos/colors/fonts/tagline WITHOUT
// leaving the Design Studio. Returns exactly what the existing editor sections
// (LogosSection / ColorsSection / FontsSection / TaglineSection) need as props.
// Ownership-guarded: only the signed-in creator's own brands.

import { prisma, listBrandFonts } from '@ilaunchify/db'
import { requireUser, getCreatorTier, brandLimits, canUploadCustomFonts } from '@ilaunchify/auth'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { brandFontCatalog, CUSTOM_FONT_PREFIX } from '@ilaunchify/ui'

export interface StudioAssetSummary {
  id: string
  publicUrl: string | null
  storageKey: string
  mimeType: string
}
export interface StudioFontOption {
  id: string
  family: string
  weight: string
  style: string
  webfontUrl: string | null
}
/** A creator-uploaded custom brand font (Brand Kit V2 Slice 2). */
export interface StudioCustomFont {
  /** Stored in brandFontIds as `custom:<id>`. */
  ref: string
  id: string
  family: string
  webUrl: string | null
}

export type LoadBrandKitEditorResult =
  | {
      ok: true
      name: string
      tagline: string | null
      logos: {
        primary: StudioAssetSummary | null
        icon: StudioAssetSummary | null
        horizontal: StudioAssetSummary | null
      }
      colors: {
        colorPrimary: string | null
        colorSecondary: string | null
        colorAccent: string | null
        brandSwatches: string[]
      }
      selectedFontIds: string[]
      fontCatalog: StudioFontOption[]
      customFonts: StudioCustomFont[]
      canUploadCustomFonts: boolean
    }
  | { ok: false; error: string }

export async function loadStudioBrandKitEditor(
  brandId: string,
): Promise<LoadBrandKitEditorResult> {
  const user = await requireUser()

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: {
      name: true,
      tagline: true,
      colorPrimary: true,
      colorSecondary: true,
      colorAccent: true,
      brandSwatches: true,
      brandFontIds: true,
      logoAssetId: true,
      logoIconAssetId: true,
      logoHorizontalAssetId: true,
    },
  })
  if (!brand) return { ok: false, error: 'That brand kit is not on your account.' }

  const logoIds = [brand.logoAssetId, brand.logoIconAssetId, brand.logoHorizontalAssetId].filter(
    (v): v is string => v !== null,
  )
  const logoAssets = logoIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: logoIds } },
        select: { id: true, publicUrl: true, storageKey: true, mimeType: true },
      })
    : []
  // Resolve a displayable URL per logo: publicUrl, else a signed read URL from the
  // storage key (uploaded brand logos don't get a publicUrl set).
  const resolved: StudioAssetSummary[] = await Promise.all(
    logoAssets.map(async (a) => ({
      id: a.id,
      storageKey: a.storageKey,
      mimeType: a.mimeType,
      publicUrl:
        a.publicUrl ??
        (a.storageKey
          ? await getSignedReadUrl(a.storageKey, { expiresInSeconds: 8 * 60 * 60 }).catch(() => null)
          : null),
    })),
  )
  const byId = new Map(resolved.map((a) => [a.id, a]))

  // Brand Kit V2 Slice 1: the kit font picker now draws from the SAME 113-font
  // FONT_CATALOG the Studio Text tool uses (keyed by family), not the small
  // TypographyFont seed. brandFontIds therefore store family keys. (Pavel 2026-06-22)
  const fontCatalog = brandFontCatalog()

  // Slice 2: the brand's uploaded custom fonts + per-tier upload eligibility.
  const customFontRows = await listBrandFonts(brandId)
  const customWebAssetIds = customFontRows.map((f) => f.webAssetId).filter(Boolean)
  const customAssets = customWebAssetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: customWebAssetIds } },
        select: { id: true, publicUrl: true, storageKey: true },
      })
    : []
  const customUrlById = new Map(
    await Promise.all(
      customAssets.map(
        async (a) =>
          [
            a.id,
            a.publicUrl ??
              (a.storageKey
                ? await getSignedReadUrl(a.storageKey, { expiresInSeconds: 8 * 60 * 60 }).catch(() => null)
                : null),
          ] as const,
      ),
    ),
  )
  const customFonts = customFontRows.map((f) => ({
    ref: `${CUSTOM_FONT_PREFIX}${f.id}`,
    id: f.id,
    family: f.family,
    webUrl: f.webAssetId ? customUrlById.get(f.webAssetId) ?? null : null,
  }))
  const tier = await getCreatorTier(user.id)

  return {
    ok: true as const,
    name: brand.name,
    tagline: brand.tagline,
    logos: {
      primary: brand.logoAssetId ? byId.get(brand.logoAssetId) ?? null : null,
      icon: brand.logoIconAssetId ? byId.get(brand.logoIconAssetId) ?? null : null,
      horizontal: brand.logoHorizontalAssetId ? byId.get(brand.logoHorizontalAssetId) ?? null : null,
    },
    colors: {
      colorPrimary: brand.colorPrimary,
      colorSecondary: brand.colorSecondary,
      colorAccent: brand.colorAccent,
      brandSwatches: brand.brandSwatches,
    },
    selectedFontIds: brand.brandFontIds,
    fontCatalog,
    customFonts,
    canUploadCustomFonts: canUploadCustomFonts(tier),
  }
}

// Quick-create a new brand kit from inside the Studio (name only — handle is derived).
// Tier-gated by the brand-kit cap so the creator never leaves to manage kits.
export async function quickCreateBrandKit(
  rawName: string,
): Promise<{ ok: true; brandId: string; name: string } | { ok: false; error: string }> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Sign in as a creator.' }
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!profile) return { ok: false, error: 'Your creator profile is missing.' }

  const name = rawName.trim()
  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: 'Brand name must be 2–120 characters.' }
  }

  // Tier cap (Maker 1 / Builder 3 / Agency unlimited).
  const tier = await getCreatorTier(user.id)
  const cap = brandLimits(tier).kits
  if (Number.isFinite(cap)) {
    const count = await prisma.brand.count({ where: { creatorProfileId: profile.id } })
    if (count >= cap) {
      return {
        ok: false,
        error:
          cap === 1
            ? 'Your plan includes 1 brand kit. Upgrade to Builder for 3, or Agency for unlimited.'
            : `Your plan includes ${cap} brand kits. Upgrade to Agency for unlimited.`,
      }
    }
  }

  // Derive a unique URL handle from the name.
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 38) || 'brand'
  let handle = base
  let i = 1
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.brand.findUnique({ where: { handle }, select: { id: true } })) {
    handle = `${base}-${i++}`.slice(0, 40)
  }

  const brand = await prisma.brand.create({
    data: { creatorProfileId: profile.id, name, handle, isActive: true },
    select: { id: true },
  })
  await logAuditAs(user, { entityType: 'Brand', entityId: brand.id, action: 'BRAND_CREATED' })
  return { ok: true, brandId: brand.id, name }
}
