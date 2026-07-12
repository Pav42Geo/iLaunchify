import { describe, expect, it } from 'vitest'

import type { FcCandidate, FcSelectionInput } from './fc-selector'
import { scoreAndSelectFc } from './fc-scorer'
import type { FcScoringContext, FcScoringWeights } from './fc-scorer'
import { isPublicFcPoolEligible } from './fc-pool'
import { applyFulfillmentPreference, resolveFulfillmentPreference } from './fc-scorer'

describe('Adaptive Fulfillment Engine — preference resolution + weight tilt', () => {
  const base: FcScoringWeights = {
    costWeightPct: 40,
    distanceWeightPct: 30,
    slaWeightPct: 10,
    capacityWeightPct: 10,
    rotationWeightPct: 10,
    storageMatchWeightPct: 20,
    rotationBandPct: 5,
  }

  it('resolve: product override wins over account default', () => {
    expect(resolveFulfillmentPreference('SPEED', 'COST')).toBe('SPEED')
  })
  it('resolve: falls back to account default, then BALANCED', () => {
    expect(resolveFulfillmentPreference(null, 'COST')).toBe('COST')
    expect(resolveFulfillmentPreference(null, null)).toBe('BALANCED')
  })
  it('BALANCED leaves weights untouched (identity)', () => {
    expect(applyFulfillmentPreference(base, 'BALANCED')).toEqual(base)
  })
  it('COST raises cost weight, lowers distance/SLA', () => {
    const w = applyFulfillmentPreference(base, 'COST')
    expect(w.costWeightPct).toBeGreaterThan(base.costWeightPct)
    expect(w.distanceWeightPct).toBeLessThan(base.distanceWeightPct)
    expect(w.slaWeightPct).toBeLessThan(base.slaWeightPct)
  })
  it('SPEED raises distance/SLA, lowers cost', () => {
    const w = applyFulfillmentPreference(base, 'SPEED')
    expect(w.distanceWeightPct).toBeGreaterThan(base.distanceWeightPct)
    expect(w.slaWeightPct).toBeGreaterThan(base.slaWeightPct)
    expect(w.costWeightPct).toBeLessThan(base.costWeightPct)
  })
  it('never touches hard-filter-adjacent weights (capacity, rotation, storage-match)', () => {
    const w = applyFulfillmentPreference(base, 'COST')
    expect(w.capacityWeightPct).toBe(base.capacityWeightPct)
    expect(w.rotationWeightPct).toBe(base.rotationWeightPct)
    expect(w.storageMatchWeightPct).toBe(base.storageMatchWeightPct)
    expect(w.rotationBandPct).toBe(base.rotationBandPct)
  })
})

describe('isPublicFcPoolEligible — public FC pool barred to producers (main-role rule)', () => {
  it('pure fulfillment center → eligible', () => {
    expect(isPublicFcPoolEligible(['WAREHOUSE'])).toBe(true)
  })
  it('manufacturer that also warehouses → excluded (its warehouse serves its own cycle)', () => {
    expect(isPublicFcPoolEligible(['MANUFACTURING', 'WAREHOUSE'])).toBe(false)
  })
  it('co-packer that also warehouses → excluded', () => {
    expect(isPublicFcPoolEligible(['COPACKING', 'WAREHOUSE'])).toBe(false)
  })
  it('no warehouse service → not an FC at all', () => {
    expect(isPublicFcPoolEligible(['LABEL_PRINTING'])).toBe(false)
  })
})

const weights: FcScoringWeights = {
  costWeightPct: 35,
  distanceWeightPct: 15,
  slaWeightPct: 15,
  capacityWeightPct: 15,
  rotationWeightPct: 10,
  storageMatchWeightPct: 10,
  rotationBandPct: 5,
}

const fc = (id: string, lat: number, lng: number, over: Partial<FcCandidate> = {}): FcCandidate => ({
  partnerServiceId: id,
  partnerName: id,
  city: null,
  state: null,
  storageClasses: ['AMBIENT', 'PROTECT_HEAT'],
  hazmatAccepted: [],
  fcCertifications: ['FDA_REGISTERED'],
  weeklyPalletCapacity: 100,
  facilityLat: lat,
  facilityLng: lng,
  ...over,
})

