/**
 * Phase L1.1 — required-document gate for the dispatch FSM
 * (docs/LOGISTICS_AND_FULFILLMENT.md §1.1). A dispatch may not flip to SHIPPED
 * while a required partner-uploaded document is missing. PURE: callers fetch
 * the product flags + uploaded ShipmentDocument types; this decides. The
 * partner UI and the server action share this exact function (server-enforced).
 */

import { requiredDocsFor } from './required-docs'
import type { HazmatClass, ShipDocType, ShipmentMode, ShippingDomain, StorageClass } from './types'

export interface DispatchDocGateInput {
  domain: ShippingDomain
  storageClass: StorageClass
  hazmatClass: HazmatClass
  /** Shipment mode; PARCEL when unknown (BOL only binds on freight). */
  mode: ShipmentMode
  /** Types of the ShipmentDocument rows already uploaded for this dispatch. */
  uploadedDocTypes: ShipDocType[]
}

export interface DispatchDocGateResult {
  required: ShipDocType[]
  missing: ShipDocType[]
  /** True when the dispatch may transition to SHIPPED. */
  canShip: boolean
}

/** Docs the partner must upload themselves (platform generates the rest). */
export const PARTNER_UPLOADED_DOC_TYPES: ShipDocType[] = ['COA', 'SDS', 'TEMP_LOGGER', 'WASHOUT_CERT']

export function evaluateDispatchDocGate(input: DispatchDocGateInput): DispatchDocGateResult {
  const required = requiredDocsFor({
    domain: input.domain,
    storageClass: input.storageClass,
    hazmatClass: input.hazmatClass,
    mode: input.mode,
  })
  // Only partner-uploaded evidence gates the SHIPPED transition; platform
  // artifacts (packing slip, BOL, labels) are generated at booking time and
  // never block the partner.
  const gating = required.filter((d) => PARTNER_UPLOADED_DOC_TYPES.includes(d))
  const uploaded = new Set(input.uploadedDocTypes)
  const missing = gating.filter((d) => !uploaded.has(d))
  return { required, missing, canShip: missing.length === 0 }
}

/** Human copy per doc type for the partner ship panel + admin views. */
export const SHIP_DOC_LABELS: Record<ShipDocType, string> = {
  BOL: 'Bill of Lading',
  PACKING_SLIP: 'Packing slip',
  COA: 'Certificate of Analysis (per lot)',
  SDS: 'Safety Data Sheet',
  TEMP_LOGGER: 'Temperature logger file',
  WASHOUT_CERT: 'Trailer washout certificate',
  LABEL_FILE: 'Shipping / case labels',
  CHANNEL_BOX_LABEL: 'Channel box labels',
  CHANNEL_PALLET_LABEL: 'Channel pallet labels',
  QC_PHOTO: 'Pre-departure QC photo',
  INSURANCE_CERT: 'Insurance certificate',
}
