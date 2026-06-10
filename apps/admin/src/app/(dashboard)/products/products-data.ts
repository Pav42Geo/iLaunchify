// =============================================================================
// /admin/products — data loader (task #586)
// =============================================================================
//
// Lifted out of page.tsx so the route file stays focused on layout/chrome.
// Exposes a single `loadProductsData(sp)` that takes the resolved search-param
// shape and returns everything the v2 surface needs: KPI counts, filter chip
// counts, the paginated row set, and the manufacturer/niche/category options
// for the secondary dropdown filters.
//
// KPI counts + bucket counts are independent of the user's current filter so
// the cards/chips always reflect the full picture. Only the table rows obey
// the filter combination.

import { prisma } from '@ilaunchify/db'
import type { ProductTemplateStatus } from '@ilaunchify/db'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export const PRODUCTS_PAGE_SIZE = 50

// Tab buckets are the primary chip row. They map onto exactly one status (or
// the no-filter "all" case). PENDING_REVIEW also subsumes the legacy alias
// UNDER_REVIEW so old rows still show up under "New submissions".
export type ProductsTab =
  | 'new'
  | 'pending-edit'
  | 'needs-changes'
  | 'published'
  | 'all'
  | 'drafts'

export const PRODUCTS_TAB_ORDER: ProductsTab[] = [
  'new',
  'pending-edit',
  'needs-changes',
  'published',
  'all',
  // "drafts" is intentionally LAST + visually distinct — it's a read-only ops
  // view of partners' in-progress builds (where are they stalling), NOT part of
  // the action queue. Admin can't act on a draft.
  'drafts',
]

export const PRODUCTS_TAB_LABEL: Record<ProductsTab, string> = {
  new: 'New submissions',
  'pending-edit': 'Pending edit re-review',
  'needs-changes': 'Needs changes',
  published: 'Published',
  all: 'All',
  drafts: 'In progress',
}

// Map a tab to the set of statuses it filters on (empty = no filter).
export function tabToStatuses(tab: ProductsTab): ProductTemplateStatus[] {
  switch (tab) {
    case 'new':
      return ['PENDING_REVIEW', 'UNDER_REVIEW']
    case 'pending-edit':
      return ['PENDING_EDIT_REVIEW']
    case 'needs-changes':
      return ['NEEDS_CHANGES']
    case 'published':
      return ['PUBLISHED']
    case 'drafts':
      return ['DRAFT']
    case 'all':
    default:
      return []
  }
}

export function isValidTab(s: string | undefined): s is ProductsTab {
  return !!s && (PRODUCTS_TAB_ORDER as readonly string[]).includes(s)
}

// Sort keys allowed in the URL.
export type ProductsSortKey =
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'status'
  | 'manufacturer'
export type SortDir = 'asc' | 'desc'

export function isValidSort(s: string | undefined): s is ProductsSortKey {
  return (
    s === 'createdAt' ||
    s === 'updatedAt' ||
    s === 'name' ||
    s === 'status' ||
    s === 'manufacturer'
  )
}

export interface ProductsSearchParams {
  q?: string
  tab?: string
  niche?: string
  category?: string // subcategory slug
  manufacturer?: string // partner ID
  sort?: string
  dir?: string
  page?: string
}

export interface ParsedFilters {
  q: string
  tab: ProductsTab
  niche: string | null
  category: string | null
  manufacturer: string | null
  sort: ProductsSortKey
  dir: SortDir
  page: number
}

export function parseFilters(sp: ProductsSearchParams): ParsedFilters {
  return {
    q: sp.q?.trim() || '',
    tab: isValidTab(sp.tab) ? sp.tab : 'new',
    niche: sp.niche?.trim() || null,
    category: sp.category?.trim() || null,
    manufacturer: sp.manufacturer?.trim() || null,
    sort: isValidSort(sp.sort) ? sp.sort : 'updatedAt',
    dir: sp.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  }
}

// -----------------------------------------------------------------------------
// Row + payload shapes
// -----------------------------------------------------------------------------

export interface ProductNicheChip {
  slug: string
  name: string
  iconEmoji: string | null
  isPrimary: boolean
}

