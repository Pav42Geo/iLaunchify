// Data layer for /logistics/fulfillment-centers (Phase L1c).
// FC nodes are PartnerService rows of type WAREHOUSE (docs/LOGISTICS_AND_FULFILLMENT.md
// §3.2 — V1 FCs are admin-onboarded WAREHOUSE partners; no new machinery).
// The network is small (2–5 nodes in V1), so filter/sort/paginate in memory
// after one query — revisit if the network outgrows a single page fetch.

import { prisma } from '@ilaunchify/db'
import type { ServiceStatus } from '@ilaunchify/db'

export const FC_PAGE_SIZE = 50

export const FC_STATUS_ORDER: ServiceStatus[] = ['ACTIVE', 'DRAFT', 'PAUSED']

export const FC_STATUS_LABEL: Record<ServiceStatus, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  PAUSED: 'Paused',
}

/** StorageClass enum values (schema comment on PartnerService.storageClasses). */
export const STORAGE_CLASS_ORDER = ['AMBIENT', 'PROTECT_HEAT', 'CHILLED', 'FROZEN'] as const
export type StorageClassKey = (typeof STORAGE_CLASS_ORDER)[number]

export const STORAGE_CLASS_LABEL: Record<StorageClassKey, string> = {
  AMBIENT: 'Ambient',
  PROTECT_HEAT: 'Protect heat',
  CHILLED: 'Chilled',
  FROZEN: 'Frozen',
}

export type FcSortKey = 'partner' | 'location' | 'capacity' | 'status' | 'createdAt'
export type SortDir = 'asc' | 'desc'

export interface ParsedFcFilters {
  q: string
  status: ServiceStatus | ''
  class: StorageClassKey | ''
  sort: FcSortKey
  dir: SortDir
  page: number
}

export interface FcRow {
  serviceId: string
  partnerId: string
  companyName: string
  city: string | null
  region: string | null
  storageClasses: string[]
  certifications: string[]
  weeklyPalletCapacity: number | null
  hasCoords: boolean
  status: ServiceStatus
  createdAt: Date
}

export interface FcPageData {
  filters: ParsedFcFilters
  rows: FcRow[]
  totalFiltered: number
  totalPages: number
  kpis: {
    total: number
    activeCount: number
    ambientCount: number
    heatProtectCount: number
    coldCount: number
    statesCovered: number
  }
  statusCounts: Record<ServiceStatus, number>
  classCounts: Record<StorageClassKey, number>
}

const SORT_KEYS: FcSortKey[] = ['partner', 'location', 'capacity', 'status', 'createdAt']

export function parseFcFilters(sp: {
  q?: string
  status?: string
  class?: string
  sort?: string
  dir?: string
  page?: string
}): ParsedFcFilters {
  const status = FC_STATUS_ORDER.includes(sp.status as ServiceStatus)
    ? (sp.status as ServiceStatus)
    : ''
  const cls = (STORAGE_CLASS_ORDER as readonly string[]).includes(sp.class ?? '')
    ? (sp.class as StorageClassKey)
    : ''
  const sort = SORT_KEYS.includes(sp.sort as FcSortKey) ? (sp.sort as FcSortKey) : 'createdAt'
  const dir: SortDir = sp.dir === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  return { q: (sp.q ?? '').trim(), status, class: cls, sort, dir, page }
}

/** URL builder — merges overrides into the current filters, dropping defaults. */
export function buildFcHref(
  filters: ParsedFcFilters,
  overrides: Partial<{ q: string; status: string; class: string; sort: FcSortKey; dir: SortDir; page: number }>,
): string {
  const next = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.status) params.set('status', next.status)
  if (next.class) params.set('class', next.class)
  if (next.sort !== 'createdAt') params.set('sort', next.sort)
  if (next.dir !== 'desc') params.set('dir', next.dir)
  if (next.page > 1) params.set('page', String(next.page))
  const qs = params.toString()
  return qs ? `/logistics/fulfillment-centers?${qs}` : '/logistics/fulfillment-centers'
}

