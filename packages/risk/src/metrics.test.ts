import { describe, expect, it } from 'vitest'
import { computePrs, lateShipmentRatePct, leadTimeVarianceP90Days, odrEquivPct, otifPct, prsBand } from './metrics'
import type { DeliveryRecord } from './types'

const d = (promised: string, shipped: string | null, delivered: string | null, ordered = 100, got = 100, defect = false): DeliveryRecord => ({
  promisedAt: new Date(promised),
  shippedAt: shipped ? new Date(shipped) : null,
  deliveredAt: delivered ? new Date(delivered) : null,
  unitsOrdered: ordered,
  unitsDelivered: got,
  defect,
})

describe('otifPct', () => {
  it('counts only on-time AND in-full', () => {
    const records = [
      d('2026-06-10', '2026-06-08', '2026-06-09'), // on time, full
      d('2026-06-10', '2026-06-08', '2026-06-12'), // late
      d('2026-06-10', '2026-06-08', '2026-06-09', 100, 90), // short
      d('2026-06-10', '2026-06-08', null), // in flight — excluded
    ]
    expect(otifPct(records)).toBeCloseTo(33.33, 1)
  })
  it('null with no completed deliveries', () => {
    expect(otifPct([d('2026-06-10', null, null)])).toBeNull()
  })
})

describe('lateShipmentRatePct / odrEquivPct', () => {
  it('LSR over shipped records', () => {
    const records = [
      d('2026-06-10', '2026-06-09', '2026-06-11'),
      d('2026-06-10', '2026-06-12', '2026-06-14'),
      d('2026-06-10', '2026-06-13', null),
      d('2026-06-10', null, null),
    ]
    expect(lateShipmentRatePct(records)).toBeCloseTo(66.67, 1)
  })
  it('ODR-equiv over delivered records', () => {
    const records = [
      d('2026-06-10', '2026-06-09', '2026-06-10'),
      d('2026-06-10', '2026-06-09', '2026-06-10', 100, 100, true),
    ]
    expect(odrEquivPct(records)).toBe(50)
  })
})

describe('leadTimeVarianceP90Days', () => {
  it('P90 of positive lags only (early deliveries floor at 0)', () => {
    const records = [
      d('2026-06-10', '2026-06-01', '2026-06-08'), // early → 0
      d('2026-06-10', '2026-06-01', '2026-06-12'), // +2
      d('2026-06-10', '2026-06-01', '2026-06-21'), // +11
    ]
    const v = leadTimeVarianceP90Days(records)
    expect(v).toBeGreaterThan(8)
    expect(v).toBeLessThanOrEqual(11)
  })
})

describe('computePrs', () => {
  it('full components: weighted average minus penalties', () => {
    const { score } = computePrs({
      otifPct: 96,
      acceptRatePct: 90,
      qualityPct: 95,
      discrepancyCleanPct: 98,
      capacityHonestyPct: 80,
      leadTimeConsistencyPct: 90,
      penaltyPoints: 3,
    })
    expect(score).toBeGreaterThan(85)
    expect(score).toBeLessThan(95)
  })
  it('missing components renormalize — thin history is not punished', () => {
    const { score, usedWeights } = computePrs({
      otifPct: 100,
      acceptRatePct: null,
      qualityPct: null,
      discrepancyCleanPct: null,
      capacityHonestyPct: null,
      leadTimeConsistencyPct: null,
      penaltyPoints: 0,
    })
    expect(score).toBe(100)
    expect(usedWeights).toEqual({ otifPct: 30 })
  })
  it('all-null returns null score (caller shows neutral 70 + thin-history badge)', () => {
    expect(
      computePrs({
        otifPct: null,
        acceptRatePct: null,
        qualityPct: null,
        discrepancyCleanPct: null,
        capacityHonestyPct: null,
        leadTimeConsistencyPct: null,
        penaltyPoints: 0,
      }).score,
    ).toBeNull()
  })
  it('bands match Amazon-style tiers', () => {
    expect(prsBand(80)).toBe('HEALTHY')
    expect(prsBand(60)).toBe('AT_RISK')
    expect(prsBand(40)).toBe('CRITICAL')
  })
})
