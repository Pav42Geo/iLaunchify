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
