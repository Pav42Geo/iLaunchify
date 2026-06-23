// Brand Kit template persistence (docs/BRAND_KIT_PROPOSAL.md, locked 2026-06-22).
//
// A BrandTemplate is a reusable packaging/label layout tied to a brand kit. Per-tier
// COUNT is gated by brandLimits(tier) in @ilaunchify/auth at the call site; these
// helpers just persist + count. Cast-guarded: the model lands only after the
// additive db push, so reads fall back to empty and never throw.

import { prisma } from './index'

export interface BrandTemplateValues {
  id: string
  name: string
  thumbnailUrl: string | null
  packagingTypeId: string | null
  createdAt: Date
}

/** A palette role a source color maps to for one-click exact recolor. */
export type TemplateColorRole = 'primary' | 'secondary' | 'accent' | 'neutral'
export type TemplateColorRoles = Record<string, TemplateColorRole>

/** A premium (admin-curated) library template, browsable by Agency creators. */
export interface PremiumTemplateValues {
  id: string
  name: string
  thumbnailUrl: string | null
  packagingTypeId: string | null
  tier: string | null
  createdAt: Date
}

interface BrandTemplateDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  count: (a: unknown) => Promise<number>
  create: (a: unknown) => Promise<Record<string, unknown>>
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>
  delete: (a: unknown) => Promise<unknown>
}

function delegate(): BrandTemplateDelegate | null {
  return (prisma as unknown as { brandTemplate?: BrandTemplateDelegate }).brandTemplate ?? null
}

/** List a brand's saved templates (newest first). Empty on pre-migration. */
export async function listBrandTemplates(brandId: string): Promise<BrandTemplateValues[]> {
  const d = delegate()
  if (!d) return []
  try {
    const rows = await d
      .findMany({
        where: { brandId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, thumbnailUrl: true, packagingTypeId: true, createdAt: true },
      })
      .catch(() => [])
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
      packagingTypeId: (r.packagingTypeId as string | null) ?? null,
      createdAt: (r.createdAt as Date) ?? new Date(0),
    }))
  } catch {
    return []
  }
}

/** Read one template's Fabric JSON for loading onto the Studio stage. Owner-guarded
 *  by brandId; null on pre-migration / not found / wrong owner. */
export async function getBrandTemplateCanvasJson(
  brandId: string,
  templateId: string,
): Promise<string | null> {
  const d = delegate()
  if (!d) return null
  try {
    const row = await d
      .findUnique({ where: { id: templateId }, select: { brandId: true, canvasJson: true } })
      .catch(() => null)
    if (!row || row.brandId !== brandId) return null
    return (row.canvasJson as string | null) ?? null
  } catch {
    return null
  }
}

/** Count a brand's templates — for the per-tier cap check. 0 on pre-migration. */
export async function countBrandTemplates(brandId: string): Promise<number> {
  const d = delegate()
  if (!d) return 0
  try {
    return await d.count({ where: { brandId } }).catch(() => 0)
  } catch {
    return 0
  }
}

/** Create a brand template. Caller enforces the per-tier cap first. The premium
 *  fields (isPremium/tier/colorRoles) are only set by the admin library curator. */
export async function createBrandTemplate(input: {
  brandId: string
  name: string
  canvasJson: string
  thumbnailUrl?: string | null
  packagingTypeId?: string | null
  isPremium?: boolean
  tier?: string | null
  colorRoles?: TemplateColorRoles | null
}): Promise<{ id: string } | null> {
  const d = delegate()
  if (!d) return null
  const row = await d.create({
    data: {
      brandId: input.brandId,
      name: input.name,
      canvasJson: input.canvasJson,
      thumbnailUrl: input.thumbnailUrl ?? null,
      packagingTypeId: input.packagingTypeId ?? null,
      isPremium: input.isPremium ?? false,
      tier: input.tier ?? null,
      colorRoles: (input.colorRoles ?? null) as unknown,
    },
    select: { id: true },
  })
  return { id: String(row.id) }
}

/** List the premium (admin-curated) library templates, newest first. Empty pre-migration. */
export async function listPremiumTemplates(): Promise<PremiumTemplateValues[]> {
  const d = delegate()
  if (!d) return []
  try {
    const rows = await d
      .findMany({
        where: { isPremium: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          thumbnailUrl: true,
          packagingTypeId: true,
          tier: true,
          createdAt: true,
        },
      })
      .catch(() => [])
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
      packagingTypeId: (r.packagingTypeId as string | null) ?? null,
      tier: (r.tier as string | null) ?? null,
      createdAt: (r.createdAt as Date) ?? new Date(0),
    }))
  } catch {
    return []
  }
}

/** Read a premium template's canvas + role map for applying onto the Studio stage.
 *  Premium templates are global (no brand-owner guard). Null pre-migration/not found. */
export async function getPremiumTemplate(
  templateId: string,
): Promise<{ canvasJson: string; colorRoles: TemplateColorRoles | null } | null> {
  const d = delegate()
  if (!d) return null
  try {
    const row = await d
      .findUnique({
        where: { id: templateId },
        select: { isPremium: true, canvasJson: true, colorRoles: true },
      })
      .catch(() => null)
    if (!row || row.isPremium !== true) return null
    return {
      canvasJson: (row.canvasJson as string | null) ?? '',
      colorRoles: (row.colorRoles as TemplateColorRoles | null) ?? null,
    }
  } catch {
    return null
  }
}

/** Owner-guarded delete: only removes the template if it belongs to `brandId`. */
export async function deleteBrandTemplate(brandId: string, templateId: string): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  const row = await d
    .findUnique({ where: { id: templateId }, select: { brandId: true } })
    .catch(() => null)
  if (!row || row.brandId !== brandId) return false
  await d.delete({ where: { id: templateId } })
  return true
}
