import { describe, it, expect } from 'vitest'
import { computeClawbackNetting } from './clawback-netting'

describe('computeClawbackNetting', () => {
  it('nets nothing when there are no clawbacks', () => {
    const r = computeClawbackNetting(10_000, [])
    expect(r.netAmountCents).toBe(10_000)
    expect(r.nettedCents).toBe(0)
    expect(r.applications.length).toBe(0)
  })

  it('fully recoups a single clawback smaller than the payout', () => {
    const r = computeClawbackNetting(10_000, [{ id: 'a', remainingCents: 3_000 }])
    expect(r.nettedCents).toBe(3_000)
    expect(r.netAmountCents).toBe(7_000)
    expect(r.applications).toEqual([
      { clawbackId: 'a', appliedCents: 3_000, fullyRecouped: true, newRemainingCents: 0 },
    ])
  })

  it('partially recoups a clawback larger than the payout (rest carries over)', () => {
    const r = computeClawbackNetting(2_000, [{ id: 'a', remainingCents: 5_000 }])
    expect(r.nettedCents).toBe(2_000)
    expect(r.netAmountCents).toBe(0) // whole payout consumed
    expect(r.applications).toEqual([
      { clawbackId: 'a', appliedCents: 2_000, fullyRecouped: false, newRemainingCents: 3_000 },
    ])
  })

  it('consumes multiple clawbacks in order until the payout is exhausted', () => {
    const r = computeClawbackNetting(5_000, [
      { id: 'a', remainingCents: 2_000 },
      { id: 'b', remainingCents: 2_000 },
      { id: 'c', remainingCents: 4_000 }, // only 1_000 of payout left
    ])
    expect(r.nettedCents).toBe(5_000)
    expect(r.netAmountCents).toBe(0)
    expect(r.applications).toEqual([
      { clawbackId: 'a', appliedCents: 2_000, fullyRecouped: true, newRemainingCents: 0 },
      { clawbackId: 'b', appliedCents: 2_000, fullyRecouped: true, newRemainingCents: 0 },
      { clawbackId: 'c', appliedCents: 1_000, fullyRecouped: false, newRemainingCents: 3_000 },
    ])
  })

  it('never makes the net payout negative', () => {
    const r = computeClawbackNetting(1_000, [{ id: 'a', remainingCents: 10_000 }])
    expect(r.netAmountCents).toBe(0)
    expect(r.netAmountCents).toBeGreaterThanOrEqual(0)
  })

  it('exactly nets a clawback equal to the payout (net 0, fully recouped)', () => {
    const r = computeClawbackNetting(4_000, [{ id: 'a', remainingCents: 4_000 }])
    expect(r.netAmountCents).toBe(0)
    expect(r.applications[0]).toEqual({
      clawbackId: 'a',
      appliedCents: 4_000,
      fullyRecouped: true,
      newRemainingCents: 0,
    })
  })

  it('skips zero-remaining clawbacks', () => {
    const r = computeClawbackNetting(5_000, [
      { id: 'a', remainingCents: 0 },
      { id: 'b', remainingCents: 1_500 },
    ])
    expect(r.nettedCents).toBe(1_500)
    expect(r.netAmountCents).toBe(3_500)
    expect(r.applications.map((a) => a.clawbackId)).toEqual(['b'])
  })

  it('nets nothing from a zero payout', () => {
    const r = computeClawbackNetting(0, [{ id: 'a', remainingCents: 5_000 }])
    expect(r.netAmountCents).toBe(0)
    expect(r.nettedCents).toBe(0)
    expect(r.applications.length).toBe(0)
  })

  it('invariant: net + netted == payout, and Σ applied == netted', () => {
    const payout = 7_777
    const r = computeClawbackNetting(payout, [
      { id: 'a', remainingCents: 1_234 },
      { id: 'b', remainingCents: 9_999 },
    ])
    expect(r.netAmountCents + r.nettedCents).toBe(payout)
    expect(r.applications.reduce((s, a) => s + a.appliedCents, 0)).toBe(r.nettedCents)
    expect(r.netAmountCents).toBeGreaterThanOrEqual(0)
  })

  it('coerces non-finite / negative inputs to safe integers', () => {
    const r = computeClawbackNetting(5_000, [
      { id: 'a', remainingCents: -100 }, // treated as 0 → skipped
      { id: 'b', remainingCents: 2_000.9 }, // floored to 2_000
    ])
    expect(r.nettedCents).toBe(2_000)
    expect(r.netAmountCents).toBe(3_000)
    expect(r.applications.map((a) => a.clawbackId)).toEqual(['b'])
  })
})
