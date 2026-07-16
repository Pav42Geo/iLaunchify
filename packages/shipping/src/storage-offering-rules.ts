// FC-1 (docs/FC_MONETIZATION_GAP_2026-07-15.md §2) - storage-offering validation, PURE.
//
// WHY THIS FILE EXISTS: these rules were written once, in
// apps/partner/.../settings/storage/actions.ts. That route was SUPERSEDED on
// 2026-07-13 (it is now a bare `redirect('/services')`), and the replacement
// editor did NOT inherit them. Four guards were silently lost, and because the
// old file still compiles and still reads correctly, nothing pointed at the gap.
//
// Putting them in a pure, pinned module is the actual fix: a rule that lives in
// one route dies with that route. This package is Prisma-free by design, so these
// pins run in scripts/run-vitest-suites.mjs with no DB.
//
// THE FOUR GUARDS, and what each one is actually protecting:
//
//   1. RATE BANDS (docs/LOGISTICS_AND_FULFILLMENT.md §10, decision L9: "Partner
//      rates constrained to admin-approved bands"). Without it a partner saves
//      $500/pallet/month and the creator eats it, because the rate is snapshotted
//      onto StorageAgreement.feeSnapshotJson and billed from there.
//
//   2. COLD-CHAIN CLASS GATE, and this is the one that matters most. CHILLED and
//      FROZEN are admin-gated LogisticsSettings, seeded `enabled: false` with the
//      note "L1: enable once a cold FC partner + reefer rail + insurance rider are
//      live". Storage class is a HARD filter in destination selection
//      (orders/destination-options.ts:75 `!m.storageClasses.includes(product.storageClass)`),
//      so a partner who self-declares FROZEN becomes an ELIGIBLE HOLD DESTINATION
//      for frozen product. That is a spoilage and insurance exposure, not a
//      pricing bug, and the superseded route was the only thing preventing it.
//
//   3. OFFERING COHERENCE: offering storage with no rate or no billing unit
//      produces an agreement that bills $0 forever.
//
//   4. ON-DEMAND NEEDS PARCEL: onDemandEnabled without canShipParcel is the
//      classic co-man disqualifier (they do freight only), and it strands orders.

/** Cents per billing unit per month. L9 research anchors: co-packer pallets
    $12-20/mo ambient; Printful $0.70/cu ft/mo. Bands are deliberately wider than
    the anchors: they catch fat-finger and abuse, not negotiation. */
export const STORAGE_RATE_BANDS = {
  PALLET_MONTH: { minCents: 500, maxCents: 15_000 }, // $5.00 - $150.00 / pallet / mo
  CUFT_MONTH: { minCents: 30, maxCents: 300 }, // $0.30 - $3.00 / cu ft / mo
} as const

export type StorageBillingUnitKey = keyof typeof STORAGE_RATE_BANDS
export const BILLING_UNITS = Object.keys(STORAGE_RATE_BANDS) as StorageBillingUnitKey[]

/** Every class the schema knows. Not every class a partner may self-declare. */
export const ALL_STORAGE_CLASSES = ['AMBIENT', 'PROTECT_HEAT', 'CHILLED', 'FROZEN'] as const
export type StorageClassKey = (typeof ALL_STORAGE_CLASSES)[number]

/** Classes needing no admin gate. The rest are cold chain (see guard 2). */
export const ALWAYS_SELF_SERVE_CLASSES: readonly string[] = ['AMBIENT', 'PROTECT_HEAT']

/** Industry-norm free grace after production delivery (LOGISTICS §4). */
export const DEFAULT_FREE_GRACE_DAYS = 10

export interface StorageOfferingDraft {
  offersStorage?: boolean
  storageClasses?: string[]
  storageBillingUnit?: string | null
  storageRateCents?: number | null
  storageMinMonthlyCents?: number | null
  storageFreeGraceDays?: number | null
  pickFeeCents?: number | null
  packFeeCents?: number | null
  maxDwellDays?: number | null
  canShipParcel?: boolean
  onDemandEnabled?: boolean
}

