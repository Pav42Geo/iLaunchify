/**
 * Design Template Library — loader that feeds the pure matching engine
 * (@ilaunchify/ui `matchTemplatesToProduct`). Reads premium templates for a domain
 * with their primary style category joined, in the engine's `MatchableTemplate` shape.
 * Cast-guarded: compiles + degrades gracefully before the schema is pushed.
 */
import { prisma } from './index'
import { getSystemTemplatesBrandId } from './brand-templates'

/** Structurally compatible with @ilaunchify/ui `MatchableTemplate` (no cross-package import). */
export interface MatchableTemplateRow {
  id: string
  name: string
  thumbnailUrl: string | null
  isPremium: boolean
  domain: string | null
  matchMode: 'SHAPE_FAMILY' | 'EXACT'
  packagingTypeId: string | null
  targetContainerCategory: string | null
  aspectBucket: 'WRAP' | 'PANEL_WIDE' | 'PANEL_SQUARE' | 'PANEL_TALL' | 'LONG_STRIP' | null
  primaryStyleId: string | null
  primaryStyleLabel: string | null
}

interface BrandTemplateLibraryDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
}

function delegate(): BrandTemplateLibraryDelegate | null {
  return (prisma as unknown as { brandTemplate?: BrandTemplateLibraryDelegate }).brandTemplate ?? null
}

function toRow(row: Record<string, unknown>): MatchableTemplateRow {
  const assignments = (row.styleAssignments as Array<Record<string, unknown>> | undefined) ?? []
  const primary = assignments.find((a) => a.isPrimary === true) ?? assignments[0]
  const style = primary?.style as Record<string, unknown> | undefined
  return {
    id: row.id as string,
    name: row.name as string,
    thumbnailUrl: (row.thumbnailUrl as string | null) ?? null,
    isPremium: (row.isPremium as boolean) ?? false,
    domain: (row.domain as string | null) ?? null,
    matchMode: ((row.matchMode as string) ?? 'SHAPE_FAMILY') as MatchableTemplateRow['matchMode'],
    packagingTypeId: (row.packagingTypeId as string | null) ?? null,
    targetContainerCategory: (row.targetContainerCategory as string | null) ?? null,
    aspectBucket: (row.aspectBucket as MatchableTemplateRow['aspectBucket']) ?? null,
    primaryStyleId: (style?.id as string | undefined) ?? null,
    primaryStyleLabel: (style?.label as string | undefined) ?? null,
  }
}

/**
 * Premium templates for a domain, in the matching engine's input shape. Pass the
 * result + the product's components into `matchTemplatesToProduct`.
 */
export async function listMatchablePremiumTemplates(domain: string): Promise<MatchableTemplateRow[]> {
  const d = delegate()
  if (!d) return []
  const rows = await d
    .findMany({
      where: { isPremium: true, domain },
      include: { styleAssignments: { where: { isPrimary: true }, include: { style: true } } },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map(toRow)
}

/**
 * A creator's own saved templates for a brand + domain, same shape. Lets the library
 * show "My templates" alongside the premium library through one matching pass.
 */
export async function listMatchableBrandTemplates(
  brandId: string,
  domain: string,
): Promise<MatchableTemplateRow[]> {
  const d = delegate()
  if (!d) return []
  const rows = await d
    .findMany({
      where: { brandId, isPremium: false, domain },
      include: { styleAssignments: { where: { isPrimary: true }, include: { style: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map(toRow)
}

/** Template usage analytics (§9.6) — aggregated from TEMPLATE_APPLIED audit rows. */
export interface TemplateUsageStats {
  total: number
  topTemplates: Array<{ id: string; name: string; count: number }>
  topStyles: Array<{ label: string; count: number }>
}

export async function getTemplateUsageStats(limit = 8): Promise<TemplateUsageStats> {
  const auditDelegate = (prisma as unknown as {
    auditLog?: { findMany: (a: unknown) => Promise<Array<{ entityId: string; payload: unknown }>> }
  }).auditLog
  if (!auditDelegate) return { total: 0, topTemplates: [], topStyles: [] }

  const rows = await auditDelegate
    .findMany({
      where: { action: 'TEMPLATE_APPLIED' },
      select: { entityId: true, payload: true },
      orderBy: { at: 'desc' },
      take: 5000,
    })
    .catch(() => [] as Array<{ entityId: string; payload: unknown }>)

  const byTemplate = new Map<string, number>()
  const byStyle = new Map<string, number>()
  for (const r of rows) {
    byTemplate.set(r.entityId, (byTemplate.get(r.entityId) ?? 0) + 1)
    const style = (r.payload as { style?: string | null } | null)?.style
    if (style) byStyle.set(style, (byStyle.get(style) ?? 0) + 1)
  }

  // Resolve template names for the top templates.
  const topIds = [...byTemplate.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  const d = delegate()
  const nameById = new Map<string, string>()
  if (d && topIds.length > 0) {
    const tpls = await d
      .findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: { id: true, name: true } })
      .catch(() => [] as Record<string, unknown>[])
    for (const t of tpls) nameById.set(String(t.id), String(t.name))
  }

  return {
    total: rows.length,
    topTemplates: topIds.map(([id, count]) => ({ id, name: nameById.get(id) ?? '(deleted)', count })),
    topStyles: [...byStyle.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count })),
  }
}

/** A die-cut the admin can design a template on (maps to @ilaunchify/ui DieCutSpec). */
export interface AdminDieCutOption {
  id: string
  name: string
  category: string
  widthMm: number
  heightMm: number
  bleedMm: number
  safeAreaMm: number
  outlineSvg: string
}

/** Active die-cuts for the in-Studio template authoring picker. */
export async function listActiveDieCuts(): Promise<AdminDieCutOption[]> {
  const p = (prisma as unknown as {
    dieCutTemplate?: { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }
  }).dieCutTemplate
  if (!p) return []
  const rows = await p
    .findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        widthMm: true,
        heightMm: true,
        bleedMm: true,
        safeAreaMm: true,
        outlineSvg: true,
      },
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    widthMm: Number(r.widthMm) || 0,
    heightMm: Number(r.heightMm) || 0,
    bleedMm: Number(r.bleedMm) || 3,
    safeAreaMm: Number(r.safeAreaMm) || 3,
    outlineSvg: (r.outlineSvg as string | null) ?? '',
  }))
}

/**
 * Admin-authored REGULAR library templates for a domain (system templates brand,
 * isPremium=false). Available to ALL creator tiers — only the premium library is
 * Agency-gated. Empty if the system brand doesn't exist yet.
 */
export async function listMatchableRegularLibraryTemplates(
  domain: string,
): Promise<MatchableTemplateRow[]> {
  const d = delegate()
  if (!d) return []
  const systemBrandId = await getSystemTemplatesBrandId()
  if (!systemBrandId) return []
  const rows = await d
    .findMany({
      where: { brandId: systemBrandId, isPremium: false, domain },
      include: { styleAssignments: { where: { isPrimary: true }, include: { style: true } } },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map(toRow)
}
