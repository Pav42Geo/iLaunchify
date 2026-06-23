'use server'

// Studio brand-kit EDITOR loader (docs/BRAND_KIT_PROPOSAL.md). Powers the Brand
// drawer's "Edit kit" mode so the creator edits logos/colors/fonts/tagline WITHOUT
// leaving the Design Studio. Returns exactly what the existing editor sections
// (LogosSection / ColorsSection / FontsSection / TaglineSection) need as props.
// Ownership-guarded: only the signed-in creator's own brands.

import { prisma } from '@ilaunchify/db'
import { requireUser, getCreatorTier, brandLimits } from '@ilaunchify/auth'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'

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

  const fontCatalog = await prisma.typographyFont.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, family: true, weight: true, style: true, webfontUrl: true },
    orderBy: [{ family: 'asc' }, { weight: 'asc' }],
  })

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
