// =============================================================================
// /admin/accessories — data loader (Track C / C7.k)
// =============================================================================
//
// The accessory verification queue. Lists every AccessoryOffering across all
// partners so admins can approve / archive / reactivate partner-submitted
// brand add-ons (engraved spoons, ribbons, recipe cards, …).
//
// IMPORTANT — partner name resolution is a TWO-STEP lookup. `partnerServiceId`
// is a SOFT FK (no Prisma relation per the accessories-are-partner-bundled lock)
// so we cannot `include` the partner. We collect serviceIds, fetch the matching
// PartnerService rows (which DO relate to Partner), and build a Map. Anything
// not found resolves to "Unknown".
//
// Image thumbs are signed R2 read URLs resolved server-side via Promise.all.
//
// KPI counts are independent of the active filter so the cards always reflect
// the full picture. Only the table rows obey the status / category filter.

import { prisma } from '@ilaunchify/db'
import type { AccessoryCategory, OfferingStatus } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const ACCESSORIES_PAGE_SIZE = 50

// Admins only triage three meaningful buckets (DRAFT offerings never surface —
// they're partner-private until submitted). The status chip row maps to these.
export type AccessoryStatusBucket = 'PENDING_REVIEW' | 'ACTIVE' | 'ARCHIVED'

export const ACCESSORY_STATUS_ORDER: AccessoryStatusBucket[] = [
  'PENDING_REVIEW',
  'ACTIVE',
  'ARCHIVED',
]

export const ACCESSORY_STATUS_LABEL: Record<AccessoryStatusBucket, string> = {
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
}

export const ACCESSORY_CATEGORY_ORDER: AccessoryCategory[] = [
  'SPOON',
  'RIBBON',
  'TAG',
  'INSERT',
  'CAP_COVER',
  'TISSUE',
  'WAX_SEAL',
  'STICKER_PACK',
  'OTHER',
]

export const ACCESSORY_CATEGORY_LABEL: Record<AccessoryCategory, string> = {
  SPOON: 'Spoon',
  RIBBON: 'Ribbon',
  TAG: 'Tag',
  INSERT: 'Insert',
  CAP_COVER: 'Cap cover',
  TISSUE: 'Tissue',
  WAX_SEAL: 'Wax seal',
  STICKER_PACK: 'Sticker pack',
  OTHER: 'Other',
}

export type AccessoriesSortKey = 'createdAt' | 'name' | 'moq' | 'leadTimeDays' | 'status'
export type SortDir = 'asc' | 'desc'

// -----------------------------------------------------------------------------
// Filters
// -----------------------------------------------------------------------------

export interface AccessoriesSearchParams {
  status?: string
  category?: string
  q?: string
  sort?: string
  dir?: string
  page?: string
}

export interface ParsedFilters {
  status: AccessoryStatusBucket | null
  category: AccessoryCategory | null
  q: string
  sort: AccessoriesSortKey
  dir: SortDir
  page: number
}

function isValidStatus(s: string | undefined): s is AccessoryStatusBucket {
  return !!s && (ACCESSORY_STATUS_ORDER as readonly string[]).includes(s)
}

function isValidCategory(s: string | undefined): s is AccessoryCategory {
  return !!s && (ACCESSORY_CATEGORY_ORDER as readonly string[]).includes(s)
}

function isValidSort(s: string | undefined): s is AccessoriesSortKey {
  return (
    s === 'createdAt' ||
    s === 'name' ||
    s === 'moq' ||
    s === 'leadTimeDays' ||
    s === 'status'
  )
}

export function parseFilters(sp: AccessoriesSearchParams): ParsedFilters {
  return {
    status: isValidStatus(sp.status) ? sp.status : null,
    category: isValidCategory(sp.category) ? sp.category : null,
    q: sp.q?.trim() || '',
    sort: isValidSort(sp.sort) ? sp.sort : 'createdAt',
    dir: sp.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  }
}

// -----------------------------------------------------------------------------
// Row + result shapes
// -----------------------------------------------------------------------------

interface PricingTier {
  quantity: number
  pricePerUnit: number
}

export interface AccessoryRow {
  id: string
  name: string
  category: AccessoryCategory
  status: OfferingStatus
  moq: number
  leadTimeDays: number
  firstUnitPrice: number | null
  imageUrl: string | null
  partnerId: string | null
  partnerName: string
  createdAt: Date
}

export interface AccessoriesKpis {
  total: number
  pendingReview: number
  active: number
  archived: number
  distinctPartners: number
}

