import { describe, expect, it } from 'vitest'
import {
  rankCapabilityShortlist,
  type CapabilityRequirementTuple,
  type ShortlistCandidate,
} from './capability-shortlist'

const TUPLE: CapabilityRequirementTuple = {
  packagingTypeId: 'PT_JAR',
  decorationMethod: 'SHRINK_SLEEVE',
  printProcessHint: 'GRAVURE',
  manufacturerRegion: 'US-CA',
}

function cand(
  serviceId: string,
  over: Partial<ShortlistCandidate> = {},
): ShortlistCandidate {
  return { serviceId, region: null, ratingBayesian: null, offerings: [], ...over }
}

describe('rankCapabilityShortlist — adjacency priority a > b > c > d > rating', () => {
  it('(a) same method / other type beats (b) same type / other method', () => {
    const a = cand('a', { offerings: [{ packagingTypeId: 'PT_CAN', decorationMethod: 'SHRINK_SLEEVE' }] })
    const b = cand('b', { offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }] })
    const ranked = rankCapabilityShortlist([b, a], TUPLE)
    expect(ranked[0]!.serviceId).toBe('a')
    expect(ranked[0]!.signals.sameMethodOtherType).toBe(true)
    expect(ranked[1]!.serviceId).toBe('b')
    expect(ranked[1]!.signals.sameTypeOtherMethod).toBe(true)
  })

  it('(b) same type beats (c) same process only', () => {
    const b = cand('b', { offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }] })
    const c = cand('c', { offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'DIRECT_PRINT', printProcess: 'GRAVURE' }] })
    const ranked = rankCapabilityShortlist([c, b], TUPLE)
    expect(ranked.map((r) => r.serviceId)).toEqual(['b', 'c'])
  })

  it('(c) same process beats (d) same region only', () => {
    const c = cand('c', { region: 'US-NY', offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'FOIL', printProcess: 'GRAVURE' }] })
    const d = cand('d', { region: 'US-CA', offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'FOIL', printProcess: 'DIGITAL' }] })
    const ranked = rankCapabilityShortlist([d, c], TUPLE)
    expect(ranked.map((r) => r.serviceId)).toEqual(['c', 'd'])
  })

  it('(d) region beats rating alone; region match never outweighed by rating', () => {
    // hi: no adjacency, top rating. lo: region match, no rating.
    const hi = cand('hi', { region: 'US-TX', ratingBayesian: 5, offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'FOIL', printProcess: 'DIGITAL' }] })
    const lo = cand('lo', { region: 'US-CA', ratingBayesian: null, offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'FOIL', printProcess: 'DIGITAL' }] })
    const ranked = rankCapabilityShortlist([hi, lo], TUPLE)
    expect(ranked[0]!.serviceId).toBe('lo')
    expect(ranked[0]!.signals.sameRegion).toBe(true)
  })

  it('rating breaks ties when adjacency signals are equal', () => {
    const hi = cand('hi', { ratingBayesian: 4.8, offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }] })
    const lo = cand('lo', { ratingBayesian: 3.1, offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }] })
    const ranked = rankCapabilityShortlist([lo, hi], TUPLE)
    expect(ranked.map((r) => r.serviceId)).toEqual(['hi', 'lo'])
  })

  it('serviceId breaks a fully exact tie (determinism)', () => {
    const off = [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }]
    const z = cand('z', { ratingBayesian: 4, offerings: off })
    const a = cand('a', { ratingBayesian: 4, offerings: off })
    const ranked = rankCapabilityShortlist([z, a], TUPLE)
    expect(ranked.map((r) => r.serviceId)).toEqual(['a', 'z'])
  })
})

describe('rankCapabilityShortlist — edges', () => {
  it('null decorationMethod disables (a) but keeps (b) via type match', () => {
    const t: CapabilityRequirementTuple = { packagingTypeId: 'PT_JAR', decorationMethod: null }
    const a = cand('a', { offerings: [{ packagingTypeId: 'PT_CAN', decorationMethod: 'SHRINK_SLEEVE' }] }) // no signal now
    const b = cand('b', { offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }] }) // type match
    const ranked = rankCapabilityShortlist([a, b], t)
    expect(ranked[0]!.serviceId).toBe('b')
    expect(ranked[0]!.signals.sameTypeOtherMethod).toBe(true)
    expect(ranked.find((r) => r.serviceId === 'a')!.signals.noAdjacency).toBe(true)
  })

  it('no-adjacency long-shots rank last but are still returned', () => {
    const good = cand('good', { offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'FOIL' }] })
    const none = cand('none', { offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'FOIL' }] })
    const ranked = rankCapabilityShortlist([none, good], TUPLE)
    expect(ranked.map((r) => r.serviceId)).toEqual(['good', 'none'])
    expect(ranked[1]!.signals.noAdjacency).toBe(true)
  })

  it('respects the limit (default 10)', () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      cand(`s${String(i).padStart(2, '0')}`, { offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'FOIL' }] }),
    )
    expect(rankCapabilityShortlist(many, TUPLE)).toHaveLength(10)
    expect(rankCapabilityShortlist(many, TUPLE, { limit: 3 })).toHaveLength(3)
    expect(rankCapabilityShortlist(many, TUPLE, { limit: -1 })).toHaveLength(15)
  })

  it('rating clamps to [0,5] so a bad datum cannot dominate a tier', () => {
    const weird = cand('weird', { ratingBayesian: 99, offerings: [{ packagingTypeId: 'PT_JAR', decorationMethod: 'DIRECT_PRINT' }] })
    const region = cand('region', { region: 'US-CA', offerings: [{ packagingTypeId: 'PT_BOX', decorationMethod: 'FOIL' }] })
    // weird has (b) type match = 10_000; region has (d) only = 100. type wins regardless of rating clamp.
    const ranked = rankCapabilityShortlist([region, weird], TUPLE)
    expect(ranked[0]!.serviceId).toBe('weird')
    // and the clamp keeps its rating contribution ≤ 50, below the region weight of 100.
    expect(ranked[0]!.score).toBeLessThan(10_000 + 100)
  })

  it('empty candidate list → empty result', () => {
    expect(rankCapabilityShortlist([], TUPLE)).toEqual([])
  })
})
