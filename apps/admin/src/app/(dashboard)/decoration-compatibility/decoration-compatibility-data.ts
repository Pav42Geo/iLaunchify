// =============================================================================
// /admin/decoration-compatibility — data loader (Track C / C8)
// =============================================================================
//
// The admin-curated matrix of which DecorationMethods are valid on which
// ContainerCategory. Backs the PackagingDecorationCompatibility table (composite
// PK: [containerCategory, decorationMethod]). Mirrors the /admin/accessories
// surface — cream hero + 5-card KPI strip + URL-driven chip filters + sortable
// table + RowActionsMenu + Prev/Next paginator. See memory:
// ilaunchify-admin-surface-pattern.md
//
// KPI counts are independent of the active filter so the cards always reflect
// the full matrix. Only the table rows obey the category / method / status
// filter.

import { prisma } from '@ilaunchify/db'
import type { ContainerCategory, DecorationMethod } from '@ilaunchify/db'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const COMPAT_PAGE_SIZE = 50

export const CONTAINER_CATEGORY_ORDER: ContainerCategory[] = [
  'BOTTLE',
  'JAR',
  'CAN',
  'TUBE',
  'POUCH',
  'SACHET',
  'STICK_PACK',
  'BOX',
  'CARTON',
  'CASE',
  'OTHER',
]

export const CONTAINER_CATEGORY_LABEL: Record<ContainerCategory, string> = {
  BOTTLE: 'Bottle',
  JAR: 'Jar',
  CAN: 'Can',
  TUBE: 'Tube',
  POUCH: 'Pouch',
  SACHET: 'Sachet',
  STICK_PACK: 'Stick pack',
  BOX: 'Box',
  CARTON: 'Carton',
  CASE: 'Case',
  BAG: 'Bag',
  TUB: 'Tub',
  CUP: 'Cup',
  TIN: 'Tin',
  DRUM: 'Drum',
  JUG: 'Jug',
  TANK: 'Tank',
  PAIL: 'Pail',
  BOWL: 'Bowl',
  POD: 'Pod',
  BASKET: 'Basket',
  CANISTER: 'Canister',
  PACKET: 'Packet',
  ENVELOPE: 'Envelope',
  STICK: 'Stick',
  WRAP: 'Wrap',
  TRAY: 'Tray',
  SLEEVE: 'Sleeve',
  ROLLSTOCK: 'Rollstock',
  PEGGED: 'Pegged',
  OTHER: 'Other',
}

export const DECORATION_METHOD_ORDER: DecorationMethod[] = [
  'DIRECT_PRINT',
  'PRESSURE_SENSITIVE_LABEL',
  'SHRINK_SLEEVE',
  'IN_MOLD_LABEL',
  'HEAT_TRANSFER',
  'FOIL_STAMP',
  'EMBOSS',
  'DEBOSS',
  'SPOT_UV',
  'NONE',
]

export const DECORATION_METHOD_LABEL: Record<DecorationMethod, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
  NONE: 'None',
}

// Method "kind" — derived from the enum membership per the C8 spec.
export type DecorationKind = 'PRIMARY' | 'ACCENT' | 'NONE'

const PRIMARY_METHODS: ReadonlySet<DecorationMethod> = new Set<DecorationMethod>([
  'DIRECT_PRINT',
  'PRESSURE_SENSITIVE_LABEL',
  'SHRINK_SLEEVE',
  'IN_MOLD_LABEL',
  'HEAT_TRANSFER',
])

const ACCENT_METHODS: ReadonlySet<DecorationMethod> = new Set<DecorationMethod>([
  'FOIL_STAMP',
  'EMBOSS',
  'DEBOSS',
  'SPOT_UV',
])

export function decorationKind(method: DecorationMethod): DecorationKind {
  if (PRIMARY_METHODS.has(method)) return 'PRIMARY'
  if (ACCENT_METHODS.has(method)) return 'ACCENT'
  return 'NONE'
}

export type StatusBucket = 'ACTIVE' | 'INACTIVE'

export const STATUS_ORDER: StatusBucket[] = ['ACTIVE', 'INACTIVE']

export const STATUS_LABEL: Record<StatusBucket, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

