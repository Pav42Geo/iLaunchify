/**
 * Phase L1.2 — hold-at-manufacturer storage accrual math
 * (docs/LOGISTICS_AND_FULFILLMENT.md §4, decision L9). PURE + deterministic:
 * computed from the StorageAgreement.feeSnapshotJson frozen at agreement time
 * (legal reproducibility) — never from the partner's CURRENT rates.
 *
 * Billing model (L9): monthly in arrears; free grace period in BUSINESS days
 * after production delivery; then whole calendar months (any started month
 * bills in full — co-packer norm); per-month charge = max(rate × units,
 * minMonthly). Charge EXECUTION stays gated behind the payments-verification
 * checklist — this module only computes.
 */

export interface StorageFeeSnapshot {
  billingUnit: 'PALLET_MONTH' | 'CUFT_MONTH'
  rateCents: number
  graceDays: number // business days
  minMonthlyCents: number
  pickFeeCents: number
  packFeeCents: number
  referralFeeBps: number
}

export interface StorageAccrualInput {
  snapshot: StorageFeeSnapshot
  /** Storage start (= production delivered to storage). */
  startedAt: Date
  /** Accrual as-of date (usually now, or endedAt when closed). */
  asOf: Date
  /** Billable units: pallets for PALLET_MONTH, whole cu ft for CUFT_MONTH. */
  billableUnits: number
  /** Completed picks (ON_DEMAND) — adds pick+pack fees. */
  pickCount: number
}

export interface StorageAccrual {
  /** Date the free grace period ends (billing clock starts the next day). */
  graceEndsOn: Date
  /** Whole billing months accrued (any started month counts). */
  monthsAccrued: number
  storageCents: number
  pickPackCents: number
  totalCents: number
  /** Platform's share (referralFeeBps of total). */
  platformFeeCents: number
  partnerNetCents: number
}

/** Adds N business days (Mon–Fri; holidays out of V1 scope). */
export function addBusinessDays(start: Date, businessDays: number): Date {
  const d = new Date(start)
  let remaining = businessDays
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) remaining--
  }
  return d
}

export function computeStorageAccrual(input: StorageAccrualInput): StorageAccrual {
  const { snapshot } = input
  const graceEndsOn = addBusinessDays(input.startedAt, Math.max(0, snapshot.graceDays))

  let monthsAccrued = 0
  if (input.asOf.getTime() > graceEndsOn.getTime()) {
    const msPerDay = 86_400_000
    const daysBilled = Math.ceil((input.asOf.getTime() - graceEndsOn.getTime()) / msPerDay)
    monthsAccrued = Math.max(1, Math.ceil(daysBilled / 30)) // 30-day billing months; any started month bills
  }

  const perMonth = Math.max(snapshot.rateCents * Math.max(0, input.billableUnits), snapshot.minMonthlyCents)
  const storageCents = monthsAccrued * perMonth
  const pickPackCents = input.pickCount * (snapshot.pickFeeCents + snapshot.packFeeCents)
  const totalCents = storageCents + pickPackCents
  const platformFeeCents = Math.round((totalCents * snapshot.referralFeeBps) / 10_000)

  return {
    graceEndsOn,
    monthsAccrued,
    storageCents,
    pickPackCents,
    totalCents,
    platformFeeCents,
    partnerNetCents: totalCents - platformFeeCents,
  }
}
