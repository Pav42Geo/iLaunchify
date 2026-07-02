// Data layer for the WAREHOUSE inbound receiving queue (Phase L1.1c —
// docs/LOGISTICS_AND_FULFILLMENT.md §3.3 + §9 "Warehouse partners").
//
// Inbound rows are OrderDispatch rows PRODUCED BY ANOTHER PARTNER whose order
// ships to one of THIS partner's WAREHOUSE services (order.shipToPartnerServiceId).
// The warehouse partner does not own the dispatch — they own the destination —
// so every query here guards on order.shipToPartnerService ownership, never on
// dispatch.partnerServiceId.

import { prisma } from '@ilaunchify/db'
import { buildReceivingChecklist, type ChecklistItem, type HazmatClass, type ShipmentMode, type StorageClass } from '@ilaunchify/shipping'

export const INBOUND_EXPECTED_STATUSES = ['SHIPPED', 'IN_TRANSIT'] as const
export const INBOUND_HISTORY_STATUSES = ['DELIVERED'] as const

export type InboundTab = 'expected' | 'history'

export interface InboundItem {
  orderItemId: string
  productName: string
  sku: string | null
  gtin: string | null
  expectedQty: number
}

export interface InboundRow {
  dispatchId: string
  status: string
  orderId: string
  orderRef: string
  fromPartner: string
  items: InboundItem[]
  expectedTotal: number
  lotNumbers: string[]
  shippedAt: Date | null
  deliveredAt: Date | null
  trackingCarrier: string | null
  trackingNumber: string | null
}

/** WAREHOUSE service ids owned by this partner user (empty = no inbound surface). */
export async function getOwnedWarehouseServiceIds(userId: string): Promise<string[]> {
  const services = await prisma.partnerService.findMany({
    where: { type: 'WAREHOUSE', partner: { userId } },
    select: { id: true },
  })
  return services.map((s) => s.id)
}

// Shared select for list + detail — order items carry the expected quantities,
// shipmentDocuments carry declared lots (COA ↔ lot linkage, schema §ShipmentDocument).
const DISPATCH_SELECT = {
  id: true,
  status: true,
  orderItemId: true,
  shippedAt: true,
  deliveredAt: true,
  trackingCarrier: true,
  trackingNumber: true,
  partnerService: { select: { partner: { select: { companyName: true } } } },
  shipmentLegs: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { mode: true, trackingNumber: true, carrierName: true },
  },
  shipmentDocuments: { select: { lotNumbers: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      items: {
        select: {
          id: true,
          quantity: true,
          product: {
            select: {
              name: true,
              internalSku: true,
              gtin: true,
              productTemplate: { select: { storageClass: true, hazmatClass: true } },
              variant: { select: { lotTracking: true } },
            },
          },
        },
      },
    },
  },
} as const

type DispatchWithOrder = Awaited<
  ReturnType<typeof prisma.orderDispatch.findMany<{ select: typeof DISPATCH_SELECT }>>
>[number]

/** Multi-SKU scoping (Phase 3): when dispatch.orderItemId is set the dispatch covers
 *  ONLY that item; otherwise it covers every item on the order (back-compat). */
export function scopeExpectedItems(d: DispatchWithOrder): InboundItem[] {
  const items = d.orderItemId ? d.order.items.filter((i) => i.id === d.orderItemId) : d.order.items
  return items.map((i) => ({
    orderItemId: i.id,
    productName: i.product.name,
    sku: i.product.internalSku,
    gtin: i.product.gtin,
    expectedQty: i.quantity,
  }))
}

function toRow(d: DispatchWithOrder): InboundRow {
  const items = scopeExpectedItems(d)
  const lots = new Set<string>()
  for (const doc of d.shipmentDocuments) for (const lot of doc.lotNumbers) lots.add(lot)
  const leg = d.shipmentLegs[0]
  return {
    dispatchId: d.id,
    status: d.status,
    orderId: d.order.id,
    orderRef: d.order.orderNumber ?? `#${d.order.id.slice(-8)}`,
    fromPartner: d.partnerService.partner.companyName,
    items,
    expectedTotal: items.reduce((sum, i) => sum + i.expectedQty, 0),
    lotNumbers: [...lots],
    shippedAt: d.shippedAt,
    deliveredAt: d.deliveredAt,
    trackingCarrier: d.trackingCarrier ?? leg?.carrierName ?? null,
    trackingNumber: d.trackingNumber ?? leg?.trackingNumber ?? null,
  }
}

