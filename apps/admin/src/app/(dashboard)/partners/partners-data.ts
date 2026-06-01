// =============================================================================
// /admin/partners — data loader (task #573)
// =============================================================================
//
// Lifted out of page.tsx so the route file stays focused on layout/chrome.
// Exposes a single `loadPartnersData(sp)` that takes the resolved search-param
// shape and returns everything the v2 surface needs: KPI counts, filter
// chip counts, the paginated row set, and the per-row lastOrderAt map.
//
// All KPI counts are independent of the user's current filter so the cards
// always reflect the full picture. Only the table rows obey the filter.

import { prisma } from '@ilaunchify/db'
import type { PartnerStatus, ServiceType } from '@ilaunchify/db'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export const PARTNERS_PAGE_SIZE = 50

// The spec frames status as a simplified 4-bucket model (PENDING / ACTIVE /
// SUSPENDED / REJECTED) even though the schema enum has 14 values. We use
// these buckets only for KPIs and filter chips; the table still shows the
// real status pill so admins see the precise FSM state.
export type PartnerStatusBucket = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'

const BUCKET_TO_STATUSES: Record<PartnerStatusBucket, PartnerStatus[]> = {
  PENDING: [
    'LEAD',
    'INVITED',
    'IN_PROGRESS',
    'DRAFT',
    'UNDER_REVIEW',
    'IDENTITY_PENDING_REVIEW',
    'IDENTITY_VERIFIED',
    'OPS_PENDING_REVIEW',
    'OPERATIONALLY_CONFIGURED',
  ],
  ACTIVE: ['ACTIVE', 'INTEGRATION_ENHANCED'],
  SUSPENDED: ['SUSPENDED', 'PAUSED'],
  REJECTED: ['TERMINATED'],
}

const BUCKET_ORDER: PartnerStatusBucket[] = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']

export const PARTNER_STATUS_BUCKET_LABEL: Record<PartnerStatusBucket, string> = {
  PENDING: 'Pending verification',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REJECTED: 'Rejected',
}

// Service-kind chips. Schema has 4 ServiceType values; the task spec mentions
// "Packaging" as a 5th kind but no such enum exists yet (packaging is modeled
// via PackagingSystem on Partner directly). We surface the 4 real kinds plus
// a synthetic "PACKAGING" pseudo-kind that filters Partners with ≥1
// PackagingSystem row.
export type PartnerKind = ServiceType | 'PACKAGING'

export const PARTNER_KIND_ORDER: PartnerKind[] = [
  'MANUFACTURING',
  'LABEL_PRINTING',
  'COPACKING',
  'WAREHOUSE',
  'PACKAGING',
]

export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  MANUFACTURING: 'Manufacturer',
  LABEL_PRINTING: 'Printer',
  COPACKING: 'Co-packer',
  WAREHOUSE: 'Warehouse',
  PACKAGING: 'Packaging',
}

export type PartnersSortKey = 'createdAt' | 'legalName' | 'status' | 'lastOrderAt'
export type SortDir = 'asc' | 'desc'

export interface PartnersSearchParams {
  q?: string
  status?: string
  kind?: string
  sort?: string
  dir?: string
  page?: string
}

export interface ParsedFilters {
  q: string
  status: PartnerStatusBucket | null
  kind: PartnerKind | null
  sort: PartnersSortKey
  dir: SortDir
  page: number
}

export function isValidStatusBucket(s: string | undefined): s is PartnerStatusBucket {
  return !!s && (BUCKET_ORDER as readonly string[]).includes(s)
}

export function isValidKind(s: string | undefined): s is PartnerKind {
  return !!s && (PARTNER_KIND_ORDER as readonly string[]).includes(s)
}

export function isValidSort(s: string | undefined): s is PartnersSortKey {
  return s === 'createdAt' || s === 'legalName' || s === 'status' || s === 'lastOrderAt'
}

export function parseFilters(sp: PartnersSearchParams): ParsedFilters {
  return {
    q: sp.q?.trim() || '',
    status: isValidStatusBucket(sp.status) ? sp.status : null,
    kind: isValidKind(sp.kind) ? sp.kind : null,
    sort: isValidSort(sp.sort) ? sp.sort : 'createdAt',
    dir: sp.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  }
}

// -----------------------------------------------------------------------------
// Row shape
// -----------------------------------------------------------------------------

export interface PartnerRow {
  id: string
  companyName: string
  legalName: string
  contactEmail: string | null
  status: PartnerStatus
  websiteUrl: string | null
  createdAt: Date
  serviceTypes: ServiceType[]
  servicesCount: number
  hasPackaging: boolean
  lastOrderAt: Date | null
}

export interface LoadedPartnersData {
  filters: ParsedFilters
  kpis: {
    total: number
    activeCount: number
    pendingVerification: number
    newThisMonth: number
    atRisk: number
  }
  bucketCounts: Record<PartnerStatusBucket, number>
  kindCounts: Record<PartnerKind, number>
  rows: PartnerRow[]
  totalFiltered: number
  totalPages: number
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

export async function loadPartnersData(
  sp: PartnersSearchParams,
): Promise<LoadedPartnersData> {
  const filters = parseFilters(sp)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000)

