import { describe, it, expect } from 'vitest'
import { computeTransferPlan } from './transfer-planner'

function input(over: Partial<Parameters<typeof computeTransferPlan>[0]> = {}) {
  return {
    orderId: 'ord_1',
    subtotalCents: 10_000,
    totalCents: 11_000,
    creatorUserId: 'creator',
    manufacturer: { userId: 'mfg', costCents: 3_000 },
    printProvider: { userId: 'print', costCents: 1_000 },
    baseFeeRateBp: 1_500, // 15%
    feeFloorCents: 100,
    ...over,
  }
}

const amount = (plan: ReturnType<typeof computeTransferPlan>, type: string) =>
  plan.splits.find((s) => s.destinationType === type)!.amountCents

describe('computeTransferPlan', () => {
  it('splits subtotal into manufacturer + print + creator + application fee', () => {
    const plan = computeTransferPlan(input())
    expect(plan.applicationFeeCents).toBe(1_500) // 15% of 10,000
    expect(amount(plan, 'MANUFACTURER')).toBe(3_000)
    expect(amount(plan, 'PRINT_PROVIDER')).toBe(1_000)
    expect(amount(plan, 'CREATOR')).toBe(4_500) // 10,000 − 3,000 − 1,000 − 1,500
  })

  it('the three splits + fee reconstitute the subtotal exactly', () => {
    const plan = computeTransferPlan(input({ subtotalCents: 8_734, baseFeeRateBp: 1_234 }))
    const total =
      amount(plan, 'MANUFACTURER') +
      amount(plan, 'PRINT_PROVIDER') +
      amount(plan, 'CREATOR') +
      plan.applicationFeeCents
    expect(total).toBe(8_734)
  })

  it('applies the fee floor when the computed percentage is lower', () => {
    // 15% of 200 = 30, below the 100 floor → fee is the floor.
    const plan = computeTransferPlan(
      input({ subtotalCents: 200, manufacturer: { userId: 'mfg', costCents: 50 }, printProvider: { userId: 'print', costCents: 20 }, feeFloorCents: 100 }),
    )
    expect(plan.applicationFeeCents).toBe(100)
    expect(amount(plan, 'CREATOR')).toBe(30) // 200 − 50 − 20 − 100
  })

  it('honors a per-order fee override over the base rate', () => {
    const plan = computeTransferPlan(input({ baseFeeRateBp: 1_500, feeOverrideBp: 1_000 }))
    expect(plan.applicationFeeCents).toBe(1_000) // 10% override, not 15%
  })

  it('floors the percentage fee (no fractional cents)', () => {
    const plan = computeTransferPlan(
      input({
        subtotalCents: 1_001,
        baseFeeRateBp: 1_500,
        manufacturer: { userId: 'mfg', costCents: 100 },
        printProvider: { userId: 'print', costCents: 50 },
      }),
    )
    // 15% of 1,001 = 150.15 → floor 150
    expect(plan.applicationFeeCents).toBe(150)
  })

  it('throws rather than emit a negative creator payout', () => {
    expect(() =>
      computeTransferPlan(
        input({ subtotalCents: 1_000, manufacturer: { userId: 'mfg', costCents: 900 }, printProvider: { userId: 'print', costCents: 500 } }),
      ),
    ).toThrow(/Negative creator payout/)
  })

  it('carries orderId + totalCents through to the plan', () => {
    const plan = computeTransferPlan(input({ orderId: 'ord_X', totalCents: 12_345 }))
    expect(plan.orderId).toBe('ord_X')
    expect(plan.totalCents).toBe(12_345)
  })
})
