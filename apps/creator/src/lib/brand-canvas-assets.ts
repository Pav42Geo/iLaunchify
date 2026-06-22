// Shared builder for BrandCanvasAssets — the Studio canvas's view of a brand kit
// (colors / fonts / logos / tagline). Extracted from the canvas page loader so the
// in-Studio brand switcher (BrandDrawer → loadStudioBrandKit) resolves a *different*
// brand's assets through the exact same path. Logos use the Asset.publicUrl already
// stored on the brand's logo assets.

import { prisma } from '@ilaunchify/db'
import type { BrandCanvasAssets, BrandLogoAsset } from '@ilaunchify/ui'

/** The brand columns this builder reads. The canvas loader already selects all of
 *  these on `product.brand`, so it can pass the row straight through. */
export interface BrandRowForAssets {
  id: string
  name: string
  colorPrimary: string | null
  colorSecondary: string | null
  colorAccent: string | null
  brandSwatches: string[]
  brandFontIds: string[]
  logoAssetId: string | null
  logoIconAssetId: string | null
  logoHorizontalAssetId: string | null
  tagline: string | null
}

function mkLogo(
  variant: BrandLogoAsset['variant'],
  assetId: string | null,
  byId: Map<string, { id: string; publicUrl: string | null; mimeType: string }>,
): BrandLogoAsset | null {
  if (!assetId) return null
  const asset = byId.get(assetId)
  if (!asset) return null
  return { id: asset.id, variant, publicUrl: asset.publicUrl, mimeType: asset.mimeType }
}

export async function buildBrandCanvasAssets(brand: BrandRowForAssets): Promise<BrandCanvasAssets> {
  const logoIds = [brand.logoAssetId, brand.logoIconAssetId, brand.logoHorizontalAssetId].filter(
    (v): v is string => v !== null,
  )

  const [logoAssets, fontRows] = await Promise.all([
    logoIds.length
      ? prisma.asset.findMany({
          where: { id: { in: logoIds } },
          select: { id: true, publicUrl: true, mimeType: true },
        })
      : Promise.resolve([]),
    brand.brandFontIds.length
      ? prisma.typographyFont.findMany({
          where: { id: { in: brand.brandFontIds }, status: 'ACTIVE' },
          select: { id: true, family: true, weight: true, style: true, webfontUrl: true },
        })
      : Promise.resolve([]),
  ])

  const logoByAssetId = new Map(logoAssets.map((a) => [a.id, a]))

  return {
    brandId: brand.id,
    brandName: brand.name,
    colorPrimary: brand.colorPrimary,
    colorSecondary: brand.colorSecondary,
    colorAccent: brand.colorAccent,
    extraSwatches: brand.brandSwatches,
    fonts: fontRows.map((f) => ({
      id: f.id,
      family: f.family,
      weight: f.weight,
      style: f.style,
      webfontUrl: f.webfontUrl,
    })),
    logos: [
      mkLogo('PRIMARY', brand.logoAssetId, logoByAssetId),
      mkLogo('ICON', brand.logoIconAssetId, logoByAssetId),
      mkLogo('HORIZONTAL', brand.logoHorizontalAssetId, logoByAssetId),
    ].filter((l): l is BrandLogoAsset => l !== null),
    tagline: brand.tagline,
  }
}
