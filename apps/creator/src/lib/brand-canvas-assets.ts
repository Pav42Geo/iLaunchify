// Shared builder for BrandCanvasAssets — the Studio canvas's view of a brand kit
// (colors / fonts / logos / tagline). Extracted from the canvas page loader so the
// in-Studio brand switcher (BrandDrawer → loadStudioBrandKit) resolves a *different*
// brand's assets through the exact same path. Logos use the Asset.publicUrl already
// stored on the brand's logo assets.

import { prisma, getBrandFontsByIds, listBrandTextStyles } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { isKnownFontFamily, isCustomFontRef, customFontId } from '@ilaunchify/ui'
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

  // Brand fonts come in three shapes (Brand Kit V2): FONT_CATALOG family keys
  // (Slice 1), `custom:<id>` refs to an uploaded BrandFont (Slice 2), and legacy
  // TypographyFont ids (pre-Slice-1, resolved to their family). (Pavel 2026-06-22)
  const customIds = brand.brandFontIds
    .filter(isCustomFontRef)
    .map((v) => customFontId(v))
    .filter((v): v is string => v !== null)
  const legacyFontIds = brand.brandFontIds.filter(
    (v) => !isCustomFontRef(v) && !isKnownFontFamily(v),
  )

  const [logoAssets, legacyFontRows, customFontRows] = await Promise.all([
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
    customIds.length ? getBrandFontsByIds(brand.id, customIds) : Promise.resolve([]),
  ])
  const legacyFamilyById = new Map(legacyFontRows.map((r) => [r.id, r.family]))

  // Resolve a signed/public URL for each custom font's web asset (for @font-face).
  const customWebAssetIds = customFontRows.map((f) => f.webAssetId).filter(Boolean)
  const customAssets = customWebAssetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: customWebAssetIds } },
        select: { id: true, publicUrl: true, storageKey: true },
      })
    : []
  const customAssetUrlById = new Map(
    await Promise.all(
      customAssets.map(async (a) => [a.id, await resolveLogoUrl(a)] as const),
    ),
  )
  const customById = new Map(
    customFontRows.map((f) => [
      f.id,
      { family: f.family, url: f.webAssetId ? customAssetUrlById.get(f.webAssetId) ?? null : null },
    ]),
  )

  // Resolve a displayable URL per logo (publicUrl, else a signed read URL).
  const resolvedLogos = await Promise.all(
    logoAssets.map(async (a) => ({ id: a.id, mimeType: a.mimeType, url: await resolveLogoUrl(a) })),
  )
  const logoByAssetId = new Map(resolvedLogos.map((a) => [a.id, a]))

  // Build the fonts array in saved order (fonts[0] = heading, fonts[1] = body).
  const fonts = brand.brandFontIds
    .map((v) => {
      if (isCustomFontRef(v)) {
        const id = customFontId(v)
        const c = id ? customById.get(id) : undefined
        return c ? { id: v, family: c.family, weight: 'Regular', style: 'Normal', webfontUrl: c.url } : null
      }
      if (isKnownFontFamily(v)) {
        return { id: v, family: v, weight: 'Regular', style: 'Normal', webfontUrl: null }
      }
      const fam = legacyFamilyById.get(v)
      return fam ? { id: v, family: fam, weight: 'Regular', style: 'Normal', webfontUrl: null } : null
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  // Text-style → font-family map (Slice 2c). Each role's fontKey resolves to a family
  // via the already-resolved fonts (role fonts are kept in brandFontIds). A catalog
  // family resolves to itself even if not in brandFontIds.
  const refToFamily = new Map(fonts.map((f) => [f.id, f.family]))
  const styleRows = await listBrandTextStyles(brand.id)
  const roleFamily = (key: string): string | undefined =>
    refToFamily.get(key) ?? (isKnownFontFamily(key) && !isCustomFontRef(key) ? key : undefined)
  const textStyles: { heading?: string; subheading?: string; body?: string } = {}
  for (const row of styleRows) {
    const fam = roleFamily(row.fontKey)
    if (!fam) continue
    if (row.role === 'HEADING') textStyles.heading = fam
    else if (row.role === 'SUBHEADING') textStyles.subheading = fam
    else if (row.role === 'BODY') textStyles.body = fam
  }

  return {
    brandId: brand.id,
    brandName: brand.name,
    colorPrimary: brand.colorPrimary,
    colorSecondary: brand.colorSecondary,
    colorAccent: brand.colorAccent,
    extraSwatches: brand.brandSwatches,
    // Catalog fonts: webfontUrl null (loaded via loadFont(family)). Custom fonts:
    // webfontUrl is the uploaded file URL → loaded via loadCustomFont(family, url).
    fonts,
    textStyles: Object.keys(textStyles).length ? textStyles : null,
    logos: [
      mkLogo('PRIMARY', brand.logoAssetId, logoByAssetId),
      mkLogo('ICON', brand.logoIconAssetId, logoByAssetId),
      mkLogo('HORIZONTAL', brand.logoHorizontalAssetId, logoByAssetId),
    ].filter((l): l is BrandLogoAsset => l !== null),
    tagline: brand.tagline,
  }
}
