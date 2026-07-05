import { describe, expect, it } from 'vitest'
import {
  assessCapacity,
  capacityHonestyGap,
  classifyCapacityRisk,
  demonstratedCapacityP75,
  effectiveCapacity,
  proposeSplit,
} from './capacity'

const T = { warnPct: 60, gatePct: 85, blockPct: 100 }

describe('demonstratedCapacityP75', () => {
  it('returns null on thin history (<2 windows)', () => {
    expect(demonstratedCapacityP75([])).toBeNull()
    expect(demonstratedCapacityP75([35_000])).toBeNull()
  })
  it('computes P75 of rolling windows', () => {
    expect(demonstratedCapacityP75([30_000, 34_000, 35_000, 36_000])).toBe(35_250)
  })
  it('ignores negative/NaN junk', () => {
    expect(demonstratedCapacityP75([-5, Number.NaN, 30_000, 40_000])).toBe(37_500)
  })
})

describe('effectiveCapacity', () => {
  it('takes min(declared, demonstrated)', () => {
    expect(effectiveCapacity({ declaredUnits: 50_000, demonstratedUnits: 35_000, committedUnits: 0 })).toBe(35_000)
  })
  it('falls back to declared when history is thin', () => {
    expect(effectiveCapacity({ declaredUnits: 50_000, demonstratedUnits: null, committedUnits: 0 })).toBe(50_000)
  })
  it('pro-rates blackout days', () => {
    expect(
      effectiveCapacity({ declaredUnits: 30_000, demonstratedUnits: null, committedUnits: 0, blackoutDays: 10, daysInMonth: 30 }),
    ).toBe(20_000)
  })
})

describe('classifyCapacityRisk bands', () => {
  it('maps pct to GREEN/WARN/GATE/BLOCK', () => {
    expect(classifyCapacityRisk(59, T)).toBe('GREEN')
    expect(classifyCapacityRisk(61, T)).toBe('WARN')
    expect(classifyCapacityRisk(90, T)).toBe('GATE')
    expect(classifyCapacityRisk(101, T)).toBe('BLOCK')
  })
})

describe('proposeSplit', () => {
  it('returns null when the order fits month one', () => {
    expect(proposeSplit(10_000, [{ month: '2026-07', headroomUnits: 25_000 }])).toBeNull()
  })
  it('splits greedily across months', () => {
    expect(
      proposeSplit(50_000, [
        { month: '2026-07', headroomUnits: 25_000 },
        { month: '2026-08', headroomUnits: 35_000 },
      ]),
    ).toEqual([
      { month: '2026-07', units: 25_000 },
      { month: '2026-08', units: 25_000 },
    ])
  })
  it('returns null when the horizon cannot absorb the order', () => {
    expect(
      proposeSplit(100_000, [
        { month: '2026-07', headroomUnits: 20_000 },
        { month: '2026-08', headroomUnits: 20_000 },
      ]),
    ).toBeNull()
  })
})

describe("Pavel's scenario: declared 50k, demonstrated 35k, committed 10k, order 50k", () => {
  const current = { declaredUnits: 50_000, demonstratedUnits: 35_000, committedUnits: 10_000 }
  it('blocks: 50k against 25k headroom = 200%', () => {
    const a = assessCapacity(50_000, current, [], T)
    expect(a.effectiveCapacity).toBe(35_000)
    expect(a.headroomUnits).toBe(25_000)
    expect(a.riskPct).toBe(200)
    expect(a.band).toBe('BLOCK')
  })
  it('offers a split when next month has headroom', () => {
    const a = assessCapacity(
      50_000,
      current,
      [{ month: '2026-08', input: { declaredUnits: 50_000, demonstratedUnits: 35_000, committedUnits: 5_000 } }],
      T,
      '2026-07',
    )
    expect(a.splitProposal).toEqual([
      { month: '2026-07', units: 25_000 },
      { month: '2026-08', units: 25_000 },
    ])
  })
  it('zero headroom yields infinite risk, still BLOCK', () => {
    const a = assessCapacity(1_000, { declaredUnits: 30_000, demonstratedUnits: 30_000, committedUnits: 30_000 }, [], T)
    expect(a.band).toBe('BLOCK')
    expect(Number.isFinite(a.riskPct)).toBe(false)
  })
})

describe('capacityHonestyGap (propose, never auto-apply)', () => {
  it('fires after 2 consecutive months below 60% of declared', () => {
    const r = capacityHonestyGap(
      [
        { declaredUnits: 50_000, demonstratedUnits: 48_000 },
        { declaredUnits: 50_000, demonstratedUnits: 28_000 },
        { declaredUnits: 50_000, demonstratedUnits: 26_000 },
      ],
      { gapFloorPct: 60, minConsecutiveMonths: 2 },
    )
    expect(r.fired).toBe(true)
    expect(r.consecutiveMonths).toBe(2)
    expect(r.proposedDeclaredUnits).toBe(27_000)
  })
  it('a good month resets the streak', () => {
    const r = capacityHonestyGap(
      [
        { declaredUnits: 50_000, demonstratedUnits: 25_000 },
        { declaredUnits: 50_000, demonstratedUnits: 45_000 },
        { declaredUnits: 50_000, demonstratedUnits: 25_000 },
      ],
      { gapFloorPct: 60, minConsecutiveMonths: 2 },
    )
    expect(r.fired).toBe(false)
  })
})
