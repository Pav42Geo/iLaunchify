import { describe, expect, it } from 'vitest'
import {
  classifyFcOverride,
  learnedFulfillmentAdjustment,
  applyLearnedFulfillmentSignal,
} from './fulfillment-learning'
import type { FcScoringWeights } from './fc-scorer'

const base: FcScoringWeights = {
  costWeightPct: 40,
  distanceWeightPct: 30,
  slaWeightPct: 10,
  capacityWeightPct: 10,
  rotationWeightPct: 10,
  storageMatchWeightPct: 20,
  rotationBandPct: 5,
}
const on = { enabled: true, minEvents: 3, maxAdjustmentPct: 20 }

describe('AFE P2 — classifyFcOverride', () => {
  it('picked farther than suggested → FARTHER (cost-leaning)', () => {
    expect(classifyFcOverride(100, 400)).toBe('FARTHER')
  })
  it('picked nearer → NEARER (speed-leaning)', () => {
    expect(classifyFcOverride(400, 100)).toBe('NEARER')
  })
  it('within 1 mi or missing distance → NEUTRAL', () => {
    expect(classifyFcOverride(100, 100)).toBe('NEUTRAL')
    expect(classifyFcOverride(null, 100)).toBe('NEUTRAL')
    expect(classifyFcOverride(100, null)).toBe('NEUTRAL')
  })
})

describe('AFE P2 — learnedFulfillmentAdjustment (bounded + admin-gated)', () => {
  it('disabled policy → no adjustment (shadow-inert default)', () => {
    const adj = learnedFulfillmentAdjustment({ fartherCount: 10, nearerCount: 0 }, { ...on, enabled: false })
    expect(adj).toEqual({ lean: 'NONE', adjustmentPct: 0 })
  })
  it('below minEvents → no adjustment', () => {
    expect(learnedFulfillmentAdjustment({ fartherCount: 1, nearerCount: 1 }, on).lean).toBe('NONE')
  })
  it('consistent FARTHER picks → COST lean, capped at ceiling', () => {
    const adj = learnedFulfillmentAdjustment({ fartherCount: 10, nearerCount: 0 }, on)
    expect(adj.lean).toBe('COST')
    expect(adj.adjustmentPct).toBe(20) // full confidence → ceiling
  })
  it('consistent NEARER picks → SPEED lean', () => {
    expect(learnedFulfillmentAdjustment({ fartherCount: 0, nearerCount: 8 }, on).lean).toBe('SPEED')
  })
  it('a tie → NONE', () => {
    expect(learnedFulfillmentAdjustment({ fartherCount: 5, nearerCount: 5 }, on).lean).toBe('NONE')
  })
  it('adjustment never exceeds the admin ceiling', () => {
    const adj = learnedFulfillmentAdjustment({ fartherCount: 100, nearerCount: 1 }, { ...on, maxAdjustmentPct: 12 })
    expect(adj.adjustmentPct).toBeLessThanOrEqual(12)
  })
})

describe('AFE P2 — applyLearnedFulfillmentSignal', () => {
  it('NONE lean is identity', () => {
    expect(applyLearnedFulfillmentSignal(base, { lean: 'NONE', adjustmentPct: 0 })).toEqual(base)
  })
  it('COST lean raises cost, lowers distance/SLA; leaves hard-filter weights', () => {
    const w = applyLearnedFulfillmentSignal(base, { lean: 'COST', adjustmentPct: 20 })
    expect(w.costWeightPct).toBeGreaterThan(base.costWeightPct)
    expect(w.distanceWeightPct).toBeLessThan(base.distanceWeightPct)
    expect(w.capacityWeightPct).toBe(base.capacityWeightPct)
    expect(w.rotationWeightPct).toBe(base.rotationWeightPct)
    expect(w.storageMatchWeightPct).toBe(base.storageMatchWeightPct)
  })
  it('SPEED lean raises distance/SLA, lowers cost', () => {
    const w = applyLearnedFulfillmentSignal(base, { lean: 'SPEED', adjustmentPct: 20 })
    expect(w.distanceWeightPct).toBeGreaterThan(base.distanceWeightPct)
    expect(w.costWeightPct).toBeLessThan(base.costWeightPct)
  })
})
