'use server'

// Brand Kit — in-Studio server actions (docs/BRAND_KIT_PROPOSAL.md, DECIDED
// 2026-06-22). Powers the canvas "Brand" drawer (switch kits, load templates) +
// the "Save as template" menu action. Every read/write is ownership-scoped: only
// brands where creatorProfile.userId === session user.

import { requireUser, getCreatorTier, brandLimits, canRecolorTemplate } from '@ilaunchify/auth'
import {
  prisma,
  listBrandTemplates,
  getBrandTemplateCanvasJson,
  countBrandTemplates,
  createBrandTemplate,
  listPremiumTemplates,
  getPremiumTemplate,
  listMatchablePremiumTemplates,
  listMatchableBrandTemplates,
  listMatchableRegularLibraryTemplates,
  getSystemTemplatesBrandId,
  type BrandTemplateValues,
  type PremiumTemplateValues,
  type MatchableTemplateRow,
} from '@ilaunchify/db'
import type { ProductComponentDieline } from '@ilaunchify/ui'
import { logAuditAs } from '@ilaunchify/audit'
import type { BrandCanvasAssets } from '@ilaunchify/ui'
import { buildBrandCanvasAssets } from '@/lib/brand-canvas-assets'

const BRAND_SELECT = {
  id: true,
  name: true,
  colorPrimary: true,
  colorSecondary: true,
  colorAccent: true,
  brandSwatches: true,
  brandFontIds: true,
  logoAssetId: true,
  logoIconAssetId: true,
  logoHorizontalAssetId: true,
  tagline: true,
} as const

export interface StudioBrandKitOption {
  id: string
  name: string
}

/** The creator's brand kits, for the Studio "active kit" switcher. */
export async function listStudioBrandKits(): Promise<StudioBrandKitOption[]> {
  const user = await requireUser()
  const brands = await prisma.brand.findMany({
    where: { creatorProfile: { userId: user.id } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return brands.map((b) => ({ id: b.id, name: b.name }))
}

export type LoadStudioBrandKitResult =
  | { ok: true; assets: BrandCanvasAssets; templates: BrandTemplateValues[] }
  | { ok: false; error: string }

/** Resolve one of the creator's kits (canvas assets + saved templates) for the
 *  switcher. Ownership-checked — never returns another creator's kit. */
export async function loadStudioBrandKit(brandId: string): Promise<LoadStudioBrandKitResult> {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: BRAND_SELECT,
  })
  if (!brand) return { ok: false, error: 'Brand kit not found.' }
  const [assets, templates] = await Promise.all([
    buildBrandCanvasAssets(brand),
    listBrandTemplates(brandId),
  ])
  return { ok: true, assets, templates }
}

export type BrandTemplateJsonResult =
  | { ok: true; canvasJson: string }
  | { ok: false; error: string }

/** A template's Fabric JSON, for "start from template". Double-guarded: the brand
 *  must belong to the creator, and the db helper re-checks the template's brandId. */
export async function getStudioBrandTemplateJson(
  brandId: string,
  templateId: string,
): Promise<BrandTemplateJsonResult> {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) return { ok: false, error: 'Brand kit not found.' }
  const json = await getBrandTemplateCanvasJson(brandId, templateId)
  if (!json) return { ok: false, error: 'Template not found.' }
  return { ok: true, canvasJson: json }
}

export type SaveBrandTemplateResult = { ok: true; id: string } | { ok: false; error: string }

/** Save the current design as a reusable brand template. Enforces the per-tier cap
 *  server-side (authoritative), then persists + audits. */
