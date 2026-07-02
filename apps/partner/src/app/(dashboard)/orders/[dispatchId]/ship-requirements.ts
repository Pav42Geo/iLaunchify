// Phase L1.1b — shipping context for a dispatch
// (docs/LOGISTICS_AND_FULFILLMENT.md §1.1 + §9 partner surface).
//
// ONE source of truth shared by the dispatch detail page (renders the
// "Shipping requirements" card + ship panel) AND the shipDispatch server
// action, which re-runs the exact same gate server-side before flipping the
// dispatch to SHIPPED — never trust the client's rendering of the rule.

import { prisma } from '@ilaunchify/db'
import type { LabelingType } from '@ilaunchify/db'
import {
  evaluateDispatchDocGate,
  buildReceivingChecklist,
  type ChecklistItem,
  type DispatchDocGateResult,
  type HazmatClass,
  type ShipDocType,
  type ShipmentMode,
  type ShippingDomain,
  type StorageClass,
} from '@ilaunchify/shipping'

export interface ShipDocRow {
  id: string
  type: ShipDocType
  /** PartnerFile id (ShipmentDocument.assetId soft FK) — download via /api/ship-doc/[fileId]. */
  assetId: string
  lotNumbers: string[]
  createdAt: Date
  filename: string | null
}

export interface DispatchShippingContext {
  domain: ShippingDomain
  storageClass: StorageClass
  hazmatClass: HazmatClass
  meltable: boolean
  mode: ShipmentMode
  /** required / missing / canShip from evaluateDispatchDocGate. */
  gate: DispatchDocGateResult
  /** SHIPPER-side pre-departure QC checklist (receiver items are the FC's job). */
  checklist: ChecklistItem[]
  /** All ShipmentDocument rows on the dispatch (incl. QC photos), oldest first. */
  documents: ShipDocRow[]
  /**
   * LABEL dispatches ship printed label stock, not the consumable product —
   * the domain/cold-chain document rules key off the PRODUCT, so the gate is
   * a no-op for them (canShip always true).
   */
  docGateApplies: boolean
}

/**
 * ShippingDomain (labeling-type vocabulary, see @ilaunchify/shipping types)
 * derived from the product template's label regime:
 * - FOOD covers beverage too — LabelingType has no BEVERAGE split, and the
 *   §1.1 doc rules are identical for both.
 * - OTC maps to DIETARY_SUPPLEMENT: ingestible ⇒ COA gates per lot. (The OTC
 *   domain is admin-disabled in V1 anyway — DomainSetting default off.)
 * - Infant-audience templates (21 CFR 101.9(j)(5)) count as BABY_NUTRITION.
 */
const DOMAIN_BY_LABELING_TYPE: Record<LabelingType, ShippingDomain> = {
  FOOD: 'FOOD',
  DIETARY_SUPPLEMENT: 'DIETARY_SUPPLEMENT',
  PET_PRODUCT: 'PET_PRODUCT',
  OTC: 'DIETARY_SUPPLEMENT',
  COSMETIC: 'COSMETIC',
}

/** Domains whose products are lot-tracked (COA-per-lot norm, §1.1). */
const LOT_TRACKED_DOMAINS: ShippingDomain[] = [
  'FOOD',
  'BEVERAGE',
  'DIETARY_SUPPLEMENT',
  'PET_PRODUCT',
  'BABY_NUTRITION',
]

const TEMPLATE_SELECT = {
  labelingType: true,
  storageClass: true,
  hazmatClass: true,
  meltable: true,
  intendedAgeGroup: true,
} as const

const ITEM_SELECT = {
  quantity: true,
  product: {
    select: {
      name: true,
      gtin: true,
      internalSku: true,
      productTemplate: { select: TEMPLATE_SELECT },
    },
  },
} as const

export async function getDispatchShippingContext(
  dispatchId: string,
): Promise<DispatchShippingContext> {
  const dispatch = await prisma.orderDispatch.findUnique({
    where: { id: dispatchId },
    select: {
      id: true,
      type: true,
      order: {
        select: {
          shipToType: true,
          // Back-compat: pre-Phase-3 dispatches leave orderItemId null and
          // fall back to the order's first item (same rule as the manifest).
          items: { take: 1, select: ITEM_SELECT },
        },
      },
      orderItem: { select: ITEM_SELECT },
      shipmentDocuments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, assetId: true, lotNumbers: true, createdAt: true },
      },
    },
  })
  if (!dispatch) throw new Error('Dispatch not found')

  const item = dispatch.orderItem ?? dispatch.order.items[0] ?? null
  const template = item?.product.productTemplate ?? null

  // Conservative defaults for legacy products without a catalog template:
  // treat as ambient FOOD (⇒ COA still gates — operational-trust default).
  const domain: ShippingDomain =
    template?.intendedAgeGroup === 'INFANT_0_12'
      ? 'BABY_NUTRITION'
      : DOMAIN_BY_LABELING_TYPE[template?.labelingType ?? 'FOOD']
  const storageClass: StorageClass = template?.storageClass ?? 'AMBIENT'
  const hazmatClass: HazmatClass = template?.hazmatClass ?? 'NONE'
  const meltable = template?.meltable ?? false

  // V1 mode classification: dispatches carry no carton/pallet data yet
  // (packagesJson/palletCount live on ShipmentLeg, created at ship time), so
  // every partner-shipped leg defaults to PARCEL. BOL/washout requirements
  // only bind on freight (LTL/FTL), so they never gate in V1. When Phase-L2
  // booking lands this switches to classifyShipment() over real carton specs.
  const mode: ShipmentMode = 'PARCEL'

  const docGateApplies = dispatch.type !== 'LABEL'

  const uploadedDocTypes = dispatch.shipmentDocuments.map((d) => d.type as ShipDocType)
  const gate: DispatchDocGateResult = docGateApplies
    ? evaluateDispatchDocGate({ domain, storageClass, hazmatClass, mode, uploadedDocTypes })
    : { required: [], missing: [], canShip: true }

  const checklist = docGateApplies
    ? buildReceivingChecklist({
        destinationType: dispatch.order.shipToType, // OrderShipToType matches 1:1
        mode,
        storageClass,
        hazmatClass,
        lotTracked: LOT_TRACKED_DOMAINS.includes(domain),
        lines: item
          ? [
              {
                sku: item.product.internalSku ?? item.product.name,
                gtin: item.product.gtin,
                quantity: item.quantity,
                lotNumber: null,
                expiryDate: null,
              },
            ]
          : [],
      }).filter((i) => i.actor === 'SHIPPER')
    : []

  // Resolve original filenames for the download rows (assetId → PartnerFile).
  const assetIds = dispatch.shipmentDocuments.map((d) => d.assetId)
  const files = assetIds.length
    ? await prisma.partnerFile.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, originalFilename: true },
      })
    : []
  const nameById = new Map(files.map((f) => [f.id, f.originalFilename]))

  const documents: ShipDocRow[] = dispatch.shipmentDocuments.map((d) => ({
    id: d.id,
    type: d.type as ShipDocType,
    assetId: d.assetId,
    lotNumbers: d.lotNumbers,
    createdAt: d.createdAt,
    filename: nameById.get(d.assetId) ?? null,
  }))

  return { domain, storageClass, hazmatClass, meltable, mode, gate, checklist, documents, docGateApplies }
}
