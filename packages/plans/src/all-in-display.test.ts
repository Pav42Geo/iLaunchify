// Invariant tests for the all-in display composer (Option C, 2026-07-21).
// The one that matters: sum(allInCents) === subtotal + fee, ALWAYS.

import { describe, it, expect } from 'vitest'
import { composeAllInLines } from './all-in-display'

const line = (cents: number, label = 'x') => ({ kind: 'PRODUCT', label, cents })

describe('composeAllInLines', () => {
  it('sums exactly to subtotal + fee (proven money-path numbers)', () => {
    // 2026-07-18 real order: $4,600 goods + $452.40 extras, $690.00 fee at 15%.
    const lines = [line(460_000, 'Production'), line(45_240, 'Decoration')]
    const res = composeAllInLines(lines, 69_000)
    expect(res.allInSubtotalCents).toBe(460_000 + 45_240 + 69_000)
    expect(res.lines.reduce((s, l) => s + l.allInCents, 0)).toBe(
      res.allInSubtotalCents,
    )
  })

  it('never drops or invents a cent across awkward splits', () => {
    for (const fee of [0, 1, 7, 333, 12_345]) {
      for (const cents of [
        [1, 1, 1],
        [999, 1],
        [33_333, 33_333, 33_334],
        [5, 0, 5],
      ]) {
        const lines = cents.map((c) => line(c))
        const res = composeAllInLines(lines, fee)
        expect(res.lines.reduce((s, l) => s + l.allInCents, 0)).toBe(
          cents.reduce((s, c) => s + c, 0) + fee,
        )
      }
    }
  })

  it('is deterministic on ties', () => {
    const a = composeAllInLines([line(50), line(50)], 1)
    const b = composeAllInLines([line(50), line(50)], 1)
    expect(a).toEqual(b)
    expect(a.lines[0]!.allInCents).toBe(51) // earlier line wins the tie cent
  })

  it('keeps the partner cents untouched for the breakdown view', () => {
    const res = composeAllInLines([line(460_000)], 69_000)
    expect(res.lines[0]!.cents).toBe(460_000)
    expect(res.lines[0]!.allInCents).toBe(529_000)
  })

  it('handles degenerate zero-subtotal and empty inputs without losing the fee', () => {
    expect(
      composeAllInLines([line(0, 'freebie')], 250).allInSubtotalCents,
    ).toBe(250)
    expect(composeAllInLines([], 250).allInSubtotalCents).toBe(250)
    expect(composeAllInLines([], 0).lines).toHaveLength(0)
  })
})
