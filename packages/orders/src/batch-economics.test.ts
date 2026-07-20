import { describe, it, expect } from 'vitest'
import {
  runBatches,
  deriveBatchMoq,
  selectBatchConfig,
  batchLattice,
  billedUnits,
  assessBatchRun,
  type BatchConfigInput,
} from './batch-economics'

// The prototype's two default batch configs (manufacturing-service-builder-prototype.html):
// Batch 1 (kettle): 1000 units, 3h batch, $310/h, 2.5h changeover, max 40. Batch 2 (small): 100
// units, 1.5h batch, $240/h, 1h changeover, max 6. Minutes = hours × 60; rate in cents.
const B1: BatchConfigInput = { id: 'b1', unitsPerBatch: 1000, batchTimeMinutes: 180, changeoverMinutes: 150, loadedRateCentsPerHour: 31000, maxBatchesPerRun: 40, status: 'ACTIVE' }
const B2: BatchConfigInput = { id: 'b2', unitsPerBatch: 100, batchTimeMinutes: 90, changeoverMinutes: 60, loadedRateCentsPerHour: 24000, maxBatchesPerRun: 6, status: 'ACTIVE' }

describe('runBatches — you cannot make half a batch', () => {
  it('B1 @ 800: one 1,000-unit batch, 200 overrun, cost (2.5h+3h)×$310 = $1,705', () => {
    expect(runBatches(B1, 800)).toEqual({ batches: 1, producedUnits: 1000, overrunUnits: 200, costCents: 170500 })
  })
  it('B2 @ 800: 8 batches exceeds its 6-batch ceiling → null', () => {
    expect(runBatches(B2, 800)).toBeNull()
  })
  it('B2 @ 300: three 100-unit batches, no overrun, cost (1h+1.5h)×$240×3 = $1,800', () => {
    expect(runBatches(B2, 300)).toEqual({ batches: 3, producedUnits: 300, overrunUnits: 0, costCents: 180000 })
  })
})

describe('deriveBatchMoq — MOQ is the smallest batch, never typed', () => {
  it('min of the two batch sizes', () => expect(deriveBatchMoq([B1, B2])).toBe(100))
  it('ignores inactive configs', () => expect(deriveBatchMoq([B1, { ...B2, status: 'DRAFT' }])).toBe(1000))
  it('no active configs → 0', () => expect(deriveBatchMoq([])).toBe(0))
})

describe('selectBatchConfig — least overrun, then least cost', () => {
  it('@ 800 only B1 can run (B2 out of range) → B1', () => expect(selectBatchConfig([B1, B2], 800)?.config.id).toBe('b1'))
  it('@ 300 B2 makes it with zero overrun, B1 overruns 700 → B2', () => expect(selectBatchConfig([B1, B2], 300)?.config.id).toBe('b2'))
  it('@ 550 B2 (50 overrun) beats B1 (450 overrun) → B2', () => expect(selectBatchConfig([B1, B2], 550)?.config.id).toBe('b2'))
})

describe('batchLattice — a quantity snaps UP to a batch multiple', () => {
  it('800 on a 1,000 batch snaps to 1,000, off-lattice', () => expect(batchLattice(B1, 800)).toEqual({ snappedUnits: 1000, onLattice: false }))
  it('300 on a 100 batch is exactly on the lattice', () => expect(batchLattice(B2, 300)).toEqual({ snappedUnits: 300, onLattice: true }))
})

describe('billedUnits — the overrun policy decides who owns the remainder', () => {
  it('100% policy: creator buys the full batch', () => expect(billedUnits(200, 800, 100)).toBe(1000))
  it('50% policy: creator buys half the overrun', () => expect(billedUnits(200, 800, 50)).toBe(900))
  it('0% policy: manufacturer absorbs it all', () => expect(billedUnits(200, 800, 0)).toBe(800))
})

describe('assessBatchRun — the full manufacturing assessment', () => {
  it('@ 800 (unit $4.20, 100% overrun, $2,500 floor): B1, billed 1,000, over the floor', () => {
    const a = assessBatchRun([B1, B2], { qty: 800, unitPriceCents: 420, overrunPolicyPct: 100, minOrderValueCents: 250000 })
    expect(a.ok).toBe(true)
    expect(a.moqUnits).toBe(100)
    expect(a.selectedConfigId).toBe('b1')
    expect(a.billedUnits).toBe(1000) // 800 + 200 overrun at 100%
    expect(a.latticeSnappedUnits).toBe(1000)
    expect(a.belowOrderValueFloor).toBe(false) // 1000 × $4.20 = $4,200 ≥ $2,500
  })
  it('@ 300: B2, on the lattice, and UNDER the $2,500 order-value floor', () => {
    const a = assessBatchRun([B1, B2], { qty: 300, unitPriceCents: 420, overrunPolicyPct: 100, minOrderValueCents: 250000 })
    expect(a.selectedConfigId).toBe('b2')
    expect(a.billedUnits).toBe(300)
    expect(a.onLattice).toBe(true)
    expect(a.belowOrderValueFloor).toBe(true) // 300 × $4.20 = $1,260 < $2,500
  })
  it('a qty no config can make → not ok', () => {
    const a = assessBatchRun([B1, B2], { qty: 5_000_000, unitPriceCents: 420, overrunPolicyPct: 100 })
    expect(a.ok).toBe(false)
  })
})
