// Phase L4a — creator /inventory VMI view (docs/LOGISTICS_AND_FULFILLMENT.md §9).
//
// Server-side assembly for the three inventory locations a creator's finished
// goods can sit in before reaching an end channel:
//   (a) At manufacturers — ACTIVE/RELEASING StorageAgreements (HOLD orders)
//   (b) At fulfillment centers — DELIVERED runs on WAREHOUSE_PARTNER orders
//   (c) Inbound to channels — ChannelInboundPlan rows (factory → FBA/WFS/FBT)
//
// READ-ONLY: every query is scoped to the creator's own orders
// (order: { creatorUserId }) — the page renders no mutations. Lots + expiry
// countdown + FEFO warnings (§9 V1.5 tail) land when lot capture exists.

import { prisma } from '@ilaunchify/db'

export interface ManufacturerHoldRow {
  agreementId: string
  orderId: string
  orderNumber: string | null
  partnerName: string
  productName: string
  mode: 'ON_DEMAND' | 'STOCK_RELEASE'
  status: 'ACTIVE' | 'RELEASING'
  unitsRemaining: number
  storedSince: string // ISO
  /** Free-storage grace end (estimate — see graceEndsOn comment below). Null
   *  when the fee snapshot carries no graceDays. */
  graceEndsOn: string | null
  /** Releases still moving (REQUESTED / PICKING / SHIPPED). */
  openReleases: number
}

export interface FcInventoryRow {
  orderId: string
  orderNumber: string | null
  productName: string
  /** Ordered quantity stands in for received quantity — the inbound
   *  received-vs-expected reconciliation audit is heavier than this list view
   *  needs; V1.5 swaps in the reconciled received count. */
  units: number
  deliveredAt: string | null // ISO; null when the dispatch lacks a timestamp
}

export interface FcInventoryGroup {
  partnerServiceId: string
  fcName: string
  location: string | null // "City, ST"
  totalUnits: number
  rows: FcInventoryRow[]
}

export type ChannelPlanStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'CHECKED_IN'
  | 'RECONCILED'
  | 'CANCELLED'

export interface ChannelPlanRow {
  planId: string
  orderId: string
  orderNumber: string | null
  channelName: string
  productName: string
  units: number
  status: ChannelPlanStatus
  updatedAt: string // ISO
}

export interface CreatorInventoryData {
  manufacturerHolds: ManufacturerHoldRow[]
  fcGroups: FcInventoryGroup[]
  channelPlans: ChannelPlanRow[]
  totals: {
    unitsAtManufacturers: number
    unitsAtFcs: number
    plansInFlight: number
  }
}

/** Plan statuses still moving toward the channel (everything pre-settlement). */
const IN_FLIGHT_PLAN_STATUSES: ChannelPlanStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'SHIPPED',
  'CHECKED_IN',
]

const DAY_MS = 24 * 60 * 60 * 1000
const OPEN_RELEASE_STATUSES = ['REQUESTED', 'PICKING', 'SHIPPED']

/** Defensive read of feeSnapshotJson.graceDays (the column is Json — never
 *  trust its shape at read time; storage-panel-data.ts precedent). */
