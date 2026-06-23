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
  update: (a: unknown) => Promise<unknown>
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
/** Die-line + domain targeting for a template (Design Template Library §5). */
export interface TemplateTargeting {
  domain?: string | null // LabelingType value
  matchMode?: 'SHAPE_FAMILY' | 'EXACT' | null
  targetContainerCategory?: string | null
  targetTopology?: string | null
  aspectBucket?: string | null
  targetSurface?: string | null
}

export async function createBrandTemplate(input: {
  brandId: string
  name: string
  canvasJson: string
  thumbnailUrl?: string | null
  packagingTypeId?: string | null
  isPremium?: boolean
  tier?: string | null
  colorRoles?: TemplateColorRoles | null
} & TemplateTargeting): Promise<{ id: string } | null> {
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
      ...(input.domain !== undefined ? { domain: input.domain } : {}),
      ...(input.matchMode ? { matchMode: input.matchMode } : {}),
      ...(input.targetContainerCategory !== undefined
        ? { targetContainerCategory: input.targetContainerCategory }
        : {}),
      ...(input.targetTopology !== undefined ? { targetTopology: input.targetTopology } : {}),
      ...(input.aspectBucket !== undefined ? { aspectBucket: input.aspectBucket } : {}),
      ...(input.targetSurface !== undefined ? { targetSurface: input.targetSurface } : {}),
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

// ---------------------------------------------------------------------------
// Premium library admin curation (Phase 3c — docs/BRAND_TEMPLATE_THEMING.md).
// Premium templates are owned by a single system "iLaunchify Templates" brand so
// they don't pollute a real creator's kit. The chain User → CreatorProfile → Brand
// is created idempotently on first use.
// ---------------------------------------------------------------------------
const SYSTEM_TEMPLATES_EMAIL = 'system+templates@ilaunchify.internal'
const SYSTEM_TEMPLATES_PROFILE_HANDLE = 'ilaunchify-system-templates'
const SYSTEM_TEMPLATES_BRAND_HANDLE = 'ilaunchify-templates'

/** Read-only: the system templates brand id, or null if it doesn't exist yet. Used to
 *  surface admin-authored REGULAR library templates to all creator tiers without
 *  lazily creating the brand on a read path. */
export async function getSystemTemplatesBrandId(): Promise<string | null> {
  try {
    const p = prisma as unknown as {
      brand: { findUnique: (a: unknown) => Promise<{ id: string } | null> }
    }
    const existing = await p.brand.findUnique({
      where: { handle: SYSTEM_TEMPLATES_BRAND_HANDLE },
      select: { id: true },
    })
    return existing?.id ?? null
  } catch {
    return null
  }
}

/** Get (or lazily create) the system brand that owns all premium templates. */
export async function getOrCreateSystemTemplatesBrand(): Promise<string | null> {
  try {
    const p = prisma as unknown as {
      brand: { findUnique: (a: unknown) => Promise<{ id: string } | null>; create: (a: unknown) => Promise<{ id: string }> }
      user: { upsert: (a: unknown) => Promise<{ id: string }> }
      creatorProfile: { upsert: (a: unknown) => Promise<{ id: string }> }
    }
    const existing = await p.brand.findUnique({
      where: { handle: SYSTEM_TEMPLATES_BRAND_HANDLE },
      select: { id: true },
    })
    if (existing) return existing.id
    const user = await p.user.upsert({
      where: { email: SYSTEM_TEMPLATES_EMAIL },
      update: {},
      // role is required (no default); the system templates owner is a CREATOR
      // (it owns a CreatorProfile + Brand that back the shared template library).
      create: { email: SYSTEM_TEMPLATES_EMAIL, name: 'iLaunchify Templates', role: 'CREATOR' },
    })
    const profile = await p.creatorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        handle: SYSTEM_TEMPLATES_PROFILE_HANDLE,
        displayName: 'iLaunchify Templates',
      },
    })
    const brand = await p.brand.create({
      data: {
        creatorProfileId: profile.id,
        name: 'iLaunchify Templates',
        handle: SYSTEM_TEMPLATES_BRAND_HANDLE,
      },
    })
    return brand.id
  } catch (e) {
    // Surface the real cause instead of a silent null → generic "Templates library
    // unavailable" Notice. Almost always a missing column (additive schema not
    // pushed): run `pnpm db:push && pnpm db:generate`, then restart the dev server.
    console.error('[getOrCreateSystemTemplatesBrand] failed — is the additive schema pushed?', e)
    return null
  }
}

