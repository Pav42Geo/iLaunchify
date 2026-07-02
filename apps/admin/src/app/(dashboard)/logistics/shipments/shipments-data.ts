// Data layer for /logistics/shipments (Phase L1.1c — docs/LOGISTICS_AND_
// FULFILLMENT.md §9 admin surfaces). Rows are OrderDispatch rows with shipping
// relevance: status in READY/SHIPPED/IN_TRANSIT/DELIVERED, plus any dispatch
// that already has ShipmentLeg rows (platform-booked shipments can carry legs
// before the dispatch status advances). DB-level filter + skip/take pagination
// (dispatch volume grows with orders — no in-memory hydration of the full set).

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'

export const SHIPMENTS_PAGE_SIZE = 50

export const SHIPMENT_STATUS_ORDER = ['READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'] as const
export type ShipmentStatusKey = (typeof SHIPMENT_STATUS_ORDER)[number]

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatusKey, string> = {
  READY: 'Ready',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
}

export const SHIP_TO_ORDER = [
  'CREATOR_ADDRESS',
  'WAREHOUSE_PARTNER',
  'HOLD_AT_MANUFACTURER',
  'CHANNEL_INBOUND',
] as const
export type ShipToKey = (typeof SHIP_TO_ORDER)[number]

export const SHIP_TO_LABEL: Record<ShipToKey, string> = {
  CREATOR_ADDRESS: 'Creator address',
  WAREHOUSE_PARTNER: 'Fulfillment center',
  HOLD_AT_MANUFACTURER: 'Hold at manufacturer',
  CHANNEL_INBOUND: 'Channel inbound',
}

export const MODE_ORDER = ['PARCEL', 'LTL', 'FTL'] as const
export type ModeKey = (typeof MODE_ORDER)[number]

export const MODE_LABEL: Record<ModeKey, string> = {
  PARCEL: 'Parcel',
  LTL: 'LTL',
  FTL: 'FTL',
}

export type ShipmentsSortKey = 'shippedAt' | 'deliveredAt' | 'status' | 'createdAt'
export type SortDir = 'asc' | 'desc'

export interface ParsedShipmentFilters {
  q: string
  status: ShipmentStatusKey | ''
  shipTo: ShipToKey | ''
  mode: ModeKey | ''
  sort: ShipmentsSortKey
  dir: SortDir
  page: number
}

export interface ShipmentRow {
  dispatchId: string
  dispatchType: string
  status: string
  orderId: string
  orderRef: string
  fromPartnerId: string
  fromPartnerName: string
  shipToType: ShipToKey
  shipToCity: string | null
  shipToState: string | null
  storageClass: string | null
  legMode: ModeKey | null
  legStatus: string | null
  trackingCarrier: string | null
  trackingNumber: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
}

export interface ShipmentsPageData {
  filters: ParsedShipmentFilters
  rows: ShipmentRow[]
  totalFiltered: number
  totalPages: number
  kpis: {
    inTransitNow: number
    deliveredLast7d: number
    awaitingDocs: number
    exceptions: number
    holdActive: number
  }
  statusCounts: Record<ShipmentStatusKey, number>
  shipToCounts: Record<ShipToKey, number>
  modeCounts: Record<ModeKey, number>
}

const SORT_KEYS: ShipmentsSortKey[] = ['shippedAt', 'deliveredAt', 'status', 'createdAt']

export function parseShipmentFilters(sp: {
  q?: string
  status?: string
  shipTo?: string
  mode?: string
  sort?: string
  dir?: string
  page?: string
}): ParsedShipmentFilters {
  const status = (SHIPMENT_STATUS_ORDER as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as ShipmentStatusKey)
    : ''
  const shipTo = (SHIP_TO_ORDER as readonly string[]).includes(sp.shipTo ?? '')
    ? (sp.shipTo as ShipToKey)
    : ''
  const mode = (MODE_ORDER as readonly string[]).includes(sp.mode ?? '')
    ? (sp.mode as ModeKey)
    : ''
  const sort = SORT_KEYS.includes(sp.sort as ShipmentsSortKey)
    ? (sp.sort as ShipmentsSortKey)
    : 'shippedAt'
  const dir: SortDir = sp.dir === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)
  return { q: (sp.q ?? '').trim(), status, shipTo, mode, sort, dir, page }
}

