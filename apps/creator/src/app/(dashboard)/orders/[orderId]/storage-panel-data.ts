// Phase L1.2a — server-side assembly for the "Stored at manufacturer" panel
// (docs/LOGISTICS_AND_FULFILLMENT.md §4 + §9 · HOLD_AT_MANUFACTURER orders).
//
// Everything here runs on the server (page.tsx) and hands the client panel a
// fully-serialized payload — the client component never touches Prisma or the
// fee-snapshot JSON. Accrual math comes from @ilaunchify/shipping's pure
// computeStorageAccrual, always fed from the feeSnapshotJson frozen at
// agreement time (legal reproducibility), never the partner's current rates.

import { prisma } from '@ilaunchify/db'
import { computeStorageAccrual, type StorageFeeSnapshot } from '@ilaunchify/shipping'

export interface StorageReleaseRow {
  id: string
  status: 'REQUESTED' | 'PICKING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
  quantity: number
  destinationType: string
  destinationSummary: string
  /** "CARRIER · NUMBER" once the partner marks SHIPPED; null before. */
  tracking: string | null
  requestedAt: string
}

export interface StoragePanelData {
  orderId: string
  agreementId: string
  partnerName: string
  mode: 'ON_DEMAND' | 'STOCK_RELEASE'
  status: 'ACTIVE' | 'RELEASING' | 'CLOSED'
  unitsRemaining: number
  palletsRemaining: number | null
  startedAt: string
  endedAt: string | null
  /** Null when feeSnapshotJson failed the defensive parse (never blocks the page). */
  accrual: {
    graceEndsOn: string
    monthsAccrued: number
    storageCents: number
    pickPackCents: number
    totalCents: number
  } | null
  /** Creator's default saved address — the V1 release destination. Null = none saved. */
  defaultAddress: { label: string; summary: string } | null
  releases: StorageReleaseRow[]
}

// -----------------------------------------------------------------------------
// Defensive feeSnapshotJson parse — the DB column is Json (unknown at the type
// level) and was written by checkout; never trust its shape at read time.
// -----------------------------------------------------------------------------

function parseStorageFeeSnapshot(v: unknown): StorageFeeSnapshot | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const billingUnit = o.billingUnit
  if (billingUnit !== 'PALLET_MONTH' && billingUnit !== 'CUFT_MONTH') return null
  const num = (k: string): number | null => {
    const n = o[k]
    return typeof n === 'number' && Number.isFinite(n) ? n : null
  }
  const rateCents = num('rateCents')
  const graceDays = num('graceDays')
  const minMonthlyCents = num('minMonthlyCents')
  const pickFeeCents = num('pickFeeCents')
  const packFeeCents = num('packFeeCents')
  const referralFeeBps = num('referralFeeBps')
  if (
    rateCents === null ||
    graceDays === null ||
    minMonthlyCents === null ||
    pickFeeCents === null ||
    packFeeCents === null ||
    referralFeeBps === null
  ) {
    return null
  }
  return { billingUnit, rateCents, graceDays, minMonthlyCents, pickFeeCents, packFeeCents, referralFeeBps }
}

/** Human summary of a release's destinationJson address snapshot (defensive). */
function summarizeDestination(v: unknown): string {
  if (typeof v !== 'object' || v === null) return 'My address'
  const o = v as Record<string, unknown>
  const str = (k: string): string | null => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : null)
  const line1 = str('addressLine1')
  const city = str('city')
  const state = str('state')
  if (!line1 && !city) return 'My address'
  return [line1, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
}

/** "CARRIER · NUMBER" from destinationJson.tracking (written at SHIPPED). */
function summarizeTracking(v: unknown): string | null {
  if (typeof v !== 'object' || v === null) return null
  const t = (v as Record<string, unknown>).tracking
  if (typeof t !== 'object' || t === null) return null
  const o = t as Record<string, unknown>
  const carrier = typeof o.carrier === 'string' ? o.carrier : null
  const number = typeof o.number === 'string' ? o.number : null
  if (!carrier && !number) return null
  return [carrier, number].filter(Boolean).join(' · ')
}

// -----------------------------------------------------------------------------
// Loader — called from the order-detail RSC after the creator-ownership check
// (the page already scoped the Order query to creatorUserId).
// -----------------------------------------------------------------------------

export async function getStoragePanelData(
  orderId: string,
  creatorUserId: string,
): Promise<StoragePanelData | null> {
  const agreement = await prisma.storageAgreement.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    include: {
      partnerService: { select: { partner: { select: { companyName: true } } } },
      releases: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!agreement) return null

  const snapshot = parseStorageFeeSnapshot(agreement.feeSnapshotJson)

  // Billable units — V1: use palletsRemaining when the partner has recorded a
  // pallet count; otherwise fall back to 1 billable unit. Real pallet/cu-ft
  // counts land with the receiving-manifest flow (L1.2b) — until then this is
  // deliberately a floor, and the panel labels the number "estimated".
  const billableUnits = agreement.palletsRemaining ?? 1

  // Pick/pack fees only accrue in ON_DEMAND mode, per completed pick. V1
  // approximates completed picks as DELIVERED releases; STOCK_RELEASE freight
  // pulls carry no per-pick fee.
  const pickCount =
    agreement.mode === 'ON_DEMAND'
      ? agreement.releases.filter((r) => r.status === 'DELIVERED').length
      : 0

  const accrual = snapshot
    ? computeStorageAccrual({
        snapshot,
        startedAt: agreement.startedAt,
        // A CLOSED agreement stops accruing at endedAt; open ones accrue to now.
        asOf: agreement.endedAt ?? new Date(),
        billableUnits,
        pickCount,
      })
    : null

  const defaultAddress = await prisma.creatorSavedAddress.findFirst({
    where: { creatorUserId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })

  return {
    orderId,
    agreementId: agreement.id,
    partnerName: agreement.partnerService.partner.companyName,
    mode: agreement.mode,
    status: agreement.status,
    unitsRemaining: agreement.unitsRemaining,
    palletsRemaining: agreement.palletsRemaining,
    startedAt: agreement.startedAt.toISOString(),
    endedAt: agreement.endedAt?.toISOString() ?? null,
    accrual: accrual
      ? {
          graceEndsOn: accrual.graceEndsOn.toISOString(),
          monthsAccrued: accrual.monthsAccrued,
          storageCents: accrual.storageCents,
          pickPackCents: accrual.pickPackCents,
          totalCents: accrual.totalCents,
        }
      : null,
    defaultAddress: defaultAddress
      ? {
          label: defaultAddress.label,
          summary: `${defaultAddress.addressLine1}, ${defaultAddress.city}${defaultAddress.state ? `, ${defaultAddress.state}` : ''} ${defaultAddress.postalCode}`,
        }
      : null,
    releases: agreement.releases.map((r) => ({
      id: r.id,
      status: r.status,
      quantity: r.quantity,
      destinationType: r.destinationType,
      destinationSummary: summarizeDestination(r.destinationJson),
      tracking: summarizeTracking(r.destinationJson),
      requestedAt: r.createdAt.toISOString(),
    })),
  }
}
