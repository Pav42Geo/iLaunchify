// Data layer for the partner outbound release queue — Partner Role Accounts P1
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.1.C).
//
// Outbound = StorageReleaseOrder rows on agreements held at THIS partner's
// services (WAREHOUSE FCs + HOLD_AT_MANUFACTURER producing partners).
// Ownership walks release → agreement → partnerService → partner → userId.
// The FSM actions themselves live in orders/[dispatchId]/releases-actions.ts
// and are shared by both surfaces.

import { prisma } from '@ilaunchify/db'

export type OutboundTab = 'queue' | 'shipped' | 'history'

export const OUTBOUND_TAB_STATUSES: Record<OutboundTab, string[]> = {
  queue: ['REQUESTED', 'PICKING'],
  shipped: ['SHIPPED'],
  history: ['DELIVERED', 'CANCELLED'],
}

export interface OutboundRow {
  releaseId: string
  status: string
  quantity: number
  destinationType: string
  destinationSummary: string | null
  trackingCarrier: string | null
  trackingNumber: string | null
  createdAt: Date
  orderId: string
  orderRef: string
  brandName: string
  unitsRemaining: number
  agreementMode: string
}

function summarizeDestination(json: unknown): {
  summary: string | null
  trackingCarrier: string | null
  trackingNumber: string | null
} {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { summary: null, trackingCarrier: null, trackingNumber: null }
  }
  const obj = json as Record<string, unknown>
  const addr = obj.address as Record<string, unknown> | undefined
  const summary =
    typeof obj.summary === 'string'
      ? obj.summary
      : addr && typeof addr.city === 'string'
        ? [addr.city, addr.state].filter(Boolean).join(', ')
        : null
  const tracking = obj.tracking as Record<string, unknown> | undefined
  return {
    summary,
    trackingCarrier: typeof tracking?.carrier === 'string' ? tracking.carrier : null,
    trackingNumber: typeof tracking?.number === 'string' ? tracking.number : null,
  }
}

export async function loadOutboundRows(userId: string, tab: OutboundTab): Promise<OutboundRow[]> {
  const releases = await prisma.storageReleaseOrder.findMany({
    where: {
      status: { in: OUTBOUND_TAB_STATUSES[tab] as never },
      storageAgreement: { partnerService: { partner: { userId } } },
    },
    orderBy: { createdAt: tab === 'queue' ? 'asc' : 'desc' }, // oldest requests first
    take: 100,
    select: {
      id: true,
      status: true,
      quantity: true,
      destinationType: true,
      destinationJson: true,
      createdAt: true,
      storageAgreement: {
        select: {
          orderId: true,
          mode: true,
          unitsRemaining: true,
          order: { select: { orderNumber: true, brand: { select: { name: true } } } },
        },
      },
    },
  })

  return releases.map((r) => {
    const dest = summarizeDestination(r.destinationJson)
    return {
      releaseId: r.id,
      status: r.status as string,
      quantity: r.quantity,
      destinationType: r.destinationType as string,
      destinationSummary: dest.summary,
      trackingCarrier: dest.trackingCarrier,
      trackingNumber: dest.trackingNumber,
      createdAt: r.createdAt,
      orderId: r.storageAgreement.orderId,
      orderRef: r.storageAgreement.order.orderNumber ?? `#${r.storageAgreement.orderId.slice(-8)}`,
      brandName: r.storageAgreement.order.brand.name,
      unitsRemaining: r.storageAgreement.unitsRemaining,
      agreementMode: r.storageAgreement.mode as string,
    }
  })
}

export async function countOutbound(userId: string) {
  const base = { storageAgreement: { partnerService: { partner: { userId } } } }
  const [requested, picking, shipped, delivered] = await Promise.all([
    prisma.storageReleaseOrder.count({ where: { ...base, status: 'REQUESTED' } }),
    prisma.storageReleaseOrder.count({ where: { ...base, status: 'PICKING' } }),
    prisma.storageReleaseOrder.count({ where: { ...base, status: 'SHIPPED' } }),
    prisma.storageReleaseOrder.count({ where: { ...base, status: 'DELIVERED' } }),
  ])
  return { requested, picking, shipped, delivered }
}