/** URL builder — merges overrides into the current filters, dropping defaults. */
export function buildShipmentsHref(
  filters: ParsedShipmentFilters,
  overrides: Partial<{
    q: string
    status: string
    shipTo: string
    mode: string
    sort: ShipmentsSortKey
    dir: SortDir
    page: number
  }>,
): string {
  const next = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.status) params.set('status', next.status)
  if (next.shipTo) params.set('shipTo', next.shipTo)
  if (next.mode) params.set('mode', next.mode)
  if (next.sort !== 'shippedAt') params.set('sort', next.sort)
  if (next.dir !== 'desc') params.set('dir', next.dir)
  if (next.page > 1) params.set('page', String(next.page))
  const qs = params.toString()
  return qs ? `/logistics/shipments?${qs}` : '/logistics/shipments'
}

/** Shipping relevance: shipping-lifecycle status OR any ShipmentLeg attached. */
const RELEVANCE_WHERE: Prisma.OrderDispatchWhereInput = {
  OR: [
    { status: { in: [...SHIPMENT_STATUS_ORDER] } },
    { shipmentLegs: { some: {} } },
  ],
}

function buildWhere(filters: ParsedShipmentFilters): Prisma.OrderDispatchWhereInput {
  const and: Prisma.OrderDispatchWhereInput[] = [RELEVANCE_WHERE]
  if (filters.status) and.push({ status: filters.status })
  if (filters.shipTo) and.push({ order: { shipToType: filters.shipTo } })
  if (filters.mode) and.push({ shipmentLegs: { some: { mode: filters.mode } } })
  if (filters.q) {
    and.push({
      OR: [
        { order: { orderNumber: { contains: filters.q, mode: 'insensitive' } } },
        { partnerService: { partner: { companyName: { contains: filters.q, mode: 'insensitive' } } } },
        { trackingNumber: { contains: filters.q, mode: 'insensitive' } },
      ],
    })
  }
  return { AND: and }
}

function orderByFor(filters: ParsedShipmentFilters): Prisma.OrderDispatchOrderByWithRelationInput {
  switch (filters.sort) {
    case 'shippedAt':
      return { shippedAt: { sort: filters.dir, nulls: 'last' } }
    case 'deliveredAt':
      return { deliveredAt: { sort: filters.dir, nulls: 'last' } }
    case 'status':
      return { status: filters.dir }
    case 'createdAt':
    default:
      return { createdAt: filters.dir }
  }
}

