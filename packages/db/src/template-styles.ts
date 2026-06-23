/**
 * Design Template Library — style taxonomy reads (docs/DESIGN_TEMPLATE_LIBRARY.md §5).
 * Cast-guarded so it compiles before the `TemplateStyle` table is pushed (the Prisma
 * client can lag the schema): a missing delegate → empty list, never a crash.
 */
import { prisma } from './index'

export type TemplateStyleFacet = 'AESTHETIC' | 'POSITIONING' | 'AUDIENCE' | 'TREND'
export type TemplateStyleDomain =
  | 'COSMETIC'
  | 'FOOD'
  | 'DIETARY_SUPPLEMENT'
  | 'PET_PRODUCT'
  | 'OTC'

export interface TemplateStyleValues {
  id: string
  domain: TemplateStyleDomain
  facet: TemplateStyleFacet
  slug: string
  label: string
  sortOrder: number
  active: boolean
}

interface TemplateStyleDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
}

function delegate(): TemplateStyleDelegate | null {
  return (prisma as unknown as { templateStyle?: TemplateStyleDelegate }).templateStyle ?? null
}

function toValues(row: Record<string, unknown>): TemplateStyleValues {
  return {
    id: row.id as string,
    domain: row.domain as TemplateStyleDomain,
    facet: row.facet as TemplateStyleFacet,
    slug: row.slug as string,
    label: row.label as string,
    sortOrder: (row.sortOrder as number) ?? 0,
    active: (row.active as boolean) ?? true,
  }
}

/**
 * Styles for a domain, ordered by facet then sortOrder. `activeOnly` (default true)
 * hides inactive rows — e.g. all OTC styles until the OTC domain is enabled.
 */
export async function listTemplateStyles(
  domain: TemplateStyleDomain,
  opts: { activeOnly?: boolean } = {},
): Promise<TemplateStyleValues[]> {
  const d = delegate()
  if (!d) return []
  const activeOnly = opts.activeOnly ?? true
  const rows = await d
    .findMany({
      where: { domain, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ facet: 'asc' }, { sortOrder: 'asc' }],
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map(toValues)
}

/** All styles across every domain (admin authoring picker). Includes inactive by default. */
export async function listAllTemplateStyles(
  opts: { activeOnly?: boolean } = {},
): Promise<TemplateStyleValues[]> {
  const d = delegate()
  if (!d) return []
  const activeOnly = opts.activeOnly ?? false
  const rows = await d
    .findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ domain: 'asc' }, { facet: 'asc' }, { sortOrder: 'asc' }],
    })
    .catch(() => [] as Record<string, unknown>[])
  return rows.map(toValues)
}