export type CompatSortKey = 'category' | 'method' | 'kind' | 'status' | 'updatedAt'
export type SortDir = 'asc' | 'desc'

// -----------------------------------------------------------------------------
// Filters
// -----------------------------------------------------------------------------

export interface CompatSearchParams {
  category?: string
  method?: string
  status?: string
  sort?: string
  dir?: string
  page?: string
}

export interface ParsedFilters {
  category: ContainerCategory | null
  method: DecorationMethod | null
  status: StatusBucket | null
  sort: CompatSortKey
  dir: SortDir
  page: number
}

function isValidCategory(s: string | undefined): s is ContainerCategory {
  return !!s && (CONTAINER_CATEGORY_ORDER as readonly string[]).includes(s)
}

function isValidMethod(s: string | undefined): s is DecorationMethod {
  return !!s && (DECORATION_METHOD_ORDER as readonly string[]).includes(s)
}

function isValidStatus(s: string | undefined): s is StatusBucket {
  return s === 'ACTIVE' || s === 'INACTIVE'
}

function isValidSort(s: string | undefined): s is CompatSortKey {
  return (
    s === 'category' ||
    s === 'method' ||
    s === 'kind' ||
    s === 'status' ||
    s === 'updatedAt'
  )
}

export function parseFilters(sp: CompatSearchParams): ParsedFilters {
  return {
    category: isValidCategory(sp.category) ? sp.category : null,
    method: isValidMethod(sp.method) ? sp.method : null,
    status: isValidStatus(sp.status) ? sp.status : null,
    sort: isValidSort(sp.sort) ? sp.sort : 'category',
    dir: sp.dir === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, parseInt(sp.page ?? '1', 10) || 1),
  }
}

// -----------------------------------------------------------------------------
// Row + result shapes
// -----------------------------------------------------------------------------

