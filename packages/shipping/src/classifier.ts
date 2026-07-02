/**
 * Stage 1 — deterministic shipment classification (spec §6.2).
 * Pure function of product + order data; no I/O, no prisma.
 */

import type { ClassifierInput, CoolantType, ShipmentClassification, ShipmentMode } from './types'

/** UPS/FedEx per-package parcel ceiling. */
export const PARCEL_MAX_PACKAGE_LB = 150
/** Above ~14 pallets (or explicit FTL weight) we call it FTL. */
export const LTL_MAX_PALLETS = 14
export const DEFAULT_PARCEL_TO_LTL_CARTON_CUTOVER = 8

/** Mon–Wed ship days for frozen parcels — never ride over a weekend (§6.1). */
export const FROZEN_PARCEL_SHIP_DAYS = [1, 2, 3]

/**
 * NMFC freight class from density (standard 11-break density table).
 * Only meaningful for LTL; parcel legs return null.
 */
export function freightClassFromDensity(lbPerCuFt: number): string {
  if (lbPerCuFt >= 50) return '50'
  if (lbPerCuFt >= 35) return '55'
  if (lbPerCuFt >= 30) return '60'
  if (lbPerCuFt >= 22.5) return '65'
  if (lbPerCuFt >= 15) return '70'
  if (lbPerCuFt >= 13.5) return '77.5'
  if (lbPerCuFt >= 12) return '85'
  if (lbPerCuFt >= 10.5) return '92.5'
  if (lbPerCuFt >= 9) return '100'
  if (lbPerCuFt >= 8) return '110'
  if (lbPerCuFt >= 7) return '125'
  if (lbPerCuFt >= 6) return '150'
  if (lbPerCuFt >= 5) return '175'
  if (lbPerCuFt >= 4) return '200'
  if (lbPerCuFt >= 3) return '250'
  if (lbPerCuFt >= 2) return '300'
  if (lbPerCuFt >= 1) return '400'
  return '500'
}

function pickMode(input: ClassifierInput, totalWeightLb: number): ShipmentMode {
  const pallets = input.palletCount ?? 0
  if (pallets > LTL_MAX_PALLETS) return 'FTL'
  if (pallets >= 1) return 'LTL'
  const cutover = input.parcelToLtlCartonCutover ?? DEFAULT_PARCEL_TO_LTL_CARTON_CUTOVER
  const anyOverParcelLimit = input.cartons.some((c) => c.weightLb > PARCEL_MAX_PACKAGE_LB)
  if (anyOverParcelLimit || input.cartons.length > cutover) return 'LTL'
  return 'PARCEL'
}

function pickCoolant(storageClass: ClassifierInput['storageClass'], mode: ShipmentMode): CoolantType {
  if (mode !== 'PARCEL') return 'NONE' // freight temp control = reefer equipment, not coolant
  if (storageClass === 'FROZEN') return 'DRY_ICE' // the only viable frozen parcel coolant
  if (storageClass === 'CHILLED') return 'GEL_PACK'
  if (storageClass === 'PROTECT_HEAT') return 'GEL_PACK' // seasonal; ColdPackCalculator may zero it out
  return 'NONE'
}

export function classifyShipment(input: ClassifierInput): ShipmentClassification {
  const totalWeightLb = input.cartons.reduce((sum, c) => sum + c.weightLb, 0)
  const mode = pickMode(input, totalWeightLb)
  const coolantType = pickCoolant(input.storageClass, mode)

  // Density → NMFC class (LTL/FTL only)
  let freightClass: string | null = null
  if (mode !== 'PARCEL' && input.cartons.length > 0) {
    const totalCuFt = input.cartons.reduce(
      (sum, c) => sum + (c.lengthIn * c.widthIn * c.heightIn) / 1728,
      0,
    )
    if (totalCuFt > 0) freightClass = freightClassFromDensity(totalWeightLb / totalCuFt)
  }

  // Hard SLA: frozen parcel must arrive in ≤2 days; chilled parcel ≤2 as well
  // (48h gel-pack ceiling). Freight temp control is equipment-based (no cap here).
  const maxTransitDays =
    mode === 'PARCEL' && (input.storageClass === 'FROZEN' || input.storageClass === 'CHILLED')
      ? 2
      : null

  // LQ flammables + aerosols never fly (IATA DG cost/complexity — §1, cosmetics).
  const groundOnly = input.hazmatClass === 'LQ_FLAMMABLE' || input.hazmatClass === 'AEROSOL_2_1'

  const allowedShipDays =
    mode === 'PARCEL' && input.storageClass === 'FROZEN' ? FROZEN_PARCEL_SHIP_DAYS : null

  return {
    mode,
    storageClass: input.storageClass,
    hazmatClass: input.hazmatClass,
    coolantType,
    freightClass,
    maxTransitDays,
    groundOnly,
    allowedShipDays,
    totalWeightLb,
  }
}
