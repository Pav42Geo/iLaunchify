// Data layer for the partner-side inventory view — Partner Role Accounts P1
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.1.B).
//
// Inventory = StorageAgreement rows held at THIS partner's services (any
// storage-holding service: WAREHOUSE FCs and HOLD_AT_MANUFACTURER producing
// partners share the surface). Ownership walks agreement → partnerService →
// partner → userId (tenant isolation, threat #1).
//
// FEFO panel: lots come from InboundReceiptLine (captured immutably at
// receiving, D2) matched to agreements by orderId. HOLD_AT_MANUFACTURER
// agreements have no receipt lines — their rows simply show no lot data.

import { prisma } from '@ilaunchify/db'
import { computeStorageAccrual, type StorageFeeSnapshot } from '@ilaunchify/shipping'
import { serviceOwnedBy } from '@/lib/partner-context'

export interface InventoryRow {
  agreementId: string
  orderId: string
  orderRef: string
  brandName: string
  serviceType: string
  mode: string
  status: string
  unitsRemaining: number
  palletsRemaining: number | null
  startedAt: Date
  openReleases: number
  accruedCents: number | null
}

export interface FefoLot {
  lotNumber: string
  lotExpiryAt: Date
  orderRef: string
  receivedQty: number
}

const DEFAULT_SNAPSHOT_KEYS: Array<keyof StorageFeeSnapshot> = [
  'billingUnit',
  'rateCents',
  'graceDays',
  'minMonthlyCents',
  'pickFeeCents',
  'packFeeCents',
  'referralFeeBps',
]

function parseSnapshot(json: unknown): StorageFeeSnapshot | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>
  if (!DEFAULT_SNAPSHOT_KEYS.every((k) => k in obj)) return null
  return obj as unknown as StorageFeeSnapshot
}

export async function loadInventory(userId: string, tab: 'active' | 'closed') {
  const statuses = tab === 'closed' ? ['CLOSED'] : ['ACTIVE', 'RELEASING']
  const agreements = await prisma.storageAgreement.findMany({
    where: {
      status: { in: statuses as never },
      partnerService: serviceOwnedBy(userId),
    },
    orderBy: { startedAt: 'asc' },
    take: 200,
    select: {
      id: true,
      orderId: true,
      mode: true,
      status: true,
      feeSnapshotJson: true,
      startedAt: true,
      endedAt: true,
      unitsRemaining: true,
      palletsRemaining: true,
      partnerService: { select: { type: true } },
      order: {
        select: { orderNumber: true, brand: { select: { name: true } } },
      },
      releases: { select: { status: true } },
    },
  })

  const now = new Date()
  const rows: InventoryRow[] = agreements.map((a) => {
    const snapshot = parseSnapshot(a.feeSnapshotJson)
    const shippedPicks = a.releases.filter((r) => r.status === 'SHIPPED' || r.status === 'DELIVERED').length
    let accruedCents: number | null = null
    if (snapshot) {
      // Billable units: pallets for PALLET_MONTH. CUFT_MONTH agreements without
      // pallet data show "—" (cu-ft per agreement isn't tracked yet — billing
      // ledger P1.8 adds it); estimate is DISPLAY-ONLY, charges stay gated.
      const billableUnits =
        snapshot.billingUnit === 'PALLET_MONTH' ? a.palletsRemaining : null
      if (billableUnits != null && billableUnits > 0) {
        try {
          accruedCents = computeStorageAccrual({
            snapshot,
            startedAt: a.startedAt,
            asOf: a.endedAt ?? now,
            billableUnits,
            pickCount: shippedPicks,
          }).partnerNetCents
        } catch {
          accruedCents = null // malformed snapshot — surface as “—”, never crash the queue
        }
      }
    }
    return {
      agreementId: a.id,
      orderId: a.orderId,
      orderRef: a.order.orderNumber ?? `#${a.orderId.slice(-8)}`,
      brandName: a.order.brand.name,
      serviceType: a.partnerService.type as string,
      mode: a.mode as string,
      status: a.status as string,
      unitsRemaining: a.unitsRemaining,
      palletsRemaining: a.palletsRemaining,
      startedAt: a.startedAt,
      openReleases: a.releases.filter((r) => r.status === 'REQUESTED' || r.status === 'PICKING').length,
      accruedCents,
    }
  })

  return rows
}