export async function saveAsBrandTemplate(input: {
  brandId: string
  name: string
  canvasJson: string
  thumbnailUrl?: string | null
  packagingTypeId?: string | null
}): Promise<SaveBrandTemplateResult> {
  const user = await requireUser()
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Give the template a name.' }

  const brand = await prisma.brand.findFirst({
    where: { id: input.brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) return { ok: false, error: 'Brand kit not found.' }

  const tier = await getCreatorTier(user.id)
  const cap = brandLimits(tier).templatesPerKit
  const count = await countBrandTemplates(input.brandId)
  if (count >= cap) {
    return { ok: false, error: `Template limit reached for this kit (${cap}); upgrade or delete one.` }
  }

  const created = await createBrandTemplate({
    brandId: input.brandId,
    name,
    canvasJson: input.canvasJson,
    thumbnailUrl: input.thumbnailUrl ?? null,
    packagingTypeId: input.packagingTypeId ?? null,
  })
  if (!created) return { ok: false, error: 'Templates aren’t available yet — try again shortly.' }

  await logAuditAs(user, {
    entityType: 'BrandTemplate',
    entityId: created.id,
    action: 'BRAND_TEMPLATE_CREATED',
    payload: { brandId: input.brandId, name },
  })
  return { ok: true, id: created.id }
}

// ---------------------------------------------------------------------------
// Premium template library (Phase 3c). Agency-tier creators browse the admin-
// curated gallery and load a template onto the Studio stage; they then recolor it
// with the RecolorPanel. Gated by canRecolorTemplate (Agency), same as recolor.
// ---------------------------------------------------------------------------

/** The premium library, for the Agency gallery. Empty for non-Agency tiers. */
export async function listStudioPremiumTemplates(): Promise<PremiumTemplateValues[]> {
  const user = await requireUser()
  const tier = await getCreatorTier(user.id)
  if (!canRecolorTemplate(tier)) return []
  return listPremiumTemplates()
}

/** The creator's own saved templates for a brand (ownership-checked). */
export async function listStudioBrandTemplates(brandId: string): Promise<BrandTemplateValues[]> {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) return []
  return listBrandTemplates(brandId)
}

// ---------------------------------------------------------------------------
// Template library — die-line-aware browse (docs/DESIGN_TEMPLATE_LIBRARY.md §6/§7).
// Returns the product's surface as a matchable component + the candidate templates
// (premium, Agency-gated + the brand's own), in the @ilaunchify/ui engine's shape.
// The drawer runs matchTemplatesToProduct() client-side to group by category.
// ---------------------------------------------------------------------------

export interface StudioTemplateLibrary {
  component: ProductComponentDieline
  /** Admin premium library — Agency only (empty for lower tiers). */
  premium: MatchableTemplateRow[]
  /** Admin regular library — available to all tiers. */
  regular: MatchableTemplateRow[]
  /** The creator's own saved templates. */
  own: MatchableTemplateRow[]
}

export async function loadStudioTemplateLibrary(input: {
  productId: string
  brandId: string
  domain: string
  surface: {
    componentId: string
    label: string
    packagingTypeId: string | null
    widthMm: number | null
    heightMm: number | null
  }
}): Promise<StudioTemplateLibrary | null> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, variant: { select: { packagingTypeId: true } } },
  })
  if (!product) return null

  const packagingTypeId = input.surface.packagingTypeId ?? product.variant?.packagingTypeId ?? null
  let containerCategory: string | null = null
  if (packagingTypeId) {
    const pt = await prisma.packagingType.findUnique({
      where: { id: packagingTypeId },
      select: { containerCategory: true },
    })
    containerCategory = (pt?.containerCategory as string | null) ?? null
  }

  const component: ProductComponentDieline = {
    componentId: input.surface.componentId,
    label: input.surface.label,
    packagingTypeId,
    containerCategory,
    widthMm: input.surface.widthMm,
    heightMm: input.surface.heightMm,
  }

  const tier = await getCreatorTier(user.id)
  // Premium library is Agency-gated; the regular library is open to all tiers.
  const premium = canRecolorTemplate(tier) ? await listMatchablePremiumTemplates(input.domain) : []
  const regular = await listMatchableRegularLibraryTemplates(input.domain)

  const brand = await prisma.brand.findFirst({
    where: { id: input.brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  const own = brand ? await listMatchableBrandTemplates(input.brandId, input.domain) : []

  return { component, premium, regular, own }
}

/** A regular admin-library template's Fabric JSON. Open to all tiers (only premium is
 *  Agency-gated). Reads the system templates brand's isPremium=false rows. */
export async function getStudioRegularLibraryTemplateJson(
  templateId: string,
): Promise<BrandTemplateJsonResult> {
  await requireUser()
  const systemBrandId = await getSystemTemplatesBrandId()
  if (!systemBrandId) return { ok: false, error: 'Template not found.' }
  const json = await getBrandTemplateCanvasJson(systemBrandId, templateId)
  if (!json) return { ok: false, error: 'Template not found.' }
  return { ok: true, canvasJson: json }
}

/** A premium template's Fabric JSON to load onto the canvas. Agency-gated. */
export async function getStudioPremiumTemplateJson(
  templateId: string,
): Promise<BrandTemplateJsonResult> {
  const user = await requireUser()
  const tier = await getCreatorTier(user.id)
  if (!canRecolorTemplate(tier)) return { ok: false, error: 'Premium templates are an Agency feature.' }
  const tpl = await getPremiumTemplate(templateId)
  if (!tpl || !tpl.canvasJson) return { ok: false, error: 'Template not found.' }
  return { ok: true, canvasJson: tpl.canvasJson }
}
