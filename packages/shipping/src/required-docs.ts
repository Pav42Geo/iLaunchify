/**
 * Required-document rules: domain × storageClass × hazmat → ShipDocType[]
 * (spec §1.1 / §8). Enforced in the dispatch FSM — a dispatch may not flip to
 * SHIPPED while a required doc is missing. Pure lookup; no I/O.
 */

import type { HazmatClass, ShipDocType, ShippingDomain, ShipmentMode, StorageClass } from './types'

export interface RequiredDocsInput {
  domain: ShippingDomain
  storageClass: StorageClass
  hazmatClass: HazmatClass
  mode: ShipmentMode
}

const CONSUMABLE_DOMAINS: ShippingDomain[] = [
  'FOOD',
  'BEVERAGE',
  'DIETARY_SUPPLEMENT',
  'PET_PRODUCT',
  'BABY_NUTRITION',
]

export function requiredDocsFor(input: RequiredDocsInput): ShipDocType[] {
  const docs = new Set<ShipDocType>(['PACKING_SLIP'])

  // Freight always rides on a BOL; parcels ride on the carrier label.
  if (input.mode === 'LTL' || input.mode === 'FTL') docs.add('BOL')

  // COA per lot — universal B2B norm for anything ingestible (§1: SIDI for
  // supplements; retail/3PL receiving expectation for food/pet/baby).
  if (CONSUMABLE_DOMAINS.includes(input.domain)) docs.add('COA')

  // SDS for any DOT-classified product; 3PLs demand it before receipt.
  if (input.hazmatClass !== 'NONE') docs.add('SDS')

  // Cold chain evidence (FSMA STF applies to TCS food; logger file is the
  // delivery-evidence artifact for disputes/insurance either way).
  if (input.storageClass === 'CHILLED' || input.storageClass === 'FROZEN') {
    docs.add('TEMP_LOGGER')
    if (input.mode === 'LTL' || input.mode === 'FTL') docs.add('WASHOUT_CERT')
  }

  return [...docs].sort()
}