  // Where clause for the table rows (KPIs intentionally ignore it)
  const where: Record<string, unknown> = {}
  if (filters.q) {
    where.OR = [
      { companyName: { contains: filters.q, mode: 'insensitive' } },
      { legalName: { contains: filters.q, mode: 'insensitive' } },
      { user: { email: { contains: filters.q, mode: 'insensitive' } } },
    ]
  }
  if (filters.status) {
    where.status = { in: BUCKET_TO_STATUSES[filters.status] }
  }
  if (filters.kind) {
    if (filters.kind === 'PACKAGING') {
      where.packagingSystems = { some: {} }
    } else {
      where.services = { some: { type: filters.kind } }
    }
  }

  // Decide Prisma orderBy based on sort key. lastOrderAt is computed in JS
  // (cross-table aggregate), so we still fetch with a sensible primary order
  // and re-sort the page in memory if sort='lastOrderAt'.
  const dir: 'asc' | 'desc' = filters.dir
  const orderBy =
    filters.sort === 'legalName'
      ? { legalName: dir }
      : filters.sort === 'status'
        ? { status: dir }
        : filters.sort === 'lastOrderAt'
          ? { updatedAt: dir } // primary fallback; re-sorted below
          : { createdAt: dir }

  const [
    total,
    bucketGroupCounts,
    kindGroupCounts,
    packagingPartnersCount,
    newThisMonth,
    totalFiltered,
    rawRows,
  ] = await Promise.all([
    prisma.partner.count(),
    prisma.partner.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.partnerService.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.partner.count({ where: { packagingSystems: { some: {} } } }),
    prisma.partner.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.partner.count({ where: where as never }),
    prisma.partner.findMany({
      where: where as never,
      include: {
        user: { select: { email: true } },
        services: { select: { type: true } },
        _count: { select: { services: true, packagingSystems: true } },
      },
      orderBy,
      skip: (filters.page - 1) * PARTNERS_PAGE_SIZE,
      take: PARTNERS_PAGE_SIZE,
    }),
  ])

  // Per-row last order: max(Order.createdAt) where the partner appears as a
  // routed manufacturer/printer/warehouse. We collect candidate userIds /
  // service ids and run one aggregate. Skipping the round-trip on empty page.
  const lastOrderByPartner = new Map<string, Date>()
  if (rawRows.length > 0) {
    const serviceIds: string[] = []
    const serviceToPartner = new Map<string, string>()
    for (const r of rawRows) {
      // services are minimally selected — fetch IDs separately to keep the
      // include shape light. Done in one extra query below.
      void r
    }
    // Pull all PartnerService rows for this page in one shot so we can map
    // every service back to its partner.
    const partnerIds = rawRows.map((r) => r.id)
    const services = await prisma.partnerService.findMany({
      where: { partnerId: { in: partnerIds } },
      select: { id: true, partnerId: true },
    })
    for (const s of services) {
      serviceIds.push(s.id)
      serviceToPartner.set(s.id, s.partnerId)
    }

    if (serviceIds.length > 0) {
      // manufacturer/printer dispatches
      const dispatchAgg = await prisma.orderDispatch.groupBy({
        by: ['partnerServiceId'],
        where: { partnerServiceId: { in: serviceIds } },
        _max: { createdAt: true },
      })
      for (const d of dispatchAgg) {
        const partnerId = serviceToPartner.get(d.partnerServiceId)
        if (partnerId && d._max.createdAt) {
          const prev = lastOrderByPartner.get(partnerId)
          if (!prev || d._max.createdAt > prev) {
            lastOrderByPartner.set(partnerId, d._max.createdAt)
          }
        }
      }
      // warehouse ship-to orders
      const warehouseAgg = await prisma.order.groupBy({
        by: ['shipToPartnerServiceId'],
        where: { shipToPartnerServiceId: { in: serviceIds } },
        _max: { createdAt: true },
      })
      for (const w of warehouseAgg) {
        if (!w.shipToPartnerServiceId) continue
        const partnerId = serviceToPartner.get(w.shipToPartnerServiceId)
        if (partnerId && w._max.createdAt) {
          const prev = lastOrderByPartner.get(partnerId)
          if (!prev || w._max.createdAt > prev) {
            lastOrderByPartner.set(partnerId, w._max.createdAt)
          }
        }
      }
    }
  }