export interface ProductManufacturer {
  partnerId: string
  companyName: string
}

// Builder-section completion for a DRAFT — derived from which sections actually
// have data (there's no stored step). Ordered the way the builder presents
// them, so the first `false` is where the partner most likely stalled.
export interface DraftProgress {
  recipe: boolean // ≥1 ingredient slot
  production: boolean // ≥1 variant
  packaging: boolean // ≥1 packaging system
  pricing: boolean // ≥1 pricing tier
  media: boolean // hero image attached
  /** sections with data / total sections */
  done: number
  total: number
  /** first incomplete section in builder order, or null when all done */
  stalledAt: 'recipe' | 'production' | 'packaging' | 'pricing' | 'media' | null
}

export interface ProductRow {
  id: string
  name: string
  slug: string
  status: ProductTemplateStatus
  updatedAt: Date
  createdAt: Date
  imageAssetId: string | null
  subcategory: {
    name: string
    slug: string
    category: { name: string; slug: string }
  }
  manufacturer: ProductManufacturer | null
  niches: ProductNicheChip[]
  /** Only meaningful on the "drafts" tab — null elsewhere to keep payload lean. */
  progress: DraftProgress | null
}

export interface ManufacturerOption {
  partnerId: string
  companyName: string
  count: number
}

export interface NicheOption {
  slug: string
  name: string
  iconEmoji: string | null
  count: number
}

export interface CategoryOption {
  slug: string // subcategory slug
  name: string
  categoryName: string
  count: number
}

export interface LoadedProductsData {
  filters: ParsedFilters
  kpis: {
    newSubmissions: number
    pendingEditReview: number
    needsChanges: number
    published: number
    rejected90d: number
  }
  /** Counts per tab bucket — independent of secondary filters. */
  tabCounts: Record<ProductsTab, number>
  /** Per-niche counts at the current tab scope. */
  nicheCounts: NicheOption[]
  /** Subcategory dropdown options. */
  categoryOptions: CategoryOption[]
  /** Manufacturer dropdown options. */
  manufacturerOptions: ManufacturerOption[]
  rows: ProductRow[]
  totalFiltered: number
  totalPages: number
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

export async function loadProductsData(
  sp: ProductsSearchParams,
): Promise<LoadedProductsData> {
  const filters = parseFilters(sp)

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000)