export interface LoadedAccessoriesData {
  filters: ParsedFilters
  kpis: AccessoriesKpis
  statusCounts: Record<AccessoryStatusBucket, number>
  categoryCounts: Record<AccessoryCategory, number>
  rows: AccessoryRow[]
  totalFiltered: number
  totalPages: number
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function firstTierPrice(pricingTiers: unknown): number | null {
  if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) return null
  const first = pricingTiers[0] as Partial<PricingTier> | null
  const price = first?.pricePerUnit
  return typeof price === 'number' && Number.isFinite(price) ? price : null
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

export async function loadAccessoriesData(
  sp: AccessoriesSearchParams,
): Promise<LoadedAccessoriesData> {
  const filters = parseFilters(sp)

  // Table where-clause (KPIs intentionally ignore it).
  const where: Record<string, unknown> = {}
  if (filters.status) where.status = filters.status
  if (filters.category) where.category = filters.category
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
    ]
  }

  const dir = filters.dir
  const orderBy =
    filters.sort === 'name'
      ? { name: dir }
      : filters.sort === 'moq'
        ? { moq: dir }
        : filters.sort === 'leadTimeDays'
          ? { leadTimeDays: dir }
          : filters.sort === 'status'
            ? { status: dir }
            : { createdAt: dir }

  const [
    total,
    statusGroupCounts,
    categoryGroupCounts,
    distinctServiceIdRows,
    totalFiltered,
    rawRows,
  ] = await Promise.all([
    prisma.accessoryOffering.count(),
    prisma.accessoryOffering.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.accessoryOffering.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.accessoryOffering.findMany({
      select: { partnerServiceId: true },
      distinct: ['partnerServiceId'],
    }),
    prisma.accessoryOffering.count({ where: where as never }),
    prisma.accessoryOffering.findMany({
      where: where as never,
      orderBy,
      skip: (filters.page - 1) * ACCESSORIES_PAGE_SIZE,
      take: ACCESSORIES_PAGE_SIZE,
    }),
  ])

  // STEP 2 of the soft-FK resolution: map every serviceId on this page back to
  // its partner via PartnerService (which DOES relate to Partner).
  const serviceIds = [...new Set(rawRows.map((r) => r.partnerServiceId))]
  const services =
    serviceIds.length === 0
      ? []
      : await prisma.partnerService.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, partner: { select: { id: true, companyName: true } } },
        })
  const partnerByService = new Map(
    services.map((s) => [s.id, { partnerId: s.partner.id, companyName: s.partner.companyName }]),
  )

  // Resolve signed thumbnail URLs in parallel. A bad/missing key shouldn't blow
  // up the whole page — fall back to null and let the cell render a placeholder.
  const imageUrls = await Promise.all(
    rawRows.map((r) =>
      getSignedReadUrl(r.imageFileKey, { expiresInSeconds: 1800 }).catch(() => null),
    ),
  )

  const rows: AccessoryRow[] = rawRows.map((r, i) => {
    const partner = partnerByService.get(r.partnerServiceId)
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      status: r.status,
      moq: r.moq,
      leadTimeDays: r.leadTimeDays,
      firstUnitPrice: firstTierPrice(r.pricingTiers),
      imageUrl: imageUrls[i] ?? null,
      partnerId: partner?.partnerId ?? null,
      partnerName: partner?.companyName ?? 'Unknown',
      createdAt: r.createdAt,
    }
  })

  // Status + category chip counts from the groupBy results.
  const statusCounts: Record<AccessoryStatusBucket, number> = {
    PENDING_REVIEW: 0,
    ACTIVE: 0,
    ARCHIVED: 0,
  }
  for (const c of statusGroupCounts) {
    if ((ACCESSORY_STATUS_ORDER as readonly string[]).includes(c.status)) {
      statusCounts[c.status as AccessoryStatusBucket] = c._count._all
    }
  }

  const categoryCounts: Record<AccessoryCategory, number> = {
    SPOON: 0,
    RIBBON: 0,
    TAG: 0,
    INSERT: 0,
    CAP_COVER: 0,
    TISSUE: 0,
    WAX_SEAL: 0,
    STICKER_PACK: 0,
    OTHER: 0,
  }
  for (const c of categoryGroupCounts) {
    categoryCounts[c.category] = c._count._all
  }

  const totalPages = Math.max(1, Math.ceil(totalFiltered / ACCESSORIES_PAGE_SIZE))

  return {
    filters,
    kpis: {
      total,
      pendingReview: statusCounts.PENDING_REVIEW,
      active: statusCounts.ACTIVE,
      archived: statusCounts.ARCHIVED,
      distinctPartners: distinctServiceIdRows.length,
    },
    statusCounts,
    categoryCounts,
    rows,
    totalFiltered,
    totalPages,
  }
}

// -----------------------------------------------------------------------------
// URL helper — shared with page chrome
// -----------------------------------------------------------------------------

export function buildAccessoriesHref(
  current: ParsedFilters,
  overrides: Partial<{
    status: string
    category: string
    q: string
    sort: AccessoriesSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const status = overrides.status !== undefined ? overrides.status : current.status ?? ''
  const category =
    overrides.category !== undefined ? overrides.category : current.category ?? ''
  const q = overrides.q !== undefined ? overrides.q : current.q
  const sort = overrides.sort !== undefined ? overrides.sort : current.sort
  const dir = overrides.dir !== undefined ? overrides.dir : current.dir
  const page = overrides.page !== undefined ? overrides.page : current.page

  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (category) params.set('category', category)
  if (q) params.set('q', q)
  if (sort !== 'createdAt') params.set('sort', sort)
  if (dir !== 'desc') params.set('dir', dir)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/accessories?${qs}` : '/accessories'
}
