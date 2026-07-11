'use server'

// Partner storage-offering editor server action (Phase L1c).
// Manages the PartnerService storage capability fields added in Logistics L0
// (docs/LOGISTICS_AND_FULFILLMENT.md §4 hold-at-manufacturer + §9 partner
// /settings/storage). Applies to the partner's PRODUCING service
// (MANUFACTURING / COPACKING) — WAREHOUSE nodes are admin-onboarded.
//
// AUTH: actor resolved via the centralized requirePartnerActor() ownership
// guard (packages/auth — docs/SECURITY_ARCHITECTURE.md Tier 1.1, threat #1
// tenant isolation). The editor is service-scoped: we load the partner's own
// producing-service ids and refuse any client-supplied serviceId that isn't
// in that set. We never fetch-then-compare on an untrusted id.

import { prisma } from '@ilaunchify/db'
import type { StorageBillingUnit } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
// Server-safe subpath — the pure money.ts, NOT the @ilaunchify/ui barrel (which
// re-exports 'use client' components that must not be pulled into a server action).
import { formatCents } from '@ilaunchify/ui/money'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

// -----------------------------------------------------------------------------
// Admin-approved rate bands — docs/LOGISTICS_AND_FULFILLMENT.md §10 L9:
// "Partner rates constrained to admin-approved bands" (research anchors:
// co-packer pallets $12–20/mo ambient; Printful $0.70/cu ft/mo). Cents per
// billing unit per month. Rates outside the band are rejected with a clear
// message — an admin conversation, not a form fight.
// -----------------------------------------------------------------------------

const STORAGE_RATE_BANDS: Record<StorageBillingUnit, { minCents: number; maxCents: number }> = {
  PALLET_MONTH: { minCents: 500, maxCents: 15_000 }, // $5.00 – $150.00 / pallet / mo
  CUFT_MONTH: { minCents: 30, maxCents: 300 }, // $0.30 – $3.00 / cu ft / mo
}

/** Storage classes a partner can self-serve today. CHILLED/FROZEN are
    admin-gated (LogisticsSetting storage_class:* toggles — L1 lock). */
const SELF_SERVE_STORAGE_CLASSES = ['AMBIENT', 'PROTECT_HEAT'] as const

const BILLING_UNITS: StorageBillingUnit[] = ['PALLET_MONTH', 'CUFT_MONTH']

/** Producing service types this editor applies to. */
const PRODUCING_TYPES = ['MANUFACTURING', 'COPACKING'] as const

/** Industry-norm default free grace after production delivery (§4). */
const DEFAULT_FREE_GRACE_DAYS = 10

const PARTNER_ACTOR_ERRORS: Record<string, string> = {
  NOT_A_PARTNER: 'Only partners can manage storage settings.',
  PARTNER_NOT_FOUND: 'Partner profile not found.',
}

export interface StorageSettingsInput {
  offersStorage: boolean
  /** StorageClass values — AMBIENT / PROTECT_HEAT only in V1 (cold is admin-gated). */
  storageClasses: string[]
  storageBillingUnit: StorageBillingUnit | null
  /** Per billing unit per month, cents. Must sit inside the admin-approved band. */
  storageRateCents: number | null
  storageMinMonthlyCents: number | null
  storageFreeGraceDays: number | null
  pickFeeCents: number | null
  packFeeCents: number | null
  canShipParcel: boolean
  onDemandEnabled: boolean
  maxDwellDays: number | null
}

type Result = { ok: true } | { ok: false; error: string }

function isNonNegativeInt(v: number | null): boolean {
  return v === null || (Number.isInteger(v) && v >= 0)
}


/**
 * Save the storage offering for one of the partner's own PRODUCING services.
 * Tenant isolation: serviceId must be a member of the partner's producing
 * service ids — validated via includes(), never trusted from the client.
 */
