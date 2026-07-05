import { describe, expect, it } from 'vitest'
import { capByMode, evaluateCapacityOvercommit, evaluateCeiling, evaluateFloor } from './engine'
import type { RiskSettings } from './types'

const pavel = {
  orderUnits: 50_000,
  current: { declaredUnits: 50_000, demonstratedUnits: 35_000, committedUnits: 10_000 },
  futureMonths: [
    { month: '2026-08', input: { declaredUnits: 50_000, demonstratedUnits: 35_000, committedUnits: 5_000 } },
  ],
  currentMonth: '2026-07',
}

describe('ladder cap (capByMode)', () => {
  it('MONITOR caps everything to MONITOR_LOGGED', () => {
    expect(capByMode('GATED', 'MONITOR')).toBe('MONITOR_LOGGED')
    expect(capByMode('ACTED', 'MONITOR')).toBe('MONITOR_LOGGED')
  })
  it('never escalates a lesser intent', () => {
    expect(capByMode('WARNED', 'ACT')).toBe('WARNED')
    expect(capByMode('NONE', 'GATE')).toBe('NONE')
  })
})

describe('CAPACITY_OVERCOMMIT via engine', () => {
  it('default mode MONITOR: fires but only logs (shadow mode)', () => {
    const d = evaluateCapacityOvercommit(pavel)
    expect(d.fired).toBe(true)
    expect(d.severity).toBe('CRITICAL')
    expect(d.action).toBe('MONITOR_LOGGED')
    expect(d.uncappedAction).toBe('GATED') // calibration signal preserved
  })
  it('GATE mode: same input now gates with the split in reasons', () => {
    const settings: RiskSettings = { CAPACITY_OVERCOMMIT: { mode: 'GATE', thresholds: {} } }
    const d = evaluateCapacityOvercommit(pavel, settings)
    expect(d.action).toBe('GATED')
    expect(d.reasons.join(' ')).toContain('split available')
    expect(d.assessment.splitProposal).toHaveLength(2)
  })
  it('green order does nothing', () => {
    const d = evaluateCapacityOvercommit({ ...pavel, orderUnits: 5_000 })
    expect(d.fired).toBe(false)
    expect(d.action).toBe('NONE')
  })
  it('admin threshold override is respected and snapshotted', () => {
    const settings: RiskSettings = { CAPACITY_OVERCOMMIT: { mode: 'MONITOR', thresholds: { warnPct: 10 } } }
    const d = evaluateCapacityOvercommit({ ...pavel, orderUnits: 5_000 }, settings)
    expect(d.fired).toBe(true) // 5k/25k = 20% > 10%
    expect(d.severity).toBe('WARN')
    expect(d.snapshot.thresholds.warnPct).toBe(10)
  })
  it('snapshot is reproducible: same input → same snapshot', () => {
    const a = evaluateCapacityOvercommit(pavel)
    const b = evaluateCapacityOvercommit(pavel)
    expect(a.snapshot).toEqual(b.snapshot)
    expect(a.snapshot.formulaVersion).toBe('capacity-v1')
    expect(a.snapshot.score).toBe(200)
  })
})

describe('generic ceiling/floor detectors', () => {
  it('ODR_EQUIV_CEILING fires above 1%', () => {
    const d = evaluateCeiling('ODR_EQUIV_CEILING', 1.4, 'ceilingPct', 'HIGH', 'metrics-v1')
    expect(d.fired).toBe(true)
    expect(d.action).toBe('MONITOR_LOGGED') // default mode MONITOR
  })
  it('LATE_SHIP_RATE quiet below 4%', () => {
    const d = evaluateCeiling('LATE_SHIP_RATE', 3.2, 'ceilingPct', 'HIGH', 'metrics-v1')
    expect(d.fired).toBe(false)
  })
  it('OTIF_FLOOR: HIGH below 90, WARN between 90 and 95', () => {
    expect(evaluateFloor('OTIF_FLOOR', 88, 'warnFloorPct', 'highFloorPct', 'metrics-v1').severity).toBe('HIGH')
    expect(evaluateFloor('OTIF_FLOOR', 93, 'warnFloorPct', 'highFloorPct', 'metrics-v1').severity).toBe('WARN')
    expect(evaluateFloor('OTIF_FLOOR', 97, 'warnFloorPct', 'highFloorPct', 'metrics-v1').fired).toBe(false)
  })
  it('null observation (no data) never fires', () => {
    expect(evaluateCeiling('CHARGEBACK_RATE', null, 'ceilingPct', 'HIGH', 'metrics-v1').fired).toBe(false)
    expect(evaluateFloor('OTIF_FLOOR', null, 'warnFloorPct', 'highFloorPct', 'metrics-v1').fired).toBe(false)
  })
})