/** Lots expiring ≤90 days across orders with an open agreement at this partner (FEFO). */
export async function loadFefoLots(userId: string): Promise<FefoLot[]> {
  const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  const lines = await prisma.inboundReceiptLine.findMany({
    where: {
      lotExpiryAt: { not: null, lte: horizon },
      receipt: {
        orderDispatch: {
          order: {
            storageAgreements: {
              some: {
                status: { in: ['ACTIVE', 'RELEASING'] },
                partnerService: serviceOwnedBy(userId),
              },
            },
          },
        },
      },
    },
    orderBy: { lotExpiryAt: 'asc' },
    take: 25,
    select: {
      lotNumber: true,
      lotExpiryAt: true,
      receivedQty: true,
      receipt: {
        select: {
          orderDispatch: {
            select: { orderId: true, order: { select: { orderNumber: true } } },
          },
        },
      },
    },
  })

  return lines
    .filter((l) => l.lotNumber && l.lotExpiryAt)
    .map((l) => ({
      lotNumber: l.lotNumber as string,
      lotExpiryAt: l.lotExpiryAt as Date,
      receivedQty: l.receivedQty,
      orderRef:
        l.receipt.orderDispatch.order.orderNumber ??
        `#${l.receipt.orderDispatch.orderId.slice(-8)}`,
    }))
}

// -----------------------------------------------------------------------------
// I2c (docs/MANUFACTURER_INVENTORY_2026-07-27.md): the partner's OWN product
// stock: TemplateFlavorInventory on templates owned by the caller's
// MANUFACTURING services. A DIFFERENT thing from the StorageAgreement tables
// above (client goods stored at the facility); the page renders them as
// separate tabs on purpose. Cast-guarded + fail-safe until the I1 db:push.
// -----------------------------------------------------------------------------

export interface OwnStockRow {
  templateId: string
  templateName: string
  templateStatus: string
  soldOut: boolean
  flavorLabel: string
  quantityAvailable: number
  lowStockThreshold: number | null
  alertState: string
  updatedAt: Date
}

const BASE_FLAVOR_KEY = 'base' // sentinel for flavorless templates (schema default)

export async function loadOwnProductStock(userId: string): Promise<OwnStockRow[]> {
  try {
    const templates = await prisma.productTemplate.findMany({
      where: { manufacturerService: serviceOwnedBy(userId) },
      select: { id: true, name: true, status: true },
    })
    if (templates.length === 0) return []
    const tplById = new Map(templates.map((t) => [t.id, t]))
    const ids = templates.map((t) => t.id)

    const cast = prisma as unknown as {
      templateFlavorInventory: {
        findMany: (a: unknown) => Promise<
          Array<{
            productTemplateId: string
            flavorPresetId: string
            quantityAvailable: number
            lowStockThreshold: number | null
            alertState: string
            updatedAt: Date
          }>
        >
      }
      productTemplate: {
        findMany: (a: unknown) => Promise<Array<{ id: string; inventorySoldOut: boolean }>>
      }
    }

    const inv = await cast.templateFlavorInventory.findMany({
      where: { productTemplateId: { in: ids }, tracked: true },
      select: {
        productTemplateId: true,
        flavorPresetId: true,
        quantityAvailable: true,
        lowStockThreshold: true,
        alertState: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    if (inv.length === 0) return []

    const presetIds = [...new Set(inv.map((r) => r.flavorPresetId).filter((id) => id !== BASE_FLAVOR_KEY))]
    const presets = presetIds.length
      ? await prisma.flavorPreset.findMany({ where: { id: { in: presetIds } }, select: { id: true, name: true } })
      : []
    const presetName = new Map(presets.map((p) => [p.id, p.name]))

    const soldOutRows = await cast.productTemplate
      .findMany({ where: { id: { in: ids } }, select: { id: true, inventorySoldOut: true } })
      .catch(() => [] as Array<{ id: string; inventorySoldOut: boolean }>)
    const soldOut = new Map(soldOutRows.map((r) => [r.id, r.inventorySoldOut]))

    return inv
      .map((r) => {
        const tpl = tplById.get(r.productTemplateId)
        if (!tpl) return null
        return {
          templateId: tpl.id,
          templateName: tpl.name,
          templateStatus: String(tpl.status),
          soldOut: soldOut.get(tpl.id) ?? false,
          flavorLabel: r.flavorPresetId === BASE_FLAVOR_KEY ? 'All units' : presetName.get(r.flavorPresetId) ?? 'Flavor',
          quantityAvailable: r.quantityAvailable,
          lowStockThreshold: r.lowStockThreshold,
          alertState: r.alertState,
          updatedAt: r.updatedAt,
        }
      })
      .filter((r): r is OwnStockRow => r !== null)
  } catch {
    return [] // delegates not generated yet (pre I1 db:push)
  }
}
