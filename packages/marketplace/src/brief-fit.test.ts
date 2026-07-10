import { describe, it, expect } from 'vitest'
import { scoreBriefFit, FIT_WEIGHTS, type BriefFitFacts, type PartnerFitFacts } from './brief-fit'

const brief: BriefFitFacts = {
  nicheSlug: 'energy-performance',
  categoryId: 'cat-fwb',
  claims: ['High-protein', 'No added sugar', 'Vegan'],
  targetVolume: 5000,
}

const partner: PartnerFitFacts = {
  nicheSlugs: ['energy-performance', 'wellness'],
  categoryIds: ['cat-fwb', 'cat-supplements'],
  claimsSupported: ['High-protein', 'No added sugar', 'Vegan'],
  moqFloor: 3000,
  volumeCapacity: 50000,
  meritRating: 5,
  sameRegion: true,
}

describe('brief-fit — hard filters (§8, never weighted)', () => {
  it('niche mismatch is a hard fail with score 0', () => {
    const r = scoreBriefFit(brief, { ...partner, nicheSlugs: ['gourmet'] })
    expect(r.eligible).toBe(false)
    expect(r.hardFails).toContain('NICHE_MISMATCH')
    expect(r.score).toBe(0)
  })

  it('category mismatch is hard ONLY when the partner declares categories', () => {
    expect(scoreBriefFit(brief, { ...partner, categoryIds: ['cat-snacks'] }).hardFails).toContain(
      'CATEGORY_MISMATCH',
    )
    expect(scoreBriefFit(brief, { ...partner, categoryIds: [] }).eligible).toBe(true)
    expect(scoreBriefFit(brief, { ...partner, categoryIds: undefined }).eligible).toBe(true)
  })

  it('MOQ floor above target volume is a hard fail', () => {
    const r = scoreBriefFit(brief, { ...partner, moqFloor: 10000 })
    expect(r.hardFails).toContain('MOQ_ABOVE_TARGET')
    expect(scoreBriefFit({ ...brief, targetVolume: null }, { ...partner, moqFloor: 10000 }).eligible).toBe(
      true,
    ) // unknown volume never hard-fails
  })

  it('multiple hard fails accumulate', () => {
    const r = scoreBriefFit(brief, { ...partner, nicheSlugs: [], moqFloor: 99999 })
    expect(r.hardFails).toEqual(['NICHE_MISMATCH', 'MOQ_ABOVE_TARGET'])
  })
})

describe('brief-fit — weighted score', () => {
  it('perfect partner scores 100', () => {
    const r = scoreBriefFit(brief, partner)
    expect(r.eligible).toBe(true)
    expect(r.score).toBe(100)
  })

  it('claim coverage scales the claims component', () => {
    const r = scoreBriefFit(brief, { ...partner, claimsSupported: ['High-protein'] })
    expect(r.parts.claims).toBeCloseTo(FIT_WEIGHTS.claims / 3, 1)
    const none = scoreBriefFit(brief, { ...partner, claimsSupported: [] })
    expect(none.parts.claims).toBe(0)
  })

  it('no claims on the brief ⇒ full claims credit; undeclared support ⇒ half', () => {
    expect(scoreBriefFit({ ...brief, claims: [] }, partner).parts.claims).toBe(FIT_WEIGHTS.claims)
    expect(scoreBriefFit(brief, { ...partner, claimsSupported: undefined }).parts.claims).toBe(
      FIT_WEIGHTS.claims / 2,
    )
  })

  it('volume above capacity scales down, never negative', () => {
    const r = scoreBriefFit({ ...brief, targetVolume: 100000 }, { ...partner, volumeCapacity: 25000 })
    expect(r.parts.volume).toBeCloseTo(FIT_WEIGHTS.volume * 0.25, 1)
    expect(r.parts.volume).toBeGreaterThanOrEqual(0)
  })

  it('unrated partner gets neutral merit credit (new-provider ramp mirror)', () => {
    const r = scoreBriefFit(brief, { ...partner, meritRating: null })
    expect(r.parts.merit).toBe(FIT_WEIGHTS.merit / 2)
  })

  it('merit rating out of range is clamped', () => {
    expect(scoreBriefFit(brief, { ...partner, meritRating: 7 }).parts.merit).toBe(FIT_WEIGHTS.merit)
    expect(scoreBriefFit(brief, { ...partner, meritRating: -1 }).parts.merit).toBe(0)
  })

  it('different region halves the location component, never gates', () => {
    const r = scoreBriefFit(brief, { ...partner, sameRegion: false })
    expect(r.eligible).toBe(true)
    expect(r.parts.location).toBe(FIT_WEIGHTS.location / 2)
  })

  it('weights sum to 100', () => {
    expect(FIT_WEIGHTS.claims + FIT_WEIGHTS.volume + FIT_WEIGHTS.merit + FIT_WEIGHTS.location).toBe(100)
  })
})
