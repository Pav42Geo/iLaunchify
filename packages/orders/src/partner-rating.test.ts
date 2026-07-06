import { describe, it, expect } from 'vitest'
import {
  RATING_DIMENSIONS,
  ratedRoleForDispatchType,
  validateDimensionScores,
  overallFromDimensions,
  aggregateRatings,
  BAYESIAN_C,
  MIN_RATINGS_FOR_DISPLAY,
} from './partner-rating'

describe('dimensions registry', () => {
  it('every role has 4 concrete dimensions with sublabels', () => {
    for (const dims of Object.values(RATING_DIMENSIONS)) {
      expect(dims).toHaveLength(4)
      for (const d of dims) {
        expect(d.slug).toMatch(/^[a-z-]+$/)
        expect(d.sublabel.length).toBeGreaterThan(5)
      }
    }
  })
  it('maps dispatch types to roles', () => {
    expect(ratedRoleForDispatchType('PRODUCT')).toBe('MANUFACTURER')
    expect(ratedRoleForDispatchType('LABEL')).toBe('PRINTER')
    expect(ratedRoleForDispatchType('COPACKING')).toBe('COPACKER')
    expect(ratedRoleForDispatchType('INBOUND')).toBe('WAREHOUSE')
  })
})

describe('validateDimensionScores', () => {
  it('accepts valid partial submissions', () => {
    const r = validateDimensionScores('MANUFACTURER', { quality: 5, speed: 3 })
    expect(r).toEqual({ ok: true, clean: { quality: 5, speed: 3 } })
  })
  it('rejects unknown slugs, out-of-range, non-integers, empty', () => {
    expect(validateDimensionScores('MANUFACTURER', { color: 5 }).ok).toBe(false) // printer dim
    expect(validateDimensionScores('MANUFACTURER', { quality: 6 }).ok).toBe(false)
    expect(validateDimensionScores('MANUFACTURER', { quality: 0 }).ok).toBe(false)
    expect(validateDimensionScores('MANUFACTURER', { quality: 4.5 }).ok).toBe(false)
    expect(validateDimensionScores('MANUFACTURER', {}).ok).toBe(false)
  })
})

describe('overallFromDimensions', () => {
  it('means the rated dimensions only', () => {
    expect(overallFromDimensions({ quality: 5, speed: 4 })).toBe(4.5)
    expect(overallFromDimensions({ quality: 5, speed: 4, communication: 3 })).toBe(4)
  })
})

describe('aggregateRatings', () => {
  const r = (overall: number, dims = { quality: overall }) => ({ overall, dimensions: dims })

  it('empty → New, no numbers', () => {
    const a = aggregateRatings([])
    expect(a).toMatchObject({ mean: null, bayesian: null, count: 0, isNew: true })
  })

  it('below min-N is still New but has a mean', () => {
    const a = aggregateRatings([r(5), r(4)])
    expect(a.mean).toBe(4.5)
    expect(a.count).toBe(2)
    expect(a.isNew).toBe(true)
    expect(MIN_RATINGS_FOR_DISPLAY).toBe(3)
  })

  it('Bayesian pulls small samples toward the prior — one 5★ cannot outrank 4.8×200', () => {
    const lucky = aggregateRatings([r(5)], 3.75)
    const veteranRatings = Array.from({ length: 200 }, () => r(4.8))
    const veteran = aggregateRatings(veteranRatings, 3.75)
    expect(lucky.mean).toBe(5)
    expect(lucky.bayesian!).toBeLessThan(veteran.bayesian!)
    // sanity: (10·3.75 + 5)/11 ≈ 3.864
    expect(lucky.bayesian!).toBeCloseTo((BAYESIAN_C * 3.75 + 5) / (BAYESIAN_C + 1), 3)
  })

  it('per-dimension bars aggregate independently with their own n', () => {
    const a = aggregateRatings([
      { overall: 4.5, dimensions: { quality: 5, speed: 4 } },
      { overall: 3, dimensions: { quality: 3 } },
    ])
    expect(a.dims['quality']).toEqual({ mean: 4, n: 2 })
    expect(a.dims['speed']).toEqual({ mean: 4, n: 1 })
  })
})
