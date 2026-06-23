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
  type BrandTemplateValues,
  type PremiumTemplateValues,
} from '@ilaunchify/db'
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