export async function loadFcData(sp: {
  q?: string
  status?: string
  class?: string
  sort?: string
  dir?: string
  page?: string
}): Promise<FcPageData> {
  const filters = parseFcFilters(sp)

  const services = await prisma.partnerService.findMany({
    where: { type: 'WAREHOUSE' },
    select: {
      id: true,
      status: true,
      storageClasses: true,
      fcCertifications: true,
      weeklyPalletCapacity: true,
      facilityLat: true,
      facilityLng: true,
      createdAt: true,
      partner: {
        select: {
          id: true,
          companyName: true,
          facilities: {
            select: { city: true, region: true },
            orderBy: { isDefault: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  const all: FcRow[] = services.map((s) => {
    const facility = s.partner.facilities[0]
    return {
      serviceId: s.id,
      partnerId: s.partner.id,
      companyName: s.partner.companyName,
      city: facility?.city ?? null,
      region: facility?.region ?? null,
      storageClasses: s.storageClasses,
      certifications: s.fcCertifications,
      weeklyPalletCapacity: s.weeklyPalletCapacity,
      hasCoords: s.facilityLat !== null && s.facilityLng !== null,
      status: s.status,
      createdAt: s.createdAt,
    }
  })

  // ---- KPIs + chip counts over the FULL set (not the filtered slice) ----
  const statusCounts: Record<ServiceStatus, number> = { ACTIVE: 0, DRAFT: 0, PAUSED: 0 }
  const classCounts: Record<StorageClassKey, number> = {
    AMBIENT: 0,
    PROTECT_HEAT: 0,
    CHILLED: 0,
    FROZEN: 0,
  }
  const states = new Set<string>()
  for (const row of all) {
    statusCounts[row.status] += 1
    for (const c of STORAGE_CLASS_ORDER) {
      if (row.storageClasses.includes(c)) classCounts[c] += 1
    }
    if (row.region) states.add(row.region.toUpperCase())
  }
  const kpis = {
    total: all.length,
    activeCount: statusCounts.ACTIVE,
    ambientCount: classCounts.AMBIENT,
    heatProtectCount: classCounts.PROTECT_HEAT,
    coldCount: all.filter(
      (r) => r.storageClasses.includes('CHILLED') || r.storageClasses.includes('FROZEN'),
    ).length,
    statesCovered: states.size,
  }

  // ---- Filter ----
  let rows = all
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.companyName.toLowerCase().includes(q) ||
        (r.city ?? '').toLowerCase().includes(q) ||
        (r.region ?? '').toLowerCase().includes(q),
    )
  }
  if (filters.status) rows = rows.filter((r) => r.status === filters.status)
  if (filters.class) rows = rows.filter((r) => r.storageClasses.includes(filters.class))

  // ---- Sort ----
  const dirMul = filters.dir === 'asc' ? 1 : -1
  const statusRank: Record<ServiceStatus, number> = { ACTIVE: 0, DRAFT: 1, PAUSED: 2 }
  rows = [...rows].sort((a, b) => {
    switch (filters.sort) {
      case 'partner':
        return dirMul * a.companyName.localeCompare(b.companyName)
      case 'location':
        return dirMul * `${a.region ?? ''}${a.city ?? ''}`.localeCompare(`${b.region ?? ''}${b.city ?? ''}`)
      case 'capacity':
        return dirMul * ((a.weeklyPalletCapacity ?? -1) - (b.weeklyPalletCapacity ?? -1))
      case 'status':
        return dirMul * (statusRank[a.status] - statusRank[b.status])
      case 'createdAt':
      default:
        return dirMul * (a.createdAt.getTime() - b.createdAt.getTime())
    }
  })

  // ---- Paginate (50/page) ----
  const totalFiltered = rows.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / FC_PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const paged = rows.slice((page - 1) * FC_PAGE_SIZE, page * FC_PAGE_SIZE)

  return {
    filters: { ...filters, page },
    rows: paged,
    totalFiltered,
    totalPages,
    kpis,
    statusCounts,
    classCounts,
  }
}