  // Build the where-clause for the table rows. Prisma's WhereInput is too
  // narrowly typed for this many branches, so we cast at query time.
  const where: Record<string, unknown> = {}
  const statuses = tabToStatuses(filters.tab)
  if (statuses.length > 0) {
    where.status = { in: statuses }
  } else {
    // "All" tab — admin must NEVER see partner DRAFTs. A draft is the
    // partner's in-progress builder work; it only enters the review queue once
    // submitted (→ PENDING_REVIEW). Every other tab already filters to a
    // submitted status, so this guard only matters for "all".
    where.status = { not: 'DRAFT' }
  }
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { slug: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  if (filters.niche) {
    where.niches = { some: { niche: { slug: filters.niche } } }
  }
  if (filters.category) {
    where.subcategory = { slug: filters.category }
  }
  if (filters.manufacturer) {
    where.manufacturerService = { partnerId: filters.manufacturer }
  }

  // Order — manufacturer sort is technically a join. We push it down via the
  // relation orderBy syntax Prisma supports; everything else is a simple
  // scalar order. Name is case-insensitive via `mode` not needed at orderBy
  // level — Prisma sorts by collation.
  const dir: 'asc' | 'desc' = filters.dir
  type AnyOrder = Record<string, unknown>
  let orderBy: AnyOrder | AnyOrder[]
  switch (filters.sort) {
    case 'createdAt':
      orderBy = { createdAt: dir }
      break
    case 'name':
      orderBy = { name: dir }
      break
    case 'status':
      orderBy = [{ status: dir }, { updatedAt: 'desc' }]
      break
    case 'manufacturer':
      orderBy = [
        { manufacturerService: { partner: { companyName: dir } } },
        { updatedAt: 'desc' },
      ]
      break
    case 'updatedAt':
    default:
      orderBy = { updatedAt: dir }
      break
  }

  const [
    newSubmissions,
    pendingEditReview,
    needsChanges,
    publishedCount,
    rejected90d,
    tabAllCount,
    draftsCount,
    totalFiltered,
    rawRows,
    nicheGroupsAll,
    nichesMaster,
    subcategoryGroups,
    manufacturerGroups,
  ] = await Promise.all([
    prisma.productTemplate.count({
      where: { status: { in: ['PENDING_REVIEW', 'UNDER_REVIEW'] } },
    }),
    prisma.productTemplate.count({ where: { status: 'PENDING_EDIT_REVIEW' } }),
    prisma.productTemplate.count({ where: { status: 'NEEDS_CHANGES' } }),
    prisma.productTemplate.count({ where: { status: 'PUBLISHED' } }),
    prisma.productTemplate.count({
      where: { status: 'REJECTED', updatedAt: { gte: ninetyDaysAgo } },
    }),
    prisma.productTemplate.count({ where: { status: { not: 'DRAFT' } } }),
    prisma.productTemplate.count({ where: { status: 'DRAFT' } }),
    prisma.productTemplate.count({ where: where as never }),
    prisma.productTemplate.findMany({
      where: where as never,
      include: {
        subcategory: {
          select: {
            name: true,
            slug: true,
            category: { select: { name: true, slug: true } },
          },
        },
        manufacturerService: {
          select: { partner: { select: { id: true, companyName: true } } },
        },
        // Builder-section counts — drive the "In progress" (drafts) tab's
        // completion + stalled-step columns. Cheap aggregate; loaded for every
        // tab but only rendered on drafts.
        _count: {
          select: {
            ingredientSlots: true,
            variants: true,
            packagingSystems: true,
            pricingTiers: true,
          },
        },
        // ProductTemplateNiche join — included via cast because the typed
        // client hasn't been regenerated yet (task #584). After regenerate
        // we can promote this to a typed include.
        ...({
          niches: {
            select: {
              isPrimary: true,
              niche: {
                select: { slug: true, name: true, iconEmoji: true },
              },
            },
          },
        } as object),
      } as never,
      orderBy: orderBy as never,
      skip: (filters.page - 1) * PRODUCTS_PAGE_SIZE,
      take: PRODUCTS_PAGE_SIZE,
    }),
    // Niche counts scoped to the CURRENT tab (so the chip strip reflects
    // "what niches are present in this bucket"), but ignoring the niche
    // filter itself so the chip you toggled doesn't disappear.
    // ProductTemplateNiche / Niche are new models from the Slice 1 marketplace
    // migration — until task #584 (prisma generate) runs locally the typed
    // client doesn't surface them, so we reach for the looser delegate. Cast
    // payloads at use-site.
    (
      prisma as unknown as {
        productTemplateNiche: {
          groupBy: (args: unknown) => Promise<
            { nicheId: string; _count: { _all: number } }[]
          >
        }
      }
    ).productTemplateNiche.groupBy({
      by: ['nicheId'],
      where:
        statuses.length > 0
          ? { productTemplate: { status: { in: statuses } } }
          : { productTemplate: { status: { not: 'DRAFT' } } },
      _count: { _all: true },
    }),
    (
      prisma as unknown as {
        niche: {
          findMany: (args: unknown) => Promise<
            {
              id: string
              slug: string
              name: string
              iconEmoji: string | null
            }[]
          >
        }
      }
    ).niche.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, iconEmoji: true },
      orderBy: { displayOrder: 'asc' },
    }),
    // Subcategory dropdown — every subcat that has ≥1 template, with name +
    // parent category for grouping in the UI.
    prisma.productTemplate.groupBy({
      by: ['subcategoryId'],
      where: { status: { not: 'DRAFT' } },
      _count: { _all: true },
    }),
    // Manufacturer dropdown — partners who have ≥1 ProductTemplate routed
    // through one of their PartnerService rows. Done via a join through
    // PartnerService → Partner.
    // Manufacturers with ≥1 non-DRAFT template. (The _count stays unfiltered —
    // filtered relation counts need a Prisma preview flag — so a manufacturer's
    // dropdown tally may include their drafts, but draft-only manufacturers no
    // longer appear at all.)
    prisma.partnerService.findMany({
      where: { productTemplates: { some: { status: { not: 'DRAFT' } } } },
      select: {
        partner: { select: { id: true, companyName: true } },
        _count: { select: { productTemplates: true } },
      },
    }),
  ])

  // Reshape niche counts — join master list with the group counts so chips
  // show 0 when a niche has no templates in the current tab.
  const nicheGroupsTyped = nicheGroupsAll as {
    nicheId: string
    _count: { _all: number }
  }[]
  const nichesMasterTyped = nichesMaster as {
    id: string
    slug: string
    name: string
    iconEmoji: string | null
  }[]
  const nicheCountMap = new Map(
    nicheGroupsTyped.map((g) => [g.nicheId, g._count._all]),
  )
  const nicheCounts: NicheOption[] = nichesMasterTyped
    .map((n) => ({
      slug: n.slug,
      name: n.name,
      iconEmoji: n.iconEmoji,
      count: nicheCountMap.get(n.id) ?? 0,
    }))
    // Only surface niches that have something OR that are the currently-active
    // chip — keeps the row tight.
    .filter((n) => n.count > 0 || n.slug === filters.niche)

  // Subcategory dropdown — needs name lookup. We fetch the master list and
  // join with counts.
  const subcategoryGroupsTyped = subcategoryGroups as {
    subcategoryId: string
    _count: { _all: number }
  }[]
  const subcatIds = subcategoryGroupsTyped.map((g) => g.subcategoryId)
  const subcategoryRows =
    subcatIds.length > 0
      ? await prisma.subcategory.findMany({
          where: { id: { in: subcatIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            category: { select: { name: true } },
          },
          orderBy: { name: 'asc' },
        })
      : []
  const subcatCountMap = new Map(
    subcategoryGroupsTyped.map((g) => [g.subcategoryId, g._count._all]),
  )
  const categoryOptions: CategoryOption[] = subcategoryRows.map((sc) => ({
    slug: sc.slug,
    name: sc.name,
    categoryName: sc.category.name,
    count: subcatCountMap.get(sc.id) ?? 0,
  }))

  // Manufacturer dropdown — dedupe by partner (a partner can have multiple
  // services, but the dropdown surfaces one row per partner). Sum counts.
  const manufacturerGroupsTyped = manufacturerGroups as {
    partner: { id: string; companyName: string }
    _count: { productTemplates: number }
  }[]
  const manufacturerMap = new Map<
    string,
    { partnerId: string; companyName: string; count: number }
  >()
  for (const svc of manufacturerGroupsTyped) {
    const existing = manufacturerMap.get(svc.partner.id)
    if (existing) {
      existing.count += svc._count.productTemplates
    } else {
      manufacturerMap.set(svc.partner.id, {
        partnerId: svc.partner.id,
        companyName: svc.partner.companyName,
        count: svc._count.productTemplates,
      })
    }
  }
  const manufacturerOptions: ManufacturerOption[] = Array.from(
    manufacturerMap.values(),
  ).sort((a, b) => a.companyName.localeCompare(b.companyName))

  // Per-tab counts so the chip strip always shows totals (NOT obeying the
  // secondary filters — keeps the chips truthful).
  const tabCounts: Record<ProductsTab, number> = {
    new: newSubmissions,
    'pending-edit': pendingEditReview,
    'needs-changes': needsChanges,
    published: publishedCount,
    all: tabAllCount,
    drafts: draftsCount,
  }

  // Row payload type — captures the cast-include shape until the typed
  // Prisma client lands (task #584).
  type RawRow = {
    id: string
    name: string
    slug: string
    status: ProductTemplateStatus
    updatedAt: Date
    createdAt: Date
    imageAssetId: string | null
    subcategory: {
      name: string
      slug: string
      category: { name: string; slug: string }
    }
    manufacturerService: {
      partner: { id: string; companyName: string }
    } | null
    niches: {
      isPrimary: boolean
      niche: { slug: string; name: string; iconEmoji: string | null }
    }[]
    _count: {
      ingredientSlots: number
      variants: number
      packagingSystems: number
      pricingTiers: number
    }
  }

  // Derive draft progress only for the drafts tab (keeps the payload lean
  // elsewhere). Ordered the way the builder presents the sections so the first
  // `false` is the stall point.
  const computeProgress = (r: RawRow): DraftProgress => {
    const recipe = r._count.ingredientSlots > 0
    const production = r._count.variants > 0
    const packaging = r._count.packagingSystems > 0
    const pricing = r._count.pricingTiers > 0
    const media = Boolean(r.imageAssetId)
    const ordered: Array<[DraftProgress['stalledAt'], boolean]> = [
      ['recipe', recipe],
      ['production', production],
      ['packaging', packaging],
      ['pricing', pricing],
      ['media', media],
    ]
    const done = ordered.filter(([, v]) => v).length
    const stalled = ordered.find(([, v]) => !v)
    return {
      recipe,
      production,
      packaging,
      pricing,
      media,
      done,
      total: ordered.length,
      stalledAt: stalled ? stalled[0] : null,
    }
  }
  const wantProgress = filters.tab === 'drafts'

  const rows: ProductRow[] = (rawRows as unknown as RawRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
    imageAssetId: r.imageAssetId,
    subcategory: {
      name: r.subcategory.name,
      slug: r.subcategory.slug,
      category: {
        name: r.subcategory.category.name,
        slug: r.subcategory.category.slug,
      },
    },
    manufacturer: r.manufacturerService?.partner
      ? {
          partnerId: r.manufacturerService.partner.id,
          companyName: r.manufacturerService.partner.companyName,
        }
      : null,
    niches: (r.niches ?? [])
      .map((n) => ({
        slug: n.niche.slug,
        name: n.niche.name,
        iconEmoji: n.niche.iconEmoji,
        isPrimary: n.isPrimary,
      }))
      // Primary first, then natural order
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    progress: wantProgress ? computeProgress(r) : null,
  }))

  const totalPages = Math.max(1, Math.ceil(totalFiltered / PRODUCTS_PAGE_SIZE))

  return {
    filters,
    kpis: {
      newSubmissions,
      pendingEditReview,
      needsChanges,
      published: publishedCount,
      rejected90d,
    },
    tabCounts,
    nicheCounts,
    categoryOptions,
    manufacturerOptions,
    rows,
    totalFiltered,
    totalPages,
  }
}