  // Shape rows
  let rows: PartnerRow[] = rawRows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    legalName: r.legalName,
    contactEmail: r.user?.email ?? null,
    status: r.status,
    websiteUrl: r.websiteUrl,
    createdAt: r.createdAt,
    serviceTypes: r.services.map((s) => s.type),
    servicesCount: r._count.services,
    hasPackaging: (r._count.packagingSystems ?? 0) > 0,
    lastOrderAt: lastOrderByPartner.get(r.id) ?? null,
  }))

  // In-memory sort if user picked lastOrderAt (Prisma can't orderBy across
  // a derived aggregate)
  if (filters.sort === 'lastOrderAt') {
    rows = [...rows].sort((a, b) => {
      const av = a.lastOrderAt?.getTime() ?? 0
      const bv = b.lastOrderAt?.getTime() ?? 0
      return dir === 'asc' ? av - bv : bv - av
    })
  }

  // KPI: active set + at-risk (active AND lastOrder < 60 days ago / null)
  const bucketCounts: Record<PartnerStatusBucket, number> = {
    PENDING: 0,
    ACTIVE: 0,
    SUSPENDED: 0,
    REJECTED: 0,
  }
  for (const c of bucketGroupCounts) {
    for (const bucket of BUCKET_ORDER) {
      if ((BUCKET_TO_STATUSES[bucket] as PartnerStatus[]).includes(c.status)) {
        bucketCounts[bucket] += c._count._all
        break
      }
    }
  }

  // Compute at-risk: ACTIVE partners whose latest order is null or older than
  // 60 days. Cheaper to do this as one ACTIVE-scoped query.
  const activePartnerIds = await prisma.partner.findMany({
    where: { status: { in: BUCKET_TO_STATUSES.ACTIVE as never } },
    select: { id: true, services: { select: { id: true } } },
  })
  const activeServiceIdToPartner = new Map<string, string>()
  for (const p of activePartnerIds) {
    for (const s of p.services) activeServiceIdToPartner.set(s.id, p.id)
  }
  const activeLastOrder = new Map<string, Date>()
  if (activeServiceIdToPartner.size > 0) {
    const ids = Array.from(activeServiceIdToPartner.keys())
    const [da, wa] = await Promise.all([
      prisma.orderDispatch.groupBy({
        by: ['partnerServiceId'],
        where: { partnerServiceId: { in: ids } },
        _max: { createdAt: true },
      }),
      prisma.order.groupBy({
        by: ['shipToPartnerServiceId'],
        where: { shipToPartnerServiceId: { in: ids } },
        _max: { createdAt: true },
      }),
    ])
    for (const d of da) {
      const pid = activeServiceIdToPartner.get(d.partnerServiceId)
      if (pid && d._max.createdAt) {
        const prev = activeLastOrder.get(pid)
        if (!prev || d._max.createdAt > prev) activeLastOrder.set(pid, d._max.createdAt)
      }
    }
    for (const w of wa) {
      if (!w.shipToPartnerServiceId) continue
      const pid = activeServiceIdToPartner.get(w.shipToPartnerServiceId)
      if (pid && w._max.createdAt) {
        const prev = activeLastOrder.get(pid)
        if (!prev || w._max.createdAt > prev) activeLastOrder.set(pid, w._max.createdAt)
      }
    }
  }
  let atRisk = 0
  for (const p of activePartnerIds) {
    const last = activeLastOrder.get(p.id)
    if (!last || last < sixtyDaysAgo) atRisk += 1
  }

  // kind counts: 4 from PartnerService groupBy + 1 synthetic for PACKAGING
  const kindCounts: Record<PartnerKind, number> = {
    MANUFACTURING: 0,
    LABEL_PRINTING: 0,
    COPACKING: 0,
    WAREHOUSE: 0,
    PACKAGING: packagingPartnersCount,
  }
  for (const c of kindGroupCounts) {
    kindCounts[c.type as ServiceType] = c._count._all
  }

  const totalPages = Math.max(1, Math.ceil(totalFiltered / PARTNERS_PAGE_SIZE))

  return {
    filters,
    kpis: {
      total,
      activeCount: bucketCounts.ACTIVE,
      pendingVerification: bucketCounts.PENDING,
      newThisMonth,
      atRisk,
    },
    bucketCounts,
    kindCounts,
    rows,
    totalFiltered,
    totalPages,
  }
}

// -----------------------------------------------------------------------------
// URL helper — shared with page chrome
// -----------------------------------------------------------------------------

export function buildPartnersHref(
  current: ParsedFilters,
  overrides: Partial<{
    q: string
    status: string
    kind: string
    sort: PartnersSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const q = overrides.q !== undefined ? overrides.q : current.q
  const status = overrides.status !== undefined ? overrides.status : current.status ?? ''
  const kind = overrides.kind !== undefined ? overrides.kind : current.kind ?? ''
  const sort = overrides.sort !== undefined ? overrides.sort : current.sort
  const dir = overrides.dir !== undefined ? overrides.dir : current.dir
  const page = overrides.page !== undefined ? overrides.page : current.page

  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  if (kind) params.set('kind', kind)
  if (sort !== 'createdAt') params.set('sort', sort)
  if (dir !== 'desc') params.set('dir', dir)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/partners?${qs}` : '/partners'
}

// Map a real PartnerStatus to its presentation bucket (used by the table
// pill so legacy statuses map cleanly to the simplified palette).
export function statusBucketFor(status: PartnerStatus): PartnerStatusBucket {
  for (const bucket of BUCKET_ORDER) {
    if ((BUCKET_TO_STATUSES[bucket] as PartnerStatus[]).includes(status)) {
      return bucket
    }
  }
  return 'PENDING'
}
