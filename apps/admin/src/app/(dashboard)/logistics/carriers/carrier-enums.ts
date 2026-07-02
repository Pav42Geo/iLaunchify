// Client-safe enum lists for the /logistics/carriers surface (no prisma import
// — the client form uses these too). Hardcoded mirrors of schema.prisma enums
// ShipmentMode / StorageClass / HazmatClass: CarrierServiceRule stores
// storageClasses / hazmatAllowed as String[] (not enum arrays), so these lists
// + the zod schema in actions.ts ARE the validation source for this surface.
// Keep in sync with the schema enums (and packages/shipping/src/types.ts).

export const SHIPMENT_MODES = ['PARCEL', 'LTL', 'FTL'] as const
export type ShipmentModeKey = (typeof SHIPMENT_MODES)[number]

export const STORAGE_CLASSES = ['AMBIENT', 'PROTECT_HEAT', 'CHILLED', 'FROZEN'] as const
export type StorageClassKey = (typeof STORAGE_CLASSES)[number]

/** HazmatClass minus NONE — an empty hazmatAllowed list means "NONE only". */
export const HAZMAT_CLASSES = ['LQ_FLAMMABLE', 'AEROSOL_2_1', 'DRY_ICE_AIR'] as const
export type HazmatClassKey = (typeof HAZMAT_CLASSES)[number]

export const STORAGE_CLASS_LABEL: Record<StorageClassKey, string> = {
  AMBIENT: 'Ambient',
  PROTECT_HEAT: 'Protect heat',
  CHILLED: 'Chilled',
  FROZEN: 'Frozen',
}

export const HAZMAT_LABEL: Record<HazmatClassKey, string> = {
  LQ_FLAMMABLE: 'LQ flammable',
  AEROSOL_2_1: 'Aerosol 2.1',
  DRY_ICE_AIR: 'Dry ice (air)',
}
