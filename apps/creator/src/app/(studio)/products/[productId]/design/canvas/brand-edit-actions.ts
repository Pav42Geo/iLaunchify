'use server'

// Studio brand-kit EDITOR loader (docs/BRAND_KIT_PROPOSAL.md). Powers the Brand
// drawer's "Edit kit" mode so the creator edits logos/colors/fonts/tagline WITHOUT
// leaving the Design Studio. Returns exactly what the existing editor sections
// (LogosSection / ColorsSection / FontsSection / TaglineSection) need as props.
// Ownership-guarded: only the signed-in creator's own brands.

import {
  prisma,
  listBrandFonts,
  listBrandTextStyles,
  listBrandPalettes,
  setBrandTextStyle,
  addBrandAsset,
  removeBrandAsset,
  type BrandTextRole,
  type BrandAssetKind,
} from '@ilaunchify/db'
import { requireUser, getCreatorTier, brandLimits, canUploadCustomFonts, canUseColorHarmony } from '@ilaunchify/auth'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { brandFontCatalog, isKnownFontFamily, CUSTOM_FONT_PREFIX } from '@ilaunchify/ui'

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
      canHarmony: boolean
      // Slice 4 — text styles (shape matches TextStylesSection's RoleStyleState).
      textStyles: {
        role: 'HEADING' | 'SUBHEADING' | 'BODY'
        fontKey: string | null
        fontSize: number | null
        fontWeight: string | null
        textCase: string | null
        colorRef: string | null
      }[]
      // Slice 4 — font options for the text-style font picker.
      fontOptions: { value: string; label: string }[]
      // Slice 5 — color palettes (shape matches PalettesSection's PaletteState).
      palettes: {
        id: string
        name: string
        swatches: {
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
        }[]
      }[]
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

  // Slice 4 — text styles + the font option list (catalog families + custom refs).
  const ROLES = new Set(['HEADING', 'SUBHEADING', 'BODY'])
  const textStyleRows = await listBrandTextStyles(brandId)
  const textStyles = textStyleRows
    .filter((r) => ROLES.has(r.role))
    .map((r) => ({
      role: r.role as 'HEADING' | 'SUBHEADING' | 'BODY',
      fontKey: r.fontKey || null,
      fontSize: r.fontSize,
      fontWeight: r.fontWeight,
      textCase: r.textCase,
      colorRef: r.colorRef,
    }))
  const fontOptions = [
    ...fontCatalog.map((f) => ({ value: f.family, label: f.family })),
    ...customFonts.map((f) => ({ value: f.ref, label: `${f.family} (custom)` })),
  ]

  // Slice 5 — color palettes.
  const paletteRows = await listBrandPalettes(brandId)
  const palettes = paletteRows.map((p) => ({
    id: p.id,
    name: p.name,
    swatches: p.swatches.map((s) => ({
      id: s.id,
      kind: s.kind,
      hex: s.hex,
      name: s.name,
      cmykC: s.cmykC,
      cmykM: s.cmykM,
      cmykY: s.cmykY,
      cmykK: s.cmykK,
      pantone: s.pantone,
      gradient: s.gradient,
    })),
  }))

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
    canHarmony: canUseColorHarmony(tier),
    textStyles,
    fontOptions,
    palettes,
  }
}

// Add a single font (catalog family or `custom:<id>` ref) to a brand kit's font list
// from the Studio Text font drawer's 3-dot "Add to Brand Kit" menu (Slice 2c). Append
// + dedupe, owner-guarded, capped at 3. Idempotent if already present.
export async function addFontToBrandKit(
  brandId: string,
  fontRef: string,
): Promise<{ ok: true; brandName: string } | { ok: false; error: string }> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Sign in as a creator.' }
  if (!isKnownFontFamily(fontRef)) return { ok: false, error: 'That font is not available.' }

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true, name: true, brandFontIds: true },
  })
  if (!brand) return { ok: false, error: 'That brand kit is not on your account.' }

  if (brand.brandFontIds.includes(fontRef)) return { ok: true, brandName: brand.name }
  if (brand.brandFontIds.length >= 3) {
    return { ok: false, error: `${brand.name} already has 3 brand fonts. Remove one first.` }
  }

  await prisma.brand.update({
    where: { id: brand.id },
    data: { brandFontIds: [...brand.brandFontIds, fontRef] },
  })
  return { ok: true, brandName: brand.name }
}