export async function savePartnerStorageSettings(
  serviceId: string,
  input: StorageSettingsInput,
): Promise<Result> {
  const actor = await requirePartnerActor()
  if (!actor.ok) {
    return { ok: false, error: PARTNER_ACTOR_ERRORS[actor.error] ?? actor.error }
  }

  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId, type: { in: [...PRODUCING_TYPES] } },
    select: { id: true, type: true },
  })
  const service = services.find((s) => s.id === serviceId)
  if (!service) {
    return { ok: false, error: 'That service is not yours (or is not a producing service).' }
  }

  // ---- Storage classes: AMBIENT + PROTECT_HEAT only (cold chain is admin-gated) ----
  const classes = [...new Set(input.storageClasses)]
  for (const c of classes) {
    if (!(SELF_SERVE_STORAGE_CLASSES as readonly string[]).includes(c)) {
      return {
        ok: false,
        error:
          c === 'CHILLED' || c === 'FROZEN'
            ? 'Chilled and frozen storage are coming soon — cold chain is enabled per class by iLaunchify ops.'
            : `Unknown storage class "${c}".`,
      }
    }
  }

  // ---- Billing unit + rate band (docs/LOGISTICS_AND_FULFILLMENT.md L9) ----
  if (input.storageBillingUnit !== null && !BILLING_UNITS.includes(input.storageBillingUnit)) {
    return { ok: false, error: 'Pick a valid storage billing unit.' }
  }
  if (input.storageRateCents !== null) {
    if (!Number.isInteger(input.storageRateCents) || input.storageRateCents <= 0) {
      return { ok: false, error: 'Storage rate must be a positive amount.' }
    }
    if (input.storageBillingUnit === null) {
      return { ok: false, error: 'Choose a billing unit (per pallet or per cubic foot) before setting a rate.' }
    }
    const band = STORAGE_RATE_BANDS[input.storageBillingUnit]
    if (input.storageRateCents < band.minCents || input.storageRateCents > band.maxCents) {
      const unitLabel = input.storageBillingUnit === 'PALLET_MONTH' ? 'pallet' : 'cubic foot'
      return {
        ok: false,
        error: `Storage rates must be between ${formatCents(band.minCents)} and ${formatCents(band.maxCents)} per ${unitLabel} per month (the admin-approved band). Contact iLaunchify ops if your pricing sits outside it.`,
      }
    }
  }

  // ---- Offering coherence ----
  if (input.offersStorage) {
    if (classes.length === 0) {
      return { ok: false, error: 'Pick at least one storage class you can hold.' }
    }
    if (input.storageBillingUnit === null || input.storageRateCents === null) {
      return { ok: false, error: 'Set a billing unit and a monthly storage rate to offer storage.' }
    }
  }
  if (input.onDemandEnabled && !input.canShipParcel) {
    return { ok: false, error: 'Ship-on-demand needs parcel capability — turn on "We can ship parcels" first.' }
  }

  // ---- Plain numeric sanity ----
  if (!isNonNegativeInt(input.storageMinMonthlyCents)) return { ok: false, error: 'Monthly minimum must be a non-negative amount.' }
  if (!isNonNegativeInt(input.storageFreeGraceDays)) return { ok: false, error: 'Free grace days must be a non-negative whole number.' }
  if (!isNonNegativeInt(input.pickFeeCents)) return { ok: false, error: 'Pick fee must be a non-negative amount.' }
  if (!isNonNegativeInt(input.packFeeCents)) return { ok: false, error: 'Pack fee must be a non-negative amount.' }
  if (!isNonNegativeInt(input.maxDwellDays)) return { ok: false, error: 'Max dwell days must be a non-negative whole number.' }

  const data = {
    offersStorage: input.offersStorage,
    storageClasses: classes,
    storageBillingUnit: input.storageBillingUnit,
    storageRateCents: input.storageRateCents,
    storageMinMonthlyCents: input.storageMinMonthlyCents,
    storageFreeGraceDays:
      input.offersStorage && input.storageFreeGraceDays === null
        ? DEFAULT_FREE_GRACE_DAYS
        : input.storageFreeGraceDays,
    pickFeeCents: input.pickFeeCents,
    packFeeCents: input.packFeeCents,
    canShipParcel: input.canShipParcel,
    onDemandEnabled: input.onDemandEnabled,
    maxDwellDays: input.maxDwellDays,
  }

  try {
    await prisma.partnerService.update({ where: { id: service.id }, data })
    await logAuditAs(actor.user, {
      entityType: 'PartnerService',
      entityId: service.id,
      action: 'PARTNER_STORAGE_SETTINGS_UPDATED',
      payload: { serviceType: service.type, ...data },
    })
    revalidatePath('/settings/storage')
    return { ok: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[storage-settings] save failed:', (err as Error).message)
    return { ok: false, error: 'Could not save storage settings. Please try again.' }
  }
}
