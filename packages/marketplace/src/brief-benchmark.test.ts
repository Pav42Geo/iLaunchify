import { describe, it, expect } from 'vitest'
import {
  BENCHMARK_MIN_SAMPLE,
  FORMULATION_BUFFER_WEEKS,
  computeBriefBenchmark,
  type BenchmarkRow,
} from './brief-benchmark'

const row = (over: Partial<BenchmarkRow> = {}): BenchmarkRow => ({
  unitCostCents: 150,
  moqMin: 3000,
  leadTimeDays: 49,
  nicheMatch: false,
  ...over,
})

describe('brief-benchmark — honesty gates', () => {
  it(`refuses to suggest below ${BENCHMARK_MIN_SAMPLE} comparables`, () => {
    expect(computeBriefBenchmark([], { makerFormulates: false })).toBeNull()
    expect(computeBriefBenchmark([row(), row()], { makerFormulates: false })).toBeNull()
  })

  it('rows without a usable price never count toward the sample', () => {
    const rows = [row({ unitCostCents: null }), row({ unitCostCents: 0 }), row(), row()]
    expect(computeBriefBenchmark(rows, { makerFormulates: false })).toBeNull()
  })

  it('carries provenance: sampleSize + nicheScoped', () => {
    const b = computeBriefBenchmark([row(), row(), row(), row({ nicheMatch: true })], {
      makerFormulates: false,
    })
    expect(b?.sampleSize).toBe(4)
    expect(b?.nicheScoped).toBe(false)
  })
})

describe('brief-benchmark — niche scoping', () => {
  it('prefers the niche-matched subset when it is a real sample on its own', () => {
    const rows = [
      row({ nicheMatch: true, unitCostCents: 100 }),
      row({ nicheMatch: true, unitCostCents: 110 }),
      row({ nicheMatch: true, unitCostCents: 120 }),
      row({ unitCostCents: 900 }), // out-of-niche outlier must be ignored
    ]
    const b = computeBriefBenchmark(rows, { makerFormulates: false })
    expect(b?.nicheScoped).toBe(true)
    expect(b?.sampleSize).toBe(3)
    expect(b!.budgetHighCents).toBeLessThan(900)
  })
})

describe('brief-benchmark — the numbers', () => {
  const rows = [
    row({ unitCostCents: 100, moqMin: 1000, leadTimeDays: 28 }),
    row({ unitCostCents: 120, moqMin: 3000, leadTimeDays: 35 }),
    row({ unitCostCents: 140, moqMin: 3000, leadTimeDays: 49 }),
    row({ unitCostCents: 160, moqMin: 5000, leadTimeDays: 56 }),
  ]

  it('budget = P25–P75 of per-unit pricing', () => {
    const b = computeBriefBenchmark(rows, { makerFormulates: false })!
    expect(b.budgetLowCents).toBe(100)
    expect(b.budgetHighCents).toBe(140)
  })

  it('volume = median MOQ rounded to 500s', () => {
    const b = computeBriefBenchmark(rows, { makerFormulates: false })!
    expect(b.suggestedVolume).toBe(3000)
  })

  it('timeline = median lead in weeks; formulation adds the buffer', () => {
    const solo = computeBriefBenchmark(rows, { makerFormulates: false })!
    expect(solo.timelineWeeks).toBe(Math.ceil(35 / 7))
    const helped = computeBriefBenchmark(rows, { makerFormulates: true })!
    expect(helped.timelineWeeks).toBe(Math.ceil(35 / 7) + FORMULATION_BUFFER_WEEKS)
  })

  it('budget band never inverts', () => {
    const b = computeBriefBenchmark([row(), row(), row()], { makerFormulates: false })!
    expect(b.budgetHighCents).toBeGreaterThanOrEqual(b.budgetLowCents)
  })
})
