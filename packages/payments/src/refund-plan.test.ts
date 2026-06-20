import { describe, it, expect } from 'vitest'
import { planRefund } from './refund-plan'

describe('planRefund', () => {
  it('zero refund → all zero', () => {
    const p = planRefund({ chargeAmountCents: 10_000, applicationFeeCents: 500, transfers: [], refundCents: 0 })
    expect(p.refundCents).toBe(0)
    expect(p.platformShareCents).toBe(0)
    expect(p.reversals).toEqual([])
    expect(p.partnerRecoupCents).toBe(0)
  })

  it('full refund, no transfers → platform funds it all', () => {
    const p = planRefund({ chargeAmountCents: 10_000, applicationFeeCents: 500, transfers: [], refundCents: 10_000 })
    expect(p.refundCents).toBe(10_000)
    expect(p.platformShareCents).toBe(10_000)
    expect(p.isFullRefund).toBe(true)
  })

  it('full refund → reversals cover partner transfers, platform absorbs its fee share', () => {
    const p = planRefund({
      chargeAmountCents: 10_000,
      applicationFeeCents: 500,
      transfers: [
        { transferId: 't1', amountCents: 5_000, status: 'COMPLETED' },
        { transferId: 't2', amountCents: 4_500, status: 'COMPLETED' },
      ],
      refundCents: 10_000,
    })
    expect(p.reversals).toEqual([
      { transferId: 't1', amountCents: 5_000, action: 'REVERSE' },
      { transferId: 't2', amountCents: 4_500, action: 'REVERSE' },
    ])
    expect(p.partnerRecoupCents).toBe(9_500)
    expect(p.platformShareCents).toBe(500) // the withheld application fee
  })

  it('partial refund → proportional reversal', () => {
    const p = planRefund({
      chargeAmountCents: 10_000,
      applicationFeeCents: 500,
      transfers: [{ transferId: 't1', amountCents: 9_500, status: 'COMPLETED' }],
      refundCents: 5_000,
    })
    expect(p.reversals[0]).toEqual({ transferId: 't1', amountCents: 4_750, action: 'REVERSE' })
    expect(p.platformShareCents).toBe(250)
  })

  it('not-yet-sent transfer → CANCEL action', () => {
    const p = planRefund({
      chargeAmountCents: 10_000,
      applicationFeeCents: 0,
      transfers: [{ transferId: 't1', amountCents: 9_000, status: 'PENDING' }],
      refundCents: 10_000,
    })
    expect(p.reversals[0]).toEqual({ transferId: 't1', amountCents: 9_000, action: 'CANCEL' })
    expect(p.platformShareCents).toBe(1_000)
  })

  it('refund above the charge is clamped', () => {
    const p = planRefund({ chargeAmountCents: 10_000, applicationFeeCents: 0, transfers: [], refundCents: 99_999 })
    expect(p.refundCents).toBe(10_000)
    expect(p.isFullRefund).toBe(true)
  })

  it('rounding never lets reversals exceed the refund (platform absorbs remainder)', () => {
    const p = planRefund({
      chargeAmountCents: 3,
      applicationFeeCents: 0,
      transfers: [
        { transferId: 'a', amountCents: 1, status: 'COMPLETED' },
        { transferId: 'b', amountCents: 1, status: 'COMPLETED' },
        { transferId: 'c', amountCents: 1, status: 'COMPLETED' },
      ],
      refundCents: 2,
    })
    expect(p.partnerRecoupCents).toBeLessThanOrEqual(2)
    expect(p.platformShareCents).toBeGreaterThanOrEqual(0)
    expect(p.partnerRecoupCents + p.platformShareCents).toBe(2)
  })
})