export interface CompatRow {
  /** Synthetic stable key — composite PK joined. */
  id: string
  containerCategory: ContainerCategory
  decorationMethod: DecorationMethod
  kind: DecorationKind
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CompatKpis {
  total: number
  active: number
  primaryCombos: number
  accentCombos: number
  categoriesCovered: number
}

export interface LoadedCompatData {
  filters: ParsedFilters
  kpis: CompatKpis
  categoryCounts: Record<ContainerCategory, number>
  methodCounts: Record<DecorationMethod, number>
  statusCounts: Record<StatusBucket, number>
  rows: CompatRow[]
  totalFiltered: number
  totalPages: number
}

export function rowKey(
  containerCategory: ContainerCategory,
  decorationMethod: DecorationMethod,
): string {
  return `${containerCategory}:${decorationMethod}`
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

export async function loadCompatData(sp: CompatSearchParams): Promise<LoadedCompatData> {
  const filters = parseFilters(sp)

  // Table where-clause (KPIs intentionally ignore it).
  const where: Record<string, unknown> = {}
  if (filters.category) where.containerCategory = filters.category
  if (filters.method) where.decorationMethod = filters.method
  if (filters.status) where.isActive = filters.status === 'ACTIVE'

  // `kind` isn't a DB column — we sort it in-app below. For DB sorts, map the
  // sort key to a column.
  const dir = filters.dir
  const orderBy =
    filters.sort === 'method'
      ? { decorationMethod: dir }
      : filters.sort === 'status'
        ? { isActive: dir }
        : filters.sort === 'updatedAt'
          ? { updatedAt: dir }
          : { containerCategory: dir }

  const dbSorted = filters.sort !== 'kind'

  const [
    total,
    activeCount,
    categoryGroupCounts,
    methodGroupCounts,
    statusGroupCounts,
    distinctCategoryRows,
    totalFiltered,
    rawRows,
  ] = await Promise.all([
    prisma.packagingDecorationCompatibility.count(),
    prisma.packagingDecorationCompatibility.count({ where: { isActive: true } }),
    prisma.packagingDecorationCompatibility.groupBy({
      by: ['containerCategory'],
      _count: { _all: true },
    }),
    prisma.packagingDecorationCompatibility.groupBy({
      by: ['decorationMethod'],
      _count: { _all: true },
    }),
    prisma.packagingDecorationCompatibility.groupBy({
      by: ['isActive'],
      _count: { _all: true },
    }),
    prisma.packagingDecorationCompatibility.findMany({
      select: { containerCategory: true },
      distinct: ['containerCategory'],
    }),
    prisma.packagingDecorationCompatibility.count({ where: where as never }),
    prisma.packagingDecorationCompatibility.findMany({
      where: where as never,
      orderBy: dbSorted ? orderBy : { containerCategory: 'asc' },
      // When sorting by the derived `kind`, fetch the whole filtered set then
      // sort + slice in-app. Dataset is ~57-110 rows so this is cheap.
      ...(dbSorted
        ? {
            skip: (filters.page - 1) * COMPAT_PAGE_SIZE,
            take: COMPAT_PAGE_SIZE,
          }
        : {}),
    }),
  ])

  let mapped: CompatRow[] = rawRows.map((r) => ({
    id: rowKey(r.containerCategory, r.decorationMethod),
    containerCategory: r.containerCategory,
    decorationMethod: r.decorationMethod,
    kind: decorationKind(r.decorationMethod),
    notes: r.notes,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))

  if (!dbSorted) {
    const kindRank: Record<DecorationKind, number> = { PRIMARY: 0, ACCENT: 1, NONE: 2 }
    mapped.sort((a, b) => {
      const cmp = kindRank[a.kind] - kindRank[b.kind]
      return dir === 'asc' ? cmp : -cmp
    })
    mapped = mapped.slice(
      (filters.page - 1) * COMPAT_PAGE_SIZE,
      filters.page * COMPAT_PAGE_SIZE,
    )
  }

  // Chip counts from the groupBy results (independent of active filter).
  const categoryCounts = Object.fromEntries(
    CONTAINER_CATEGORY_ORDER.map((c) => [c, 0]),
  ) as Record<ContainerCategory, number>
  for (const c of categoryGroupCounts) categoryCounts[c.containerCategory] = c._count._all

  const methodCounts = Object.fromEntries(
    DECORATION_METHOD_ORDER.map((m) => [m, 0]),
  ) as Record<DecorationMethod, number>
  for (const m of methodGroupCounts) methodCounts[m.decorationMethod] = m._count._all

  const statusCounts: Record<StatusBucket, number> = { ACTIVE: 0, INACTIVE: 0 }
  for (const s of statusGroupCounts) {
    statusCounts[s.isActive ? 'ACTIVE' : 'INACTIVE'] = s._count._all
  }

  // Primary / accent combo counts derive from the per-method counts.
  let primaryCombos = 0
  let accentCombos = 0
  for (const m of DECORATION_METHOD_ORDER) {
    const k = decorationKind(m)
    if (k === 'PRIMARY') primaryCombos += methodCounts[m]
    else if (k === 'ACCENT') accentCombos += methodCounts[m]
  }

  const totalPages = Math.max(1, Math.ceil(totalFiltered / COMPAT_PAGE_SIZE))

  return {
    filters,
    kpis: {
      total,
      active: activeCount,
      primaryCombos,
      accentCombos,
      categoriesCovered: distinctCategoryRows.length,
    },
    categoryCounts,
    methodCounts,
    statusCounts,
    rows: mapped,
    totalFiltered,
    totalPages,
  }
}

// -----------------------------------------------------------------------------
// URL helper — shared with page chrome (preserves all active filters)
// -----------------------------------------------------------------------------

export function buildCompatHref(
  current: ParsedFilters,
  overrides: Partial<{
    category: string
    method: string
    status: string
    sort: CompatSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const category =
    overrides.category !== undefined ? overrides.category : current.category ?? ''
  const method = overrides.method !== undefined ? overrides.method : current.method ?? ''
  const status = overrides.status !== undefined ? overrides.status : current.status ?? ''
  const sort = overrides.sort !== undefined ? overrides.sort : current.sort
  const dir = overrides.dir !== undefined ? overrides.dir : current.dir
  const page = overrides.page !== undefined ? overrides.page : current.page

  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (method) params.set('method', method)
  if (status) params.set('status', status)
  if (sort !== 'category') params.set('sort', sort)
  if (dir !== 'asc') params.set('dir', dir)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/decoration-compatibility?${qs}` : '/decoration-compatibility'
}