/** Admin: edit a premium template's name / min-tier / role tags / die-line targeting. */
export async function updatePremiumTemplate(
  id: string,
  patch: {
    name?: string
    tier?: string | null
    colorRoles?: TemplateColorRoles | null
  } & TemplateTargeting,
): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  const row = await d.findUnique({ where: { id }, select: { isPremium: true } }).catch(() => null)
  if (!row || row.isPremium !== true) return false
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.tier !== undefined) data.tier = patch.tier
  if (patch.colorRoles !== undefined) data.colorRoles = patch.colorRoles as unknown
  if (patch.domain !== undefined) data.domain = patch.domain
  if (patch.matchMode !== undefined && patch.matchMode !== null) data.matchMode = patch.matchMode
  if (patch.targetContainerCategory !== undefined) data.targetContainerCategory = patch.targetContainerCategory
  if (patch.targetTopology !== undefined) data.targetTopology = patch.targetTopology
  if (patch.aspectBucket !== undefined) data.aspectBucket = patch.aspectBucket
  if (patch.targetSurface !== undefined) data.targetSurface = patch.targetSurface
  await d.update({ where: { id }, data })
  return true
}

interface TemplateStyleAssignmentDelegate {
  deleteMany: (a: unknown) => Promise<unknown>
  createMany: (a: unknown) => Promise<unknown>
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
}

function styleAssignmentDelegate(): TemplateStyleAssignmentDelegate | null {
  return (
    (prisma as unknown as { templateStyleAssignment?: TemplateStyleAssignmentDelegate })
      .templateStyleAssignment ?? null
  )
}

/**
 * Replace a template's style assignments: one primary (drives grid grouping) + any
 * number of secondary tag styles. Idempotent (clears then writes). No-op pre-migration.
 */
export async function setTemplateStyleAssignments(
  templateId: string,
  primaryStyleId: string | null,
  tagStyleIds: string[] = [],
): Promise<boolean> {
  const d = styleAssignmentDelegate()
  if (!d) return false
  const rows: { templateId: string; styleId: string; isPrimary: boolean }[] = []
  if (primaryStyleId) rows.push({ templateId, styleId: primaryStyleId, isPrimary: true })
  for (const sid of tagStyleIds) {
    if (sid && sid !== primaryStyleId) rows.push({ templateId, styleId: sid, isPrimary: false })
  }
  try {
    await d.deleteMany({ where: { templateId } })
    if (rows.length > 0) await d.createMany({ data: rows, skipDuplicates: true })
    return true
  } catch {
    return false
  }
}

/** A premium template's full metadata, for the admin edit form. Null pre-migration/not found. */
export interface PremiumTemplateMeta {
  id: string
  name: string
  tier: string | null
  thumbnailUrl: string | null
  domain: string | null
  matchMode: string | null
  targetContainerCategory: string | null
  targetTopology: string | null
  aspectBucket: string | null
  targetSurface: string | null
  primaryStyleId: string | null
  tagStyleIds: string[]
}