/** Inbound queue rows for the given WAREHOUSE services + tab. */
export async function loadInboundRows(
  warehouseServiceIds: string[],
  tab: InboundTab,
): Promise<InboundRow[]> {
  if (warehouseServiceIds.length === 0) return []
  const statuses = tab === 'history' ? [...INBOUND_HISTORY_STATUSES] : [...INBOUND_EXPECTED_STATUSES]
  const dispatches = await prisma.orderDispatch.findMany({
    where: {
      status: { in: statuses },
      order: {
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerServiceId: { in: warehouseServiceIds },
      },
    },
    orderBy: { shippedAt: { sort: 'desc', nulls: 'last' } },
    take: 100,
    select: DISPATCH_SELECT,
  })
  return dispatches.map(toRow)
}

/** Tab counts for the KPI strip / chips (cheap counts, no row hydration). */
export async function countInbound(
  warehouseServiceIds: string[],
): Promise<{ shipped: number; inTransit: number; received: number }> {
  if (warehouseServiceIds.length === 0) return { shipped: 0, inTransit: 0, received: 0 }
  const orderFilter = {
    shipToType: 'WAREHOUSE_PARTNER' as const,
    shipToPartnerServiceId: { in: warehouseServiceIds },
  }
  const [shipped, inTransit, received] = await Promise.all([
    prisma.orderDispatch.count({ where: { status: 'SHIPPED', order: orderFilter } }),
    prisma.orderDispatch.count({ where: { status: 'IN_TRANSIT', order: orderFilter } }),
    prisma.orderDispatch.count({ where: { status: 'DELIVERED', order: orderFilter } }),
  ])
  return { shipped, inTransit, received }
}

export interface InboundDetail {
  row: InboundRow
  /** RECEIVER-side reconciliation checklist (docs §3.3) for this shipment. */
  receiverChecklist: ChecklistItem[]
}

/** One inbound dispatch, ownership-guarded on the ship-to WAREHOUSE service. */
export async function loadInboundDetail(
  userId: string,
  dispatchId: string,
): Promise<InboundDetail | null> {
  const d = await prisma.orderDispatch.findFirst({
    where: {
      id: dispatchId,
      order: {
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerService: { type: 'WAREHOUSE', partner: { userId } },
      },
    },
    select: DISPATCH_SELECT,
  })
  if (!d) return null

  const row = toRow(d)
  const scoped = d.orderItemId ? d.order.items.filter((i) => i.id === d.orderItemId) : d.order.items
  const first = scoped[0]
  // Prisma enum values mirror the @ilaunchify/shipping string unions 1:1 (types.ts).
  const storageClass = (first?.product.productTemplate?.storageClass ?? 'AMBIENT') as StorageClass
  const hazmatClass = (first?.product.productTemplate?.hazmatClass ?? 'NONE') as HazmatClass
  // Conservative default: lot-track unless every scoped variant opted out.
  const lotTracked = scoped.some((i) => i.product.variant?.lotTracking !== false)
  const mode = (d.shipmentLegs[0]?.mode ?? 'PARCEL') as ShipmentMode

  const lot0 = row.lotNumbers[0] ?? null
  const checklist = buildReceivingChecklist({
    destinationType: 'WAREHOUSE_PARTNER',
    mode,
    storageClass,
    hazmatClass,
    lotTracked,
    lines: row.items.map((i) => ({
      sku: i.sku ?? i.productName,
      gtin: i.gtin,
      quantity: i.expectedQty,
      lotNumber: lot0,
      expiryDate: null,
    })),
  })

  return { row, receiverChecklist: checklist.filter((c) => c.actor === 'RECEIVER') }
}
