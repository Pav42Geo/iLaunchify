import { describe, expect, it } from 'vitest'
import { normalizeDemandRegion, summarizeDemand } from './demand-signal'

describe('P3.0 — normalizeDemandRegion', () => {
  it('accepts a valid 2-letter code (any casing)', () => {
    expect(normalizeDemandRegion('ca')).toBe('CA')
    expect(normalizeDemandRegion(' NY ')).toBe('NY')
  })
  it('maps a full state name to its code', () => {
    expect(normalizeDemandRegion('New Jersey')).toBe('NJ')
    expect(normalizeDemandRegion('california')).toBe('CA')
  })
  it('rejects unknown / non-US / empty → null (skip the increment)', () => {
    expect(normalizeDemandRegion('XX')).toBeNull()
    expect(normalizeDemandRegion('Ontario')).toBeNull()
    expect(normalizeDemandRegion(null)).toBeNull()
    expect(normalizeDemandRegion('')).toBeNull()
  })
})

describe('P3.0 — summarizeDemand', () => {
  it('ranks regions by units desc with share %', () => {
    const s = summarizeDemand([
      { regionCode: 'CA', units: 60 },
      { regionCode: 'NY', units: 30 },
      { regionCode: 'TX', units: 10 },
    ])
    expect(s.totalUnits).toBe(100)
    expect(s.topRegions[0]).toEqual({ regionCode: 'CA', units: 60, sharePct: 60 })
    expect(s.topRegions.map((r) => r.regionCode)).toEqual(['CA', 'NY', 'TX'])
  })
  it('drops zero-unit regions and caps at topN', () => {
    const s = summarizeDemand(
      [
        { regionCode: 'CA', units: 5 },
        { regionCode: 'NY', units: 0 },
        { regionCode: 'TX', units: 3 },
        { regionCode: 'FL', units: 2 },
      ],
      2,
    )
    expect(s.topRegions).toHaveLength(2)
    expect(s.topRegions.map((r) => r.regionCode)).toEqual(['CA', 'TX'])
  })
  it('empty signal → zero total, no regions', () => {
    expect(summarizeDemand([])).toEqual({ totalUnits: 0, topRegions: [] })
  })
})
