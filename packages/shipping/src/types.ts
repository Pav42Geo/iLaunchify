/**
 * @ilaunchify/shipping — L0 types (docs/LOGISTICS_AND_FULFILLMENT.md).
 *
 * DELIBERATELY prisma-free: these string unions mirror the Prisma enums 1:1 so
 * the classifier/eligibility suites stay pure (run-vitest-suites.mjs-compatible,
 * no client import). Server actions map prisma enum values straight through —
 * if you add a value to schema.prisma, add it here too (guarded by tests).
 */

export type StorageClass = 'AMBIENT' | 'PROTECT_HEAT' | 'CHILLED' | 'FROZEN'
export type HazmatClass = 'NONE' | 'LQ_FLAMMABLE' | 'AEROSOL_2_1' | 'DRY_ICE_AIR'
export type ShipmentMode = 'PARCEL' | 'LTL' | 'FTL'
export type CoolantType = 'NONE' | 'GEL_PACK' | 'DRY_ICE'
export type ShipDocType =
  | 'BOL'
  | 'PACKING_SLIP'
  | 'COA'
  | 'SDS'
  | 'TEMP_LOGGER'
  | 'WASHOUT_CERT'
  | 'LABEL_FILE'
  | 'CHANNEL_BOX_LABEL'
  | 'CHANNEL_PALLET_LABEL'
  | 'QC_PHOTO'
  | 'INSURANCE_CERT'

/** Product domain in labeling-type vocabulary (matches applicableLabelingTypes). */
export type ShippingDomain =
  | 'FOOD'
  | 'BEVERAGE'
  | 'DIETARY_SUPPLEMENT'
  | 'PET_PRODUCT'
  | 'BABY_NUTRITION'
  | 'COSMETIC'

export interface CartonSpec {
  lengthIn: number
  widthIn: number
  heightIn: number
  weightLb: number
}

export interface ClassifierInput {
  domain: ShippingDomain
  storageClass: StorageClass
  hazmatClass: HazmatClass
  meltable: boolean
  cartons: CartonSpec[]
  palletCount?: number
  /** Admin-tunable OrderSettings.parcelToLtlCartonCutover (default 8). */
  parcelToLtlCartonCutover?: number
  /** Ship date for seasonal windows (frozen Mon–Wed rule, meltable season). */
  plannedShipDate?: Date
}

export interface ShipmentClassification {
  mode: ShipmentMode
  storageClass: StorageClass
  hazmatClass: HazmatClass
  coolantType: CoolantType
  /** NMFC freight class from density — LTL/FTL only, null for parcel. */
  freightClass: string | null
  /** Max carrier transit days allowed (frozen parcel ⇒ 2). Null = unconstrained. */
  maxTransitDays: number | null
  /** Ground-only routing (LQ flammables / aerosols). */
  groundOnly: boolean
  /** Allowed ship weekdays, 0=Sun…6=Sat. Null = any day. */
  allowedShipDays: number[] | null
  totalWeightLb: number
}

/** Mirrors a CarrierServiceRule DB row — the Stage-2 eligibility matrix. */
export interface CarrierServiceRuleRow {
  id: string
  carrier: string
  serviceLevel: string
  modes: ShipmentMode[]
  storageClasses: string[]
  hazmatAllowed: string[]
  maxWeightLb: number | null
  maxTransitDays: number | null
  groundOnly: boolean
  seasonalWindowJson: unknown
  priority: number
  active: boolean
}

/** LogisticsSetting keys — the "build-ready, admin-gated" backbone (L1/L2). */
export const LOGISTICS_KEYS = {
  storageClassChilled: 'storage_class:CHILLED',
  storageClassFrozen: 'storage_class:FROZEN',
  connectorShipbob: 'connector:shipbob',
  carrierEasypost: 'carrier:easypost',
  carrierShipengineLtl: 'carrier:shipengine_ltl',
  carrierBrokerReefer: 'carrier:broker_reefer',
  insurance: 'insurance',
  channelInboundAmazonFba: 'channel_inbound:AMAZON_FBA',
  channelInboundWalmartWfs: 'channel_inbound:WALMART_WFS',
  channelInboundTiktokFbt: 'channel_inbound:TIKTOK_FBT',
  holdAtManufacturer: 'destination:HOLD_AT_MANUFACTURER',
  channelInbound: 'destination:CHANNEL_INBOUND',
} as const

export type LogisticsKey = (typeof LOGISTICS_KEYS)[keyof typeof LOGISTICS_KEYS]
