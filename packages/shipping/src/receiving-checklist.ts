/**
 * Phase L1.1 — receiving-checklist artifact (docs/LOGISTICS_AND_FULFILLMENT.md §3.3).
 * Generated per factory→FC (or factory→creator) shipment from manifest data and
 * attached to the dispatch: the partner sees it as the pre-departure QC list;
 * the receiving WAREHOUSE partner reconciles against it. PURE.
 */

import type { HazmatClass, ShipmentMode, StorageClass } from './types'

export interface ReceivingChecklistInput {
  destinationType: 'CREATOR_ADDRESS' | 'WAREHOUSE_PARTNER' | 'HOLD_AT_MANUFACTURER' | 'CHANNEL_INBOUND'
  mode: ShipmentMode
  storageClass: StorageClass
  hazmatClass: HazmatClass
  lotTracked: boolean
  /** Lines: sku/gtin + qty + lot + expiry (from the production manifest). */
  lines: Array<{ sku: string; gtin: string | null; quantity: number; lotNumber: string | null; expiryDate: string | null }>
}

export interface ChecklistItem {
  key: string
  label: string
  /** Which side acts on it. */
  actor: 'SHIPPER' | 'RECEIVER'
}

export function buildReceivingChecklist(input: ReceivingChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = []
  const isFreight = input.mode !== 'PARCEL'
  const toFc = input.destinationType === 'WAREHOUSE_PARTNER'

  // ---- Shipper (pre-departure QC) ----
  items.push({ key: 'counts-match', label: 'Physical counts match the manifest exactly (no over/short)', actor: 'SHIPPER' })
  items.push({ key: 'unit-barcodes', label: 'Every unit carries a scannable GTIN/barcode (scan-test a sample)', actor: 'SHIPPER' })
  if (input.lotTracked) {
    items.push({ key: 'lot-per-carton', label: 'One lot per carton — no mixed lots of the same SKU in a box', actor: 'SHIPPER' })
    items.push({ key: 'case-labels', label: 'GS1-128 case labels applied: GTIN + lot + date, visible, not on seams', actor: 'SHIPPER' })
  }
  if (toFc) {
    items.push({ key: 'asn-label', label: 'ASN/WRO reference label on every box or pallet', actor: 'SHIPPER' })
  }
  if (isFreight) {
    items.push({ key: 'pallet-spec', label: '48×40 GMA pallets, no overhang, ≤72" height, stretch-wrapped', actor: 'SHIPPER' })
    items.push({ key: 'appointment', label: 'Delivery appointment scheduled with the receiving dock', actor: 'SHIPPER' })
  }
  if (input.storageClass === 'CHILLED' || input.storageClass === 'FROZEN') {
    items.push({ key: 'precool', label: 'Trailer/shipper pre-cooled to the written temp spec before loading', actor: 'SHIPPER' })
    items.push({ key: 'logger-placed', label: 'Temperature data logger placed inside the load', actor: 'SHIPPER' })
    if (isFreight) items.push({ key: 'seal', label: 'Trailer seal applied; seal number recorded on the BOL', actor: 'SHIPPER' })
    items.push({
      key: 'temp-mark',
      label: input.storageClass === 'FROZEN' ? '"KEEP FROZEN" marks on every carton' : '"KEEP REFRIGERATED" marks on every carton',
      actor: 'SHIPPER',
    })
  }
  if (input.hazmatClass === 'LQ_FLAMMABLE' || input.hazmatClass === 'AEROSOL_2_1') {
    items.push({ key: 'lq-mark', label: 'Limited Quantity diamond on every carton (≤30 kg gross each)', actor: 'SHIPPER' })
  }
  if (input.hazmatClass === 'DRY_ICE_AIR') {
    items.push({ key: 'dry-ice-mark', label: 'UN1845 Class 9 mark + dry-ice net weight (kg); package vented', actor: 'SHIPPER' })
  }
  items.push({ key: 'qc-photos', label: 'QC photos taken: labeled carton, pallet, and one open box', actor: 'SHIPPER' })

  // ---- Receiver (reconciliation) ----
  items.push({ key: 'recv-counts', label: 'Received quantities reconciled against the manifest (report discrepancies)', actor: 'RECEIVER' })
  if (input.lotTracked) items.push({ key: 'recv-lots', label: 'Lot numbers + expiry captured at receiving', actor: 'RECEIVER' })
  if (input.storageClass === 'CHILLED' || input.storageClass === 'FROZEN') {
    items.push({ key: 'recv-temp', label: 'Arrival temperature checked and recorded (frozen: ice crystals intact)', actor: 'RECEIVER' })
    if (isFreight) items.push({ key: 'recv-seal', label: 'Seal number verified intact against the BOL', actor: 'RECEIVER' })
  }
  items.push({ key: 'recv-damage', label: 'Damage/leaks noted on the delivery receipt before signing', actor: 'RECEIVER' })

  return items
}
