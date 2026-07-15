import { describe, expect, it } from 'vitest'
import type { FcCandidate, FcSelectionInput } from './fc-selector'
import { scoreAndSelectFc } from './fc-scorer'
import type { FcScoringContext, FcScoringWeights, FcSelectionPolicy } from './fc-scorer'

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

// Chicago origin. Score order (best→worst): ga (Atlanta) < nj (Newark) < tx (Dallas).
const nj = fc('nj', 40.73, -74.17)
const ga = fc('ga', 33.75, -84.39)
const tx = fc('tx', 32.78, -96.8)

const input: FcSelectionInput = {
  storageClass: 'AMBIENT', hazmatClass: 'NONE', domain: 'FOOD', pallets: 4,
  originLat: 41.88, originLng: -87.63, originState: 'IL',
}

function policy(over: Partial<FcSelectionPolicy> = {}): FcSelectionPolicy {
  return {
    enabled: true,
    poolSize: 2,
    mode: 'EQUAL',
    slotSharesPct: [],
    newNodeSharePct: 0,
    newNodeMaxOpen: 0,
    ...over,
  }
}

const ctx = (
  p: FcSelectionPolicy | undefined,
  history: FcScoringContext['history'] = {},
  roll = 0,
): FcScoringContext => ({
  weights,
  history,
  totalRecentAwards: Object.values(history).reduce((s, h) => s + h.awardCount, 0),
  rotationPolicy: p,
  roll: () => roll,
})

const win = (r: ReturnType<typeof scoreAndSelectFc>) => r.winner!.ranked.candidate.partnerServiceId

describe('SR-4 FC rotation policy', () => {
  it('disabled policy → unchanged V1.5 band behavior', () => {
    const r = scoreAndSelectFc([tx, ga, nj], input, ctx(policy({ enabled: false })))
    expect(r.algorithm).toBe('V15_WEIGHTED_BAND')
  })

  it('BEST_ONLY → always the best-scoring node (nearest)', () => {
    const r = scoreAndSelectFc([tx, ga, nj], input, ctx(policy({ mode: 'BEST_ONLY' })))
    expect(r.algorithm).toBe('SR4_ROTATION_POLICY')
    expect(win(r)).toBe('ga')
  })

  it('RANDOM → roll indexes into the top-N pool', () => {
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(policy({ mode: 'RANDOM' }), {}, 0)))).toBe('ga')
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(policy({ mode: 'RANDOM' }), {}, 0.99)))).toBe('nj')
  })

  it('WEIGHTED_EXACT → shares steer the pick across the pool', () => {
    const p100 = policy({ mode: 'WEIGHTED_EXACT', slotSharesPct: [100, 0] })
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(p100, {}, 0.5)))).toBe('ga')
    const p010 = policy({ mode: 'WEIGHTED_EXACT', slotSharesPct: [0, 100] })
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(p010, {}, 0.5)))).toBe('nj')
  })

  it('EQUAL → least-recently-awarded within the pool', () => {
    // pool = [ga, nj]; ga awarded recently, nj never → nj wins.
    const history = {
      ga: { awardCount: 3, lastAwardedAt: new Date('2026-07-05T00:00:00') },
      nj: { awardCount: 0, lastAwardedAt: null },
    }
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(policy({ mode: 'EQUAL' }), history)))).toBe('nj')
  })

  it('new-node diversion → an under-exposed FC wins despite a worse score', () => {
    // ga + tx already busy (above cap); nj alone under the cap → diverted to nj.
    const history = {
      ga: { awardCount: 9, lastAwardedAt: new Date('2026-07-05T00:00:00') },
      tx: { awardCount: 9, lastAwardedAt: new Date('2026-07-05T00:00:00') },
      nj: { awardCount: 1, lastAwardedAt: new Date('2026-06-01T00:00:00') },
    }
    const p = policy({ mode: 'BEST_ONLY', newNodeSharePct: 100, newNodeMaxOpen: 3 })
    const r = scoreAndSelectFc([tx, ga, nj], input, ctx(p, history, 0))
    expect(win(r)).toBe('nj')
    expect(r.rotationApplied).toBe(true)
  })

  it('new-node cap → nodes at/above the cap are not "new"', () => {
    // all above cap → no diversion; BEST_ONLY picks best score ga.
    const history = {
      ga: { awardCount: 9, lastAwardedAt: new Date('2026-07-05T00:00:00') },
      nj: { awardCount: 9, lastAwardedAt: new Date('2026-07-05T00:00:00') },
      tx: { awardCount: 9, lastAwardedAt: new Date('2026-07-05T00:00:00') },
    }
    const p = policy({ mode: 'BEST_ONLY', newNodeSharePct: 100, newNodeMaxOpen: 3 })
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(p, history, 0)))).toBe('ga')
  })

  it('new-node share 0 → never diverts even with new nodes present', () => {
    const p = policy({ mode: 'BEST_ONLY', newNodeSharePct: 0, newNodeMaxOpen: 3 })
    expect(win(scoreAndSelectFc([tx, ga, nj], input, ctx(p, {}, 0)))).toBe('ga')
  })
})