export async function loadShipmentsData(sp: {
  q?: string
  status?: string
  shipTo?: string
  mode?: string
  sort?: string
  dir?: string
  page?: string
}): Promise<ShipmentsPageData> {
  const filters = parseShipmentFilters(sp)
  const where = buildWhere(filters)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalFiltered,
    statusGroups,
    shipToCountsRaw,
    modeCountsRaw,
    inTransitNow,
    deliveredLast7d,
    awaitingDocs,
    exceptions,
    holdActive,
  ] = await Promise.all([
    prisma.orderDispatch.count({ where }),
    prisma.orderDispatch.groupBy({
      by: ['status'],
      where: RELEVANCE_WHERE,
      _count: { _all: true },
    }),
    Promise.all(
      SHIP_TO_ORDER.map((t) =>
        prisma.orderDispatch.count({ where: { AND: [RELEVANCE_WHERE, { order: { shipToType: t } }] } }),
      ),
    ),
    Promise.all(
      MODE_ORDER.map((m) =>
        prisma.orderDispatch.count({ where: { AND: [RELEVANCE_WHERE, { shipmentLegs: { some: { mode: m } } }] } }),
      ),
    ),
    prisma.orderDispatch.count({ where: { status: { in: ['SHIPPED', 'IN_TRANSIT'] } } }),
    prisma.orderDispatch.count({ where: { status: 'DELIVERED', deliveredAt: { gte: sevenDaysAgo } } }),
    prisma.orderDispatch.count({ where: { status: 'READY' } }),
    prisma.shipmentLeg.count({ where: { status: 'EXCEPTION' } }),
    prisma.storageAgreement.count({ where: { status: 'ACTIVE' } }),
  ])

  const statusCounts: Record<ShipmentStatusKey, number> = {
    READY: 0,
    SHIPPED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
  }
  for (const g of statusGroups) {
    if ((SHIPMENT_STATUS_ORDER as readonly string[]).includes(g.status)) {
      statusCounts[g.status as ShipmentStatusKey] = g._count._all
    }
  }
  const shipToCounts: Record<ShipToKey, number> = {
    CREATOR_ADDRESS: shipToCountsRaw[0] ?? 0,
    WAREHOUSE_PARTNER: shipToCountsRaw[1] ?? 0,
    HOLD_AT_MANUFACTURER: shipToCountsRaw[2] ?? 0,
    CHANNEL_INBOUND: shipToCountsRaw[3] ?? 0,
  }
  const modeCounts: Record<ModeKey, number> = {
    PARCEL: modeCountsRaw[0] ?? 0,
    LTL: modeCountsRaw[1] ?? 0,
    FTL: modeCountsRaw[2] ?? 0,
  }

  const totalPages = Math.max(1, Math.ceil(totalFiltered / SHIPMENTS_PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)

  const dispatches = await prisma.orderDispatch.findMany({
    where,
    orderBy: orderByFor(filters),
    skip: (page - 1) * SHIPMENTS_PAGE_SIZE,
    take: SHIPMENTS_PAGE_SIZE,
    select: {
      id: true,
      type: true,
      status: true,
      trackingCarrier: true,
      trackingNumber: true,
      shippedAt: true,
      deliveredAt: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          shipToType: true,
          shipToCity: true,
          shipToState: true,
          items: {
            take: 1,
            select: {
              product: {
                select: { productTemplate: { select: { storageClass: true } } },
              },
            },
          },
        },
      },
      partnerService: {
        select: { partner: { select: { id: true, companyName: true } } },
      },
      shipmentLegs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { mode: true, status: true, carrierName: true, trackingNumber: true },
      },
    },
  })

  const rows: ShipmentRow[] = dispatches.map((d) => {
    const leg = d.shipmentLegs[0]
    return {
      dispatchId: d.id,
      dispatchType: d.type,
      status: d.status,
      orderId: d.order.id,
      orderRef: d.order.orderNumber ?? `#${d.order.id.slice(-8)}`,
      fromPartnerId: d.partnerService.partner.id,
      fromPartnerName: d.partnerService.partner.companyName,
      shipToType: d.order.shipToType as ShipToKey,
      shipToCity: d.order.shipToCity || null,
      shipToState: d.order.shipToState ?? null,
      storageClass: d.order.items[0]?.product.productTemplate?.storageClass ?? null,
      legMode: (leg?.mode as ModeKey | undefined) ?? null,
      legStatus: leg?.status ?? null,
      trackingCarrier: d.trackingCarrier ?? leg?.carrierName ?? null,
      trackingNumber: d.trackingNumber ?? leg?.trackingNumber ?? null,
      shippedAt: d.shippedAt,
      deliveredAt: d.deliveredAt,
      createdAt: d.createdAt,
    }
  })

  return {
    filters: { ...filters, page },
    rows,
    totalFiltered,
    totalPages,
    kpis: { inTransitNow, deliveredLast7d, awaitingDocs, exceptions, holdActive },
    statusCounts,
    shipToCounts,
    modeCounts,
  }
}