// -----------------------------------------------------------------------------
// URL helper — shared with page chrome
// -----------------------------------------------------------------------------

export function buildProductsHref(
  current: ParsedFilters,
  overrides: Partial<{
    q: string
    tab: ProductsTab
    niche: string
    category: string
    manufacturer: string
    sort: ProductsSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const q = overrides.q !== undefined ? overrides.q : current.q
  const tab = overrides.tab !== undefined ? overrides.tab : current.tab
  const niche =
    overrides.niche !== undefined ? overrides.niche : current.niche ?? ''
  const category =
    overrides.category !== undefined ? overrides.category : current.category ?? ''
  const manufacturer =
    overrides.manufacturer !== undefined
      ? overrides.manufacturer
      : current.manufacturer ?? ''
  const sort = overrides.sort !== undefined ? overrides.sort : current.sort
  const dir = overrides.dir !== undefined ? overrides.dir : current.dir
  const page = overrides.page !== undefined ? overrides.page : current.page

  const params = new URLSearchParams()
  if (q) params.set('q', q)
  // 'new' is the default tab and we never want it to appear in the URL when
  // it's the only thing set — keeps inbound sidebar `?tab=new` clean and
  // round-trips through this helper as `/products` after a clear.
  if (tab && tab !== 'new') params.set('tab', tab)
  // BUT: if the user is on /products with NO params, they actually land on
  // the "new" tab because that's the default. The sidebar link is the
  // canonical `?tab=new` form; we keep that working by checking the input.
  if (niche) params.set('niche', niche)
  if (category) params.set('category', category)
  if (manufacturer) params.set('manufacturer', manufacturer)
  if (sort !== 'updatedAt') params.set('sort', sort)
  if (dir !== 'desc') params.set('dir', dir)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/products?${qs}` : '/products'
}
