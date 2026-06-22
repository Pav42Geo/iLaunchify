// Unit tests for the sample-credit engine (sample-credit.ts).
//
// Money-adjacent: a paid SAMPLE order can mint credit toward the creator's first
// production order. These pin the mint caps + expiry, usability rules, and the
// FIFO apply plan (credit never exceeds what's owed).

import { describe, it, expect } from 'vitest'
import {
  mintSampleCredit,
  isUsableCredit,
  availableSampleCreditCents,
  applySampleCredit,
  SAMPLE_CREDIT_EXPIRY_DAYS,
  type SampleCreditEntry,
} from './sample-credit'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000 // fixed epoch for determinism

describe('mintSampleCredit', () => {
  it('mints nothing when the option does not grant credit', () => {
    expect(mintSampleCredit(5000, { creditTowardFirstOrder: false, creditCapCents: null })).toBeNull()
  })

  it('mints the full subtotal when uncapped', () => {
    const m = mintSampleCredit(5000, { creditTowardFirstOrder: true, creditCapCents: null }, NOW)
    expect(m?.amountCents).toBe(5000)
    expect(m?.expiresAtMs).toBe(NOW + SAMPLE_CREDIT_EXPIRY_DAYS * DAY)
  })

  it('caps at the partner creditCapCents', () => {
    const m = mintSampleCredit(5000, { creditTowardFirstOrder: true, creditCapCents: 2000 }, NOW)
    expect(m?.amountCents).toBe(2000)
  })

  it('caps at the platform ceiling (min of all caps)', () => {
    const m = mintSampleCredit(
      5000,
      { creditTowardFirstOrder: true, creditCapCents: 4000 },
      NOW,
      { platformCapCents: 1500 },
    )
    expect(m?.amountCents).toBe(1500)
  })

  it('honors a custom expiry window', () => {
    const m = mintSampleCredit(5000, { creditTowardFirstOrder: true, creditCapCents: null }, NOW, { expiryDays: 30 })
    expect(m?.expiresAtMs).toBe(NOW + 30 * DAY)
  })

  it('returns null for a zero / negative subtotal', () => {
    expect(mintSampleCredit(0, { creditTowardFirstOrder: true, creditCapCents: null })).toBeNull()
    expect(mintSampleCredit(-100, { creditTowardFirstOrder: true, creditCapCents: null })).toBeNull()
  })
})

describe('isUsableCredit / availableSampleCreditCents', () => {
  const base: SampleCreditEntry = { id: 'c1', remainingCents: 1000, status: 'AVAILABLE', expiresAt: null }

  it('is usable when AVAILABLE, positive, and unexpired', () => {
    expect(isUsableCredit(base, NOW)).toBe(true)
    expect(isUsableCredit({ ...base, expiresAt: new Date(NOW + DAY).toISOString() }, NOW)).toBe(true)
  })

  it('is not usable when non-AVAILABLE, empty, or expired', () => {
    expect(isUsableCredit({ ...base, status: 'APPLIED' }, NOW)).toBe(false)
    expect(isUsableCredit({ ...base, status: 'VOID' }, NOW)).toBe(false)
    expect(isUsableCredit({ ...base, remainingCents: 0 }, NOW)).toBe(false)
    expect(isUsableCredit({ ...base, expiresAt: new Date(NOW - DAY).toISOString() }, NOW)).toBe(false)
  })

  it('sums only the usable balance', () => {
    const credits: SampleCreditEntry[] = [
      { id: 'a', remainingCents: 1000, status: 'AVAILABLE', expiresAt: null },
      { id: 'b', remainingCents: 500, status: 'AVAILABLE', expiresAt: new Date(NOW - DAY).toISOString() }, // expired
      { id: 'c', remainingCents: 2000, status: 'APPLIED', expiresAt: null }, // wrong status
      { id: 'd', remainingCents: 250, status: 'AVAILABLE', expiresAt: null },
    ]
    expect(availableSampleCreditCents(credits, NOW)).toBe(1250)
  })
})

describe('applySampleCredit', () => {
  const credits: SampleCreditEntry[] = [
    { id: 'a', remainingCents: 1000, status: 'AVAILABLE', expiresAt: null },
    { id: 'b', remainingCents: 2000, status: 'AVAILABLE', expiresAt: null },
  ]

  it('applies credit up to the subtotal, never more', () => {
    const r = applySampleCredit(5000, credits, NOW)
    expect(r.appliedCents).toBe(3000) // 1000 + 2000
    expect(r.remainingDueCents).toBe(2000)
    expect(r.consumed.map((c) => c.id)).toEqual(['a', 'b'])
    expect(r.consumed.every((c) => c.fullyUsed)).toBe(true)
  })

  it('partially consumes the last credit in FIFO order', () => {
    const r = applySampleCredit(1500, credits, NOW) // a fully (1000), b partial (500)
    expect(r.appliedCents).toBe(1500)
    expect(r.remainingDueCents).toBe(0)
    expect(r.consumed).toEqual([
      { id: 'a', usedCents: 1000, newRemainingCents: 0, fullyUsed: true },
      { id: 'b', usedCents: 500, newRemainingCents: 1500, fullyUsed: false },
    ])
  })

  it('never lets credit exceed what is owed', () => {
    const r = applySampleCredit(700, credits, NOW)
    expect(r.appliedCents).toBe(700)
    expect(r.remainingDueCents).toBe(0)
    expect(r.consumed).toEqual([{ id: 'a', usedCents: 700, newRemainingCents: 300, fullyUsed: false }])
  })

  it('skips unusable credits', () => {
    const mixed: SampleCreditEntry[] = [
      { id: 'x', remainingCents: 500, status: 'VOID', expiresAt: null },
      { id: 'y', remainingCents: 800, status: 'AVAILABLE', expiresAt: null },
    ]
    const r = applySampleCredit(5000, mixed, NOW)
    expect(r.appliedCents).toBe(800)
    expect(r.consumed.map((c) => c.id)).toEqual(['y'])
  })

  it('applies nothing to a zero subtotal', () => {
    const r = applySampleCredit(0, credits, NOW)
    expect(r.appliedCents).toBe(0)
    expect(r.consumed).toEqual([])
  })
})