export async function getPremiumTemplateMeta(id: string): Promise<PremiumTemplateMeta | null> {
  const d = delegate()
  if (!d) return null
  try {
    const row = await d
      .findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          tier: true,
          thumbnailUrl: true,
          isPremium: true,
          domain: true,
          matchMode: true,
          targetContainerCategory: true,
          targetTopology: true,
          aspectBucket: true,
          targetSurface: true,
          styleAssignments: { select: { styleId: true, isPrimary: true } },
        },
      })
      .catch(() => null)
    if (!row || row.isPremium !== true) return null
    const assignments = (row.styleAssignments as Array<Record<string, unknown>> | undefined) ?? []
    return {
      id: String(row.id),
      name: String(row.name),
      tier: (row.tier as string | null) ?? null,
      thumbnailUrl: (row.thumbnailUrl as string | null) ?? null,
      domain: (row.domain as string | null) ?? null,
      matchMode: (row.matchMode as string | null) ?? null,
      targetContainerCategory: (row.targetContainerCategory as string | null) ?? null,
      targetTopology: (row.targetTopology as string | null) ?? null,
      aspectBucket: (row.aspectBucket as string | null) ?? null,
      targetSurface: (row.targetSurface as string | null) ?? null,
      primaryStyleId: (assignments.find((a) => a.isPrimary)?.styleId as string | undefined) ?? null,
      tagStyleIds: assignments
        .filter((a) => !a.isPrimary)
        .map((a) => a.styleId as string),
    }
  } catch {
    return null
  }
}

/** Admin: delete a premium template (guarded to isPremium rows only). */
export async function deletePremiumTemplate(id: string): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  const row = await d.findUnique({ where: { id }, select: { isPremium: true } }).catch(() => null)
  if (!row || row.isPremium !== true) return false
  await d.delete({ where: { id } })
  return true
}

// ---------------------------------------------------------------------------
// Admin library management — operates on the whole system templates brand
// (regular + premium), so admins can save/list/edit/delete both. NOT isPremium-
// guarded (that guard stays on the creator-facing premium reads).
// ---------------------------------------------------------------------------

export interface AdminLibraryTemplate {
  id: string
  name: string
  thumbnailUrl: string | null
  isPremium: boolean
  tier: string | null
  domain: string | null
  createdAt: Date
}

/** All admin-library templates (the system brand), newest first. */
export async function listAdminLibraryTemplates(): Promise<AdminLibraryTemplate[]> {
  const d = delegate()
  if (!d) return []
  const systemBrandId = await getSystemTemplatesBrandId()
  if (!systemBrandId) return []
  const rows = await d
    .findMany({
      where: { brandId: systemBrandId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, thumbnailUrl: true, isPremium: true, tier: true, domain: true, createdAt: true },
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    thumbnailUrl: (r.thumbnailUrl as string | null) ?? null,
    isPremium: (r.isPremium as boolean) ?? false,
    tier: (r.tier as string | null) ?? null,
    domain: (r.domain as string | null) ?? null,
    createdAt: (r.createdAt as Date) ?? new Date(0),
  }))
}

/** Update any admin-library template (system-brand-guarded). Accepts tier / isPremium /
 *  targeting; tolerates both regular and premium rows. */
export async function updateLibraryTemplate(
  id: string,
  patch: { name?: string; tier?: string | null; isPremium?: boolean } & TemplateTargeting,
): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  const systemBrandId = await getSystemTemplatesBrandId()
  if (!systemBrandId) return false
  const row = await d.findUnique({ where: { id }, select: { brandId: true } }).catch(() => null)
  if (!row || row.brandId !== systemBrandId) return false
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.tier !== undefined) data.tier = patch.tier
  if (patch.isPremium !== undefined) data.isPremium = patch.isPremium
  if (patch.domain !== undefined) data.domain = patch.domain
  if (patch.matchMode !== undefined && patch.matchMode !== null) data.matchMode = patch.matchMode
  if (patch.targetContainerCategory !== undefined) data.targetContainerCategory = patch.targetContainerCategory
  if (patch.targetTopology !== undefined) data.targetTopology = patch.targetTopology
  if (patch.aspectBucket !== undefined) data.aspectBucket = patch.aspectBucket
  if (patch.targetSurface !== undefined) data.targetSurface = patch.targetSurface
  await d.update({ where: { id }, data })
  return true
}

/** Delete any admin-library template (system-brand-guarded). */
export async function deleteLibraryTemplate(id: string): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  const systemBrandId = await getSystemTemplatesBrandId()
  if (!systemBrandId) return false
  const row = await d.findUnique({ where: { id }, select: { brandId: true } }).catch(() => null)
  if (!row || row.brandId !== systemBrandId) return false
  await d.delete({ where: { id } })
  return true
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
