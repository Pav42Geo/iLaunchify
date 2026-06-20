import { describe, it, expect } from 'vitest'
import { computeCancellationOutcome } from './cancellation-refund'

describe('computeCancellationOutcome', () => {
  it('no fees → full refund of the basis', () => {
    const o = computeCancellationOutcome(10_000, { cancellationFeeBps: 0, refundProcessingFeeBps: 0 })
    expect(o).toEqual({
      basisCents: 10_000,
      cancellationFeeCents: 0,
      processingFeeCents: 0,
      refundCents: 10_000,
      feesExceededBasis: false,
    })
  })

  it('zero basis → all zeros, not flagged as exceeded', () => {
    const o = computeCancellationOutcome(0, { cancellationFeeBps: 500, refundProcessingFeeBps: 250 })
    expect(o.refundCents).toBe(0)
    expect(o.cancellationFeeCents).toBe(0)
    expect(o.feesExceededBasis).toBe(false)
  })

  it('cancellation fee only (5% of 10000) → 500 fee, 9500 refund', () => {
    const o = computeCancellationOutcome(10_000, { cancellationFeeBps: 500, refundProcessingFeeBps: 0 })
    expect(o.cancellationFeeCents).toBe(500)
    expect(o.processingFeeCents).toBe(0)
    expect(o.refundCents).toBe(9_500)
  })

  it('both fees (10% + 2.5% of 10000) → 1000 + 250, 8750 refund', () => {
    const o = computeCancellationOutcome(10_000, { cancellationFeeBps: 1_000, refundProcessingFeeBps: 250 })
    expect(o.cancellationFeeCents).toBe(1_000)
    expect(o.processingFeeCents).toBe(250)
    expect(o.refundCents).toBe(8_750)
  })

  it('fees exceeding basis are clamped → refund 0, flagged', () => {
    const o = computeCancellationOutcome(10_000, { cancellationFeeBps: 9_000, refundProcessingFeeBps: 2_000 })
    expect(o.cancellationFeeCents).toBe(9_000)
    // processing fee clamped to the 1000 remaining after the cancel fee
    expect(o.processingFeeCents).toBe(1_000)
    expect(o.refundCents).toBe(0)
    expect(o.feesExceededBasis).toBe(true)
  })

  it('rounds to the nearest cent', () => {
    // 9999 * 500 / 10000 = 499.95 → 500
    const o = computeCancellationOutcome(9_999, { cancellationFeeBps: 500, refundProcessingFeeBps: 0 })
    expect(o.cancellationFeeCents).toBe(500)
    expect(o.refundCents).toBe(9_499)
  })

  it('floors negative / NaN inputs to 0', () => {
    const neg = computeCancellationOutcome(-500, { cancellationFeeBps: 500, refundProcessingFeeBps: 0 })
    expect(neg.basisCents).toBe(0)
    expect(neg.refundCents).toBe(0)
    const nan = computeCancellationOutcome(Number.NaN, { cancellationFeeBps: Number.NaN, refundProcessingFeeBps: 0 })
    expect(nan.basisCents).toBe(0)
  })
})