export interface StorageOfferingContext {
  /**
   * Cold-chain classes the admin has actually enabled, from the LogisticsSetting
   * gates (`storage_class:CHILLED` / `storage_class:FROZEN`). Passed IN rather than
   * hardcoded, because the superseded route hardcoded `['AMBIENT','PROTECT_HEAT']`
   * and therefore ignored the admin gates it was standing in for. Default: none.
   */
  enabledColdClasses?: readonly string[]
}

export type StorageOfferingCheck = { ok: true } | { ok: false; error: string }

const money = (c: number) => `$${(c / 100).toFixed(2)}`
const isNonNegInt = (v: number | null | undefined) =>
  v === null || v === undefined || (Number.isInteger(v) && v >= 0)

/**
 * Validate a storage offering. Pure: no prisma, no clock, no I/O.
 * Returns the FIRST failure, with a message the partner can act on.
 */
export function validateStorageOffering(
  input: StorageOfferingDraft,
  ctx: StorageOfferingContext = {},
): StorageOfferingCheck {
  const allowedClasses = new Set<string>([
    ...ALWAYS_SELF_SERVE_CLASSES,
    ...(ctx.enabledColdClasses ?? []),
  ])

  // ---- Guard 2: class gate (cold chain is admin-gated) ----
  const classes = input.storageClasses ?? []
  for (const c of classes) {
    if (!(ALL_STORAGE_CLASSES as readonly string[]).includes(c)) {
      return { ok: false, error: `Unknown storage class "${c}".` }
    }
    if (!allowedClasses.has(c)) {
      return {
        ok: false,
        error:
          'Chilled and frozen storage are coming soon. Cold chain is enabled per class by iLaunchify ops once a reefer rail and insurance rider are in place.',
      }
    }
  }

  // ---- Guard 1: billing unit + rate band (L9) ----
  const unit = input.storageBillingUnit
  if (unit !== null && unit !== undefined && !(BILLING_UNITS as readonly string[]).includes(unit)) {
    return { ok: false, error: 'Pick a valid storage billing unit.' }
  }
  if (input.storageRateCents !== null && input.storageRateCents !== undefined) {
    if (!Number.isInteger(input.storageRateCents) || input.storageRateCents <= 0) {
      return { ok: false, error: 'Storage rate must be a positive amount.' }
    }
    if (unit === null || unit === undefined) {
      return {
        ok: false,
        error: 'Choose a billing unit (per pallet or per cubic foot) before setting a rate.',
      }
    }
    const band = STORAGE_RATE_BANDS[unit as StorageBillingUnitKey]
    if (input.storageRateCents < band.minCents || input.storageRateCents > band.maxCents) {
      const label = unit === 'PALLET_MONTH' ? 'pallet' : 'cubic foot'
      return {
        ok: false,
        error: `Storage rates must be between ${money(band.minCents)} and ${money(band.maxCents)} per ${label} per month (the admin-approved band). Contact iLaunchify ops if your pricing sits outside it.`,
      }
    }
  }

  // ---- Guard 3: offering coherence ----
  if (input.offersStorage === true) {
    if (classes.length === 0) {
      return { ok: false, error: 'Pick at least one storage class you can hold.' }
    }
    if (
      unit === null ||
      unit === undefined ||
      input.storageRateCents === null ||
      input.storageRateCents === undefined
    ) {
      return { ok: false, error: 'Set a billing unit and a monthly storage rate to offer storage.' }
    }
  }

  // ---- Guard 4: on-demand needs parcel ----
  if (input.onDemandEnabled === true && input.canShipParcel === false) {
    return {
      ok: false,
      error: 'Ship-on-demand needs parcel capability. Turn on "We can ship parcels" first.',
    }
  }

  // ---- Plain numeric sanity ----
  if (!isNonNegInt(input.storageMinMonthlyCents))
    return { ok: false, error: 'Monthly minimum must be a non-negative amount.' }
  if (!isNonNegInt(input.storageFreeGraceDays))
    return { ok: false, error: 'Free grace days must be a non-negative whole number.' }
  if (!isNonNegInt(input.pickFeeCents))
    return { ok: false, error: 'Pick fee must be a non-negative amount.' }
  if (!isNonNegInt(input.packFeeCents))
    return { ok: false, error: 'Pack fee must be a non-negative amount.' }
  if (!isNonNegInt(input.maxDwellDays))
    return { ok: false, error: 'Max dwell days must be a non-negative whole number.' }

  return { ok: true }
}
