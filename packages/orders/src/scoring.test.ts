import { describe, it, expect } from 'vitest'
import {
  capabilityScore,
  proximityScore,
  scorePartnerMatch,
  rankPartnerMatches,
  pickBestMatch,
  type MatchCandidate,
} from './scoring'

function candidate(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    serviceId: 's1',
    moqMin: 100,
    moqMax: 10_000,
    partnerCountry: 'US',
    partnerRegionId: 'us-ca',
    certifiedMarketIds: [],
    ...over,
  }
}

describe('capabilityScore', () => {
  it('is 0 when the qty falls outside the MOQ range', () => {
    expect(capabilityScore(candidate({ moqMin: 500 }), 100)).toBe(0)
    expect(capabilityScore(candidate({ moqMax: 1000 }), 5000)).toBe(0)
  })

  it('rewards more headroom above the order qty', () => {
    const roomy = capabilityScore(candidate({ moqMax: 100_000 }), 1000)
    const tight = capabilityScore(candidate({ moqMax: 2000 }), 1000)
    expect(roomy).toBeGreaterThan(tight)
    expect(roomy).toBeLessThanOrEqual(1)
    expect(tight).toBeGreaterThanOrEqual(0)
  })

  it('handles an unbounded ceiling without returning Infinity/NaN', () => {
    const s = capabilityScore(candidate({ moqMax: Number.POSITIVE_INFINITY }), 1000)
    expect(Number.isFinite(s)).toBe(true)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(1)
  })
})

describe('proximityScore', () => {
  it('region match beats country match beats neither', () => {
    const region = proximityScore(candidate(), { quantity: 1, destinationRegionId: 'us-ca' })
    const country = proximityScore(candidate(), { quantity: 1, destinationCountry: 'US' })
    const neither = proximityScore(candidate({ partnerCountry: 'CA', partnerRegionId: 'ca-on' }), {
      quantity: 1,
      destinationCountry: 'US',
      destinationRegionId: 'us-ny',
    })
    expect(region).toBeGreaterThan(country)
    expect(country).toBeGreaterThan(neither)
  })
})

describe('scorePartnerMatch', () => {
  it('omits proximity + cert dims when no destination/market is supplied', () => {
    const s = scorePartnerMatch(candidate(), { quantity: 1000 })
    expect(s.breakdown.proximity).toBeNull()
    expect(s.breakdown.cert).toBeNull()
    // Total collapses to the capability score alone.
    expect(s.total).toBeCloseTo(s.breakdown.capability)
  })

  it('certified-for-market candidate outranks an uncertified one, all else equal', () => {
    const ctx = { quantity: 1000, targetMarketId: 'mkt-us' }
    const certified = scorePartnerMatch(candidate({ certifiedMarketIds: ['mkt-us'] }), ctx)
    const uncertified = scorePartnerMatch(candidate({ serviceId: 's2' }), ctx)
    expect(certified.breakdown.cert).toBe(1)
    expect(uncertified.breakdown.cert).toBe(0)
    expect(certified.total).toBeGreaterThan(uncertified.total)
  })

  it('keeps the total within 0..1', () => {
    const s = scorePartnerMatch(candidate({ certifiedMarketIds: ['mkt-us'] }), {
      quantity: 1000,
      destinationRegionId: 'us-ca',
      targetMarketId: 'mkt-us',
    })
    expect(s.total).toBeGreaterThanOrEqual(0)
    expect(s.total).toBeLessThanOrEqual(1)
  })
})

describe('rankPartnerMatches / pickBestMatch', () => {
  it('ranks best-first and tie-breaks deterministically by serviceId', () => {
    const a = candidate({ serviceId: 'b-svc', moqMax: 2000 })
    const b = candidate({ serviceId: 'a-svc', moqMax: 2000 })
    const ranked = rankPartnerMatches([a, b], { quantity: 1000 })
    // Equal scores → alphabetical serviceId wins the tie.
    expect(ranked[0]!.serviceId).toBe('a-svc')
  })

  it('picks the roomier manufacturer as best', () => {
    const small = candidate({ serviceId: 'small', moqMax: 2000 })
    const big = candidate({ serviceId: 'big', moqMax: 500_000 })
    const best = pickBestMatch([small, big], { quantity: 1000 })
    expect(best?.serviceId).toBe('big')
  })

  it('returns null for an empty candidate set', () => {
    expect(pickBestMatch([], { quantity: 1000 })).toBeNull()
  })
})
