'use server'

// Studio brand-kit EDITOR loader (docs/BRAND_KIT_PROPOSAL.md). Powers the Brand
// drawer's "Edit kit" mode so the creator edits logos/colors/fonts/tagline WITHOUT
// leaving the Design Studio. Returns exactly what the existing editor sections
// (LogosSection / ColorsSection / FontsSection / TaglineSection) need as props.
// Ownership-guarded: only the signed-in creator's own brands.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

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
  const byId = new Map(logoAssets.map((a) => [a.id, a]))

  const fontCatalog = await prisma.typographyFont.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, family: true, weight: true, style: true, webfontUrl: true },
    orderBy: [{ family: 'asc' }, { weight: 'asc' }],
  })

  return {
    ok: true,
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
