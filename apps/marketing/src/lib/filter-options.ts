import 'server-only'
import { prisma } from '@ilaunchify/db'
import { CONTAINER_CATEGORY_LABELS } from './filter-constants'

/**
 * DB-driven marketplace filter option loaders (docs/MARKETPLACE_DESIGN.md §7).
 *
 * The STATIC option lists (Format / Process / Allergen-free / Lead / MOQ) live
 * in filter-constants.ts (client-importable). These loaders read live rows
 * (Certifications / Packaging / Market) so the option list reflects the real
 * catalog. All fall back gracefully on error so the sidebar still renders.
 */

export interface CertOption {
  slug: string
  name: string
}

/** Map a product domain (LabelingType) to the cert catalog's applicableLabelingTypes
 *  vocab (FOOD / BEVERAGE / SUPPLEMENT / COSMETIC / PET_PRODUCT / …). */
function certDomainSlugs(domain: string): string[] {
  switch (domain) {
    case 'DIETARY_SUPPLEMENT': return ['SUPPLEMENT']
    case 'FOOD': return ['FOOD', 'BEVERAGE']
    case 'COSMETIC': return ['COSMETIC']
    case 'PET_PRODUCT': return ['PET_PRODUCT']
    default: return [] // OTC / unknown → only universal certs
  }
}

/**
 * Certification options for the More-filters group. Active CertificateTypes,
 * scoped to the selected market (applicableMarketSlugs) and — when the page is
 * scoped to a domain — to certs that apply to that domain (or to all domains,
 * i.e. empty applicableLabelingTypes). Falls back to [] on error.
 */
export async function getCertificationOptions(marketCode?: string, domain?: string | null): Promise<CertOption[]> {
  try {
    const rows = await prisma.certificateType.findMany({
      where: {
        status: 'ACTIVE',
        ...(marketCode
          ? { applicableMarketSlugs: { hasSome: [marketCode, '*'] } }
          : {}),
        ...(domain
          ? { OR: [
              { applicableLabelingTypes: { isEmpty: true } },
              { applicableLabelingTypes: { hasSome: certDomainSlugs(domain) } },
            ] }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: { slug: true, name: true },
    })
    return rows
  } catch (err) {
    console.warn('[filter-options] cert options failed:', (err as Error).message)
    return []
  }
}

export interface PackagingFilterGroup {
  /** ContainerCategory value, e.g. 'BOTTLE'. */
  parent: string
  label: string
  children: { slug: string; name: string }[]
}

/**
 * Packaging filter tree (More-filters): active PackagingTypes grouped by their
 * ContainerCategory parent. Parent selects all children; children narrow.
 * Falls back to [] on error.
 */
export async function getPackagingFilterGroups(domain?: string | null): Promise<PackagingFilterGroup[]> {
  try {
    // applicableLabelingTypes is a pending-migration column — cast-guarded so the
    // build stays green before db:push. Empty applicableLabelingTypes = all domains.
    const rows = await (prisma as unknown as {
      packagingType: { findMany: (a: unknown) => Promise<Array<{ slug: string; displayName: string; containerCategory: string | null }>> }
    }).packagingType.findMany({
      where: {
        status: 'ACTIVE',
        ...(domain
          ? { OR: [
              { applicableLabelingTypes: { isEmpty: true } },
              { applicableLabelingTypes: { hasSome: [domain] } },
            ] }
          : {}),
      },
      orderBy: { displayName: 'asc' },
      select: { slug: true, displayName: true, containerCategory: true },
    })
    const byCat = new Map<string, PackagingFilterGroup>()
    for (const r of rows) {
      const cat = r.containerCategory ?? 'OTHER'
      let g = byCat.get(cat)
      if (!g) {
        g = { parent: cat, label: CONTAINER_CATEGORY_LABELS[cat] ?? cat, children: [] }
        byCat.set(cat, g)
      }
      g.children.push({ slug: r.slug, name: r.displayName })
    }
    return [...byCat.values()].sort((a, b) => a.label.localeCompare(b.label))
  } catch (err) {
    console.warn('[filter-options] packaging groups failed:', (err as Error).message)
    return []
  }
}

export interface MarketOption {
  code: string
  name: string
  active: boolean
}

/**
 * Market options (US/CA/EU). ACTIVE + COMING_SOON rows; COMING_SOON render
 * disabled. Falls back to a US-only default on error so the filter still shows.
 */
export async function getMarketOptions(): Promise<MarketOption[]> {
  try {
    const rows = await prisma.market.findMany({
      where: { status: { in: ['ACTIVE', 'COMING_SOON'] } },
      orderBy: { code: 'asc' },
      select: { code: true, name: true, status: true },
    })
    if (rows.length === 0) return [{ code: 'US', name: 'United States', active: true }]
    return rows.map((r) => ({ code: r.code, name: r.name, active: r.status === 'ACTIVE' }))
  } catch (err) {
    console.warn('[filter-options] market options failed:', (err as Error).message)
    return [{ code: 'US', name: 'United States', active: true }]
  }
}
