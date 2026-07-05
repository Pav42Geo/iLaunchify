import { describe, expect, it } from 'vitest'
import { dispatchLedgerMonth, dispatchUnits, isCommittedStatus, monthKey } from './capacity-ledger'

describe('monthKey', () => {
  it('formats UTC year-month', () => {
    expect(monthKey(new Date('2026-07-05T10:00:00Z'))).toBe('2026-07')
    expect(monthKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12')
  })
  it('does not bleed across UTC month boundaries', () => {
    expect(monthKey(new Date('2026-08-01T00:00:00Z'))).toBe('2026-08')
  })
})

describe('dispatchUnits', () => {
  it('unit items: quantity as-is', () => {
    expect(dispatchUnits({ quantity: 5000, packUnitsPerPack: null })).toBe(5000)
  })
  it('pack items: packs × units-per-pack', () => {
    expect(dispatchUnits({ quantity: 100, packUnitsPerPack: 12 })).toBe(1200)
  })
  it('missing item or zero qty books nothing', () => {
    expect(dispatchUnits(null)).toBe(0)
    expect(dispatchUnits({ quantity: 0, packUnitsPerPack: 12 })).toBe(0)
  })
})

describe('isCommittedStatus', () => {
  it('committed span: ACCEPTED through IN_TRANSIT', () => {
    for (const s of ['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK', 'FAILED_QC', 'READY', 'SHIPPED', 'IN_TRANSIT']) {
      expect(isCommittedStatus(s)).toBe(true)
    }
  })
  it('not committed: pre-accept and terminal states', () => {
    for (const s of ['PENDING_ACCEPT', 'DECLINED', 'TIMED_OUT', 'CANCELLED', 'WITHDRAWN', 'DELIVERED']) {
      expect(isCommittedStatus(s)).toBe(false)
    }
  })
})

describe('dispatchLedgerMonth', () => {
  const base = {
    currentEtaAt: null as Date | null,
    proposedDeadlineAt: null as Date | null,
    acceptDeadlineAt: new Date('2026-07-10T00:00:00Z'),
  }
  it('prefers currentEtaAt', () => {
    expect(dispatchLedgerMonth({ ...base, currentEtaAt: new Date('2026-09-15T00:00:00Z') })).toBe('2026-09')
  })
  it('falls back to proposedDeadlineAt then acceptDeadlineAt', () => {
    expect(dispatchLedgerMonth({ ...base, proposedDeadlineAt: new Date('2026-08-20T00:00:00Z') })).toBe('2026-08')
    expect(dispatchLedgerMonth(base)).toBe('2026-07')
  })
})
