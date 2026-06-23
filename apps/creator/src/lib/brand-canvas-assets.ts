// Shared builder for BrandCanvasAssets — the Studio canvas's view of a brand kit
// (colors / fonts / logos / tagline). Extracted from the canvas page loader so the
// in-Studio brand switcher (BrandDrawer → loadStudioBrandKit) resolves a *different*
// brand's assets through the exact same path. Logos use the Asset.publicUrl already
// stored on the brand's logo assets.

import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { isKnownFontFamily } from '@ilaunchify/ui'
import type { BrandCanvasAssets, BrandLogoAsset } from '@ilaunchify/ui'

const LOGO_URL_TTL_SECONDS = 8 * 60 * 60 // matches the design-session signed-URL window

/** A displayable URL for a logo asset: the stored public URL, else a signed read URL
 *  from its storage key (uploaded brand logos don't get a publicUrl set). */
async function resolveLogoUrl(a: { publicUrl: string | null; storageKey: string | null }): Promise<string | null> {
  if (a.publicUrl) return a.publicUrl
  if (!a.storageKey) return null
  try {
    return await getSignedReadUrl(a.storageKey, { expiresInSeconds: LOGO_URL_TTL_SECONDS })
  } catch {
    return null
  }
}

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
  byId: Map<string, { id: string; url: string | null; mimeType: string }>,
): BrandLogoAsset | null {
  if (!assetId) return null
  const asset = byId.get(assetId)
  if (!asset) return null
  return { id: asset.id, variant, publicUrl: asset.url, mimeType: asset.mimeType }
}

export async function buildBrandCanvasAssets(brand: BrandRowForAssets): Promise<BrandCanvasAssets> {
  const logoIds = [brand.logoAssetId, brand.logoIconAssetId, brand.logoHorizontalAssetId].filter(
    (v): v is string => v !== null,
  )

  // Brand fonts are now FONT_CATALOG family keys (Brand Kit V2 Slice 1). Legacy
  // brands may still hold TypographyFont ids — resolve those to their family so
  // existing kits keep their fonts. (Pavel 2026-06-22)
  const legacyFontIds = brand.brandFontIds.filter((v) => !isKnownFontFamily(v))

  const [logoAssets, legacyFontRows] = await Promise.all([
    logoIds.length
      ? prisma.asset.findMany({
          where: { id: { in: logoIds } },
          select: { id: true, publicUrl: true, storageKey: true, mimeType: true },
        })
      : Promise.resolve([]),
    legacyFontIds.length
      ? prisma.typographyFont
          .findMany({ where: { id: { in: legacyFontIds } }, select: { id: true, family: true } })
          .catch(() => [] as { id: string; family: string }[])
      : Promise.resolve([] as { id: string; family: string }[]),
  ])
  const legacyFamilyById = new Map(legacyFontRows.map((r) => [r.id, r.family]))
  // Preserve the saved order (fonts[0] = heading, fonts[1] = body downstream).
  const fontFamilies = brand.brandFontIds
    .map((v) => (isKnownFontFamily(v) ? v : legacyFamilyById.get(v) ?? null))
    .filter((v): v is string => v !== null)

  // Resolve a displayable URL per logo (publicUrl, else a signed read URL).
  const resolvedLogos = await Promise.all(
    logoAssets.map(async (a) => ({ id: a.id, mimeType: a.mimeType, url: await resolveLogoUrl(a) })),
  )
  const logoByAssetId = new Map(resolvedLogos.map((a) => [a.id, a]))

  return {
    brandId: brand.id,
    brandName: brand.name,
    colorPrimary: brand.colorPrimary,
    colorSecondary: brand.colorSecondary,
    colorAccent: brand.colorAccent,
    extraSwatches: brand.brandSwatches,
    // id === family; webfontUrl null — fonts load on demand via loadFont(family).
    fonts: fontFamilies.map((family) => ({
      id: family,
      family,
      weight: 'Regular',
      style: 'Normal',
      webfontUrl: null,
    })),
    logos: [
      mkLogo('PRIMARY', brand.logoAssetId, logoByAssetId),
      mkLogo('ICON', brand.logoIconAssetId, logoByAssetId),
      mkLogo('HORIZONTAL', brand.logoHorizontalAssetId, logoByAssetId),
    ].filter((l): l is BrandLogoAsset => l !== null),
    tagline: brand.tagline,
  }
}