// Chicago origin; NJ close-ish, GA mid, TX far.
const nj = fc('nj', 40.73, -74.17)
const ga = fc('ga', 33.75, -84.39)
const tx = fc('tx', 32.78, -96.8)

const input: FcSelectionInput = {
  storageClass: 'AMBIENT', hazmatClass: 'NONE', domain: 'FOOD', pallets: 4,
  originLat: 41.88, originLng: -87.63, originState: 'IL',
}

const ctx = (history: FcScoringContext['history'], total: number): FcScoringContext => ({
  weights, history, totalRecentAwards: total,
})

describe('scoreAndSelectFc', () => {
  it('falls back to V1 nearest-eligible below 3 candidates', () => {
    const r = scoreAndSelectFc([nj, tx], input, ctx({}, 0))
    expect(r.algorithm).toBe('V1_NEAREST_ELIGIBLE')
    expect(r.winner!.ranked.candidate.partnerServiceId).toBe('nj')
  })

  it('with 3+ nodes and no history, nearest wins on the distance/cost proxy (Chicago→Atlanta < Chicago→Newark)', () => {
    const r = scoreAndSelectFc([tx, ga, nj], input, ctx({}, 0))
    expect(r.algorithm).toBe('V15_WEIGHTED_BAND')
    expect(r.winner!.ranked.candidate.partnerServiceId).toBe('ga')
    expect(r.rotationApplied).toBe(false)
  })

  it('rotation pressure in the score: the node holding ALL recent awards loses to a co-located peer', () => {
    const nj2 = fc('nj2', 40.73, -74.17) // identical coords to nj
    const history = {
      nj: { awardCount: 12, lastAwardedAt: new Date('2026-07-01T12:00:00') },
      nj2: { awardCount: 0, lastAwardedAt: null },
    }
    const r = scoreAndSelectFc([nj, nj2, tx], input, ctx(history, 12))
    expect(r.winner!.ranked.candidate.partnerServiceId).toBe('nj2')
  })

  it('band tiebreak: equal-scoring twins resolve to the least-recently-awarded', () => {
    const nj2 = fc('nj2', 40.73, -74.17) // identical coords ⇒ identical score
    const history = {
      nj: { awardCount: 0, lastAwardedAt: new Date('2026-07-01T12:00:00') },
      nj2: { awardCount: 0, lastAwardedAt: null },
      tx: { awardCount: 5, lastAwardedAt: new Date('2026-06-30T12:00:00') },
    }
    const r = scoreAndSelectFc([nj, nj2, tx], input, ctx(history, 5))
    expect(r.winner!.ranked.candidate.partnerServiceId).toBe('nj2')
    expect(r.rotationApplied).toBe(true)
  })

  it('rotation never overrides a clearly better node (outside the band)', () => {
    const history = {
      nj: { awardCount: 12, lastAwardedAt: new Date('2026-07-01T12:00:00') },
      tx: { awardCount: 0, lastAwardedAt: null },
    }
    const r = scoreAndSelectFc([nj, ga, tx], input, ctx(history, 12))
    // TX is far — its score is way outside NJ's 5% band, rotation can't save it.
    expect(r.winner!.ranked.candidate.partnerServiceId).not.toBe('tx')
  })

  it('hard filters still hold: frozen-incapable nodes are unscored', () => {
    const r = scoreAndSelectFc([nj, ga, tx], { ...input, storageClass: 'FROZEN' }, ctx({}, 0))
    expect(r.winner).toBeNull()
    expect(r.scored.every((s) => s.score === null)).toBe(true)
  })

  it('exact-match preference: ambient shipment prefers ambient-only node over frozen-capable twin', () => {
    const coldCapable = fc('cold', 40.73, -74.17, { storageClasses: ['AMBIENT', 'PROTECT_HEAT', 'CHILLED', 'FROZEN'] })
    const r = scoreAndSelectFc([coldCapable, nj, tx], input, ctx({}, 0))
    expect(r.winner!.ranked.candidate.partnerServiceId).toBe('nj')
  })
})
