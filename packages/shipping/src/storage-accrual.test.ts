import { describe, expect, it } from 'vitest'

import { addBusinessDays, computeStorageAccrual } from './storage-accrual'
import type { StorageFeeSnapshot } from './storage-accrual'

const snapshot: StorageFeeSnapshot = {
  billingUnit: 'PALLET_MONTH',
  rateCents: 1500, // $15/pallet/mo
  graceDays: 10,
  minMonthlyCents: 2000,
  pickFeeCents: 180,
  packFeeCents: 95,
  referralFeeBps: 500, // 5%
}

describe('addBusinessDays', () => {
  it('skips weekends: Thu 2026-07-02 + 10 business days = Thu 2026-07-16', () => {
    const d = addBusinessDays(new Date('2026-07-02T12:00:00'), 10)
    expect(d.toISOString().slice(0, 10)).toBe('2026-07-16')
  })
})

describe('computeStorageAccrual', () => {
  const startedAt = new Date('2026-07-02T12:00:00')

  it('inside the grace period nothing accrues', () => {
    const a = computeStorageAccrual({ snapshot, startedAt, asOf: new Date('2026-07-10T12:00:00'), billableUnits: 4, pickCount: 0 })
    expect(a.monthsAccrued).toBe(0)
    expect(a.totalCents).toBe(0)
  })

  it('first day past grace bills a full month (any started month bills)', () => {
    const a = computeStorageAccrual({ snapshot, startedAt, asOf: new Date('2026-07-17T12:00:00'), billableUnits: 4, pickCount: 0 })
    expect(a.monthsAccrued).toBe(1)
    expect(a.storageCents).toBe(6000) // 4 pallets × $15
  })

  it('minimum monthly binds when units are small', () => {
    const a = computeStorageAccrual({ snapshot, startedAt, asOf: new Date('2026-07-17T12:00:00'), billableUnits: 1, pickCount: 0 })
    expect(a.storageCents).toBe(2000) // min $20 > 1×$15
  })

  it('second 30-day block starts month 2; picks add fees; referral split correct', () => {
    const a = computeStorageAccrual({ snapshot, startedAt, asOf: new Date('2026-08-20T12:00:00'), billableUnits: 4, pickCount: 10 })
    expect(a.monthsAccrued).toBe(2)
    expect(a.storageCents).toBe(12000)
    expect(a.pickPackCents).toBe(2750) // 10 × ($1.80+$0.95)
    expect(a.totalCents).toBe(14750)
    expect(a.platformFeeCents).toBe(738) // 5%
    expect(a.partnerNetCents).toBe(14012)
  })
})