function readGraceDays(v: unknown): number | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const n = (v as Record<string, unknown>).graceDays
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export async function getCreatorInventory(
  creatorUserId: string,
): Promise<CreatorInventoryData> {
  const [agreements, fcOrders, plans] = await Promise.all([
    // (a) At manufacturers — open StorageAgreements on the creator's orders.
    prisma.storageAgreement.findMany({
      where: {
        status: { in: ['ACTIVE', 'RELEASING'] },
        order: { creatorUserId },
      },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        mode: true,
        status: true,
        unitsRemaining: true,
        startedAt: true,
        feeSnapshotJson: true,
        partnerService: {
          select: { partner: { select: { companyName: true } } },
        },
        releases: { select: { status: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            items: {
              select: { product: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
    }),
    // (b) At fulfillment centers — WAREHOUSE_PARTNER orders whose run has
    // landed (any DELIVERED dispatch), grouped by the receiving FC below.
    prisma.order.findMany({
      where: {
        creatorUserId,
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerServiceId: { not: null },
        dispatches: { some: { status: 'DELIVERED' } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        shipToPartnerServiceId: true,
        shipToPartnerService: {
          select: {
            partner: { select: { companyName: true, city: true, state: true } },
          },
        },
        items: {
          select: { quantity: true, product: { select: { name: true } } },
          take: 1,
        },
        dispatches: {
          where: { status: 'DELIVERED' },
          select: { deliveredAt: true },
        },
      },
    }),
    // (c) Inbound to channels — every plan on the creator's orders, by status.
    prisma.channelInboundPlan.findMany({
      where: { order: { creatorUserId } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        channelConnection: {
          select: { channel: { select: { displayName: true } } },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            items: {
              select: { quantity: true, product: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
    }),
  ])

  const manufacturerHolds: ManufacturerHoldRow[] = agreements.map((a) => {
    // graceEndsOn is a CALENDAR-day estimate off the frozen fee snapshot; the
    // canonical business-day accrual (computeStorageAccrual) renders on the
    // order-detail Stored-stock panel — this list only needs a countdown hint.
    const graceDays = readGraceDays(a.feeSnapshotJson)
    return {
      agreementId: a.id,
      orderId: a.order.id,
      orderNumber: a.order.orderNumber ?? null,
      partnerName: a.partnerService.partner.companyName,
      productName: a.order.items[0]?.product.name ?? 'Untitled product',
      mode: a.mode,
      // The where-clause pinned status to ACTIVE | RELEASING; narrow for TS.
      status: a.status === 'RELEASING' ? 'RELEASING' : 'ACTIVE',
      unitsRemaining: a.unitsRemaining,
      storedSince: a.startedAt.toISOString(),
      graceEndsOn:
        graceDays !== null
          ? new Date(a.startedAt.getTime() + graceDays * DAY_MS).toISOString()
          : null,
      openReleases: a.releases.filter((r) => OPEN_RELEASE_STATUSES.includes(r.status)).length,
    }
  })

  // Group delivered WAREHOUSE_PARTNER orders by the receiving FC node.
  const groups = new Map<string, FcInventoryGroup>()
  for (const o of fcOrders) {
    const psId = o.shipToPartnerServiceId
    const p = o.shipToPartnerService?.partner
    if (!psId || !p) continue // shape guard — where-clause makes this unreachable
    let group = groups.get(psId)
    if (!group) {
      group = {
        partnerServiceId: psId,
        fcName: p.companyName,
        location: p.city ? `${p.city}${p.state ? `, ${p.state}` : ''}` : (p.state ?? null),
        totalUnits: 0,
        rows: [],
      }
      groups.set(psId, group)
    }
    const units = o.items[0]?.quantity ?? 0
    // Latest DELIVERED timestamp across the order's dispatches = when the run
    // finished landing at the FC.
    let deliveredAt: Date | null = null
    for (const d of o.dispatches) {
      if (d.deliveredAt && (!deliveredAt || d.deliveredAt > deliveredAt)) {
        deliveredAt = d.deliveredAt
      }
    }
    group.totalUnits += units
    group.rows.push({
      orderId: o.id,
      orderNumber: o.orderNumber ?? null,
      productName: o.items[0]?.product.name ?? 'Untitled product',
      units,
      deliveredAt: deliveredAt?.toISOString() ?? null,
    })
  }
  const fcGroups = [...groups.values()].sort((a, b) => b.totalUnits - a.totalUnits)

  const channelPlans: ChannelPlanRow[] = plans.map((pl) => ({
    planId: pl.id,
    orderId: pl.order.id,
    orderNumber: pl.order.orderNumber ?? null,
    channelName: pl.channelConnection.channel.displayName,
    productName: pl.order.items[0]?.product.name ?? 'Untitled product',
    units: pl.order.items[0]?.quantity ?? 0,
    status: pl.status,
    updatedAt: pl.updatedAt.toISOString(),
  }))

  return {
    manufacturerHolds,
    fcGroups,
    channelPlans,
    totals: {
      unitsAtManufacturers: manufacturerHolds.reduce((s, r) => s + r.unitsRemaining, 0),
      unitsAtFcs: fcGroups.reduce((s, g) => s + g.totalUnits, 0),
      plansInFlight: channelPlans.filter((p) => IN_FLIGHT_PLAN_STATUSES.includes(p.status))
        .length,
    },
  }
}