// Assign a font to a specific brand TEXT STYLE (Heading/Subheading/Body) from the Text
// font drawer's 3-dot → "Add to Brand → <style>" (Slice 2c). Records the role→font
// mapping AND keeps the font in brandFontIds so the canvas can load/render it. Owner-
// guarded. Returns the brand name + role label for the confirmation toast.
const ROLE_LABELS: Record<BrandTextRole, string> = {
  HEADING: 'Heading',
  SUBHEADING: 'Subheading',
  BODY: 'Body',
}
// Keep room for distinct fonts across all roles (heading/subheading/body) + the manual
// 3-font picker, without letting the list grow unbounded.
const MAX_BRAND_FONTS = 6

export async function setBrandRoleFont(
  brandId: string,
  role: BrandTextRole,
  fontRef: string,
): Promise<{ ok: true; brandName: string; roleLabel: string } | { ok: false; error: string }> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Sign in as a creator.' }
  if (!isKnownFontFamily(fontRef)) return { ok: false, error: 'That font is not available.' }

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true, name: true, brandFontIds: true },
  })
  if (!brand) return { ok: false, error: 'That brand kit is not on your account.' }

  // Ensure the role font is present in brandFontIds so it resolves (family + URL) for
  // the canvas; trim oldest extras beyond the cap, never dropping the new one.
  let fontIds = brand.brandFontIds
  if (!fontIds.includes(fontRef)) {
    fontIds = [...fontIds, fontRef].slice(-MAX_BRAND_FONTS)
  }
  if (fontIds !== brand.brandFontIds) {
    await prisma.brand.update({ where: { id: brand.id }, data: { brandFontIds: fontIds } })
  }

  const saved = await setBrandTextStyle(brand.id, role, fontRef)
  if (!saved) {
    return { ok: false, error: 'Text styles need a database update — run db push, then retry.' }
  }
  return { ok: true, brandName: brand.name, roleLabel: ROLE_LABELS[role] }
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

// ============================================================================
// Brand Kit V2 Slice 3 — pin/unpin a visual asset to a brand kit. Pinned assets
// surface in the Design Studio "Elements → Photos & uploads" rail. Owner-guarded
// by brand; the assetId comes from the creator's own canvas library.
// ============================================================================

async function ownsBrand(userId: string, brandId: string): Promise<boolean> {
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId } },
    select: { id: true },
  })
  return !!brand
}

export async function pinAssetToBrand(
  brandId: string,
  assetId: string,
  kind: BrandAssetKind = 'IMAGE',
): Promise<{ ok: true; brandAssetId: string | null } | { ok: false; error: string }> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Sign in as a creator.' }
  if (!(await ownsBrand(user.id, brandId))) {
    return { ok: false, error: 'That brand kit is not on your account.' }
  }
  // Confirm the asset exists (it comes from the creator's own library in the UI).
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } })
  if (!asset) return { ok: false, error: 'That image is no longer available.' }

  const id = await addBrandAsset({ brandId, assetId, kind })
  if (id === null) {
    return { ok: false, error: 'Brand images need a database update — run db push, then retry.' }
  }
  await logAuditAs(user, { entityType: 'Brand', entityId: brandId, action: 'BRAND_UPDATED' })
  return { ok: true, brandAssetId: id }
}

export async function unpinBrandAsset(
  brandId: string,
  brandAssetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Sign in as a creator.' }
  if (!(await ownsBrand(user.id, brandId))) {
    return { ok: false, error: 'That brand kit is not on your account.' }
  }
  const removed = await removeBrandAsset(brandId, brandAssetId)
  if (!removed) return { ok: false, error: 'That image was already removed.' }
  await logAuditAs(user, { entityType: 'Brand', entityId: brandId, action: 'BRAND_UPDATED' })
  return { ok: true }
}
