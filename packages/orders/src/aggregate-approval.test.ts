import { describe, it, expect } from 'vitest'
import { computeAggregateStatus } from './aggregate-approval'

// Helper: default a non-cancelled order in the AWAITING state.
const agg = (dispatchStatuses: string[], over: { current?: string; orderStatus?: string } = {}) =>
  computeAggregateStatus({
    current: over.current ?? 'AWAITING_PARTNERS',
    orderStatus: over.orderStatus ?? 'ROUTING',
    dispatchStatuses,
  })

describe('computeAggregateStatus — base transitions', () => {
  it('all pending → AWAITING_PARTNERS', () => {
    expect(agg(['PENDING_ACCEPT', 'PENDING_ACCEPT'])).toBe('AWAITING_PARTNERS')
  })

  it('one accepted + one pending → PARTIALLY_ACCEPTED', () => {
    expect(agg(['ACCEPTED', 'PENDING_ACCEPT'])).toBe('PARTIALLY_ACCEPTED')
  })

  it('all accepted → FULLY_ACCEPTED', () => {
    expect(agg(['ACCEPTED', 'ACCEPTED'])).toBe('FULLY_ACCEPTED')
  })

  it('post-acceptance states (shipped/delivered) still count as accepted → FULLY_ACCEPTED', () => {
    expect(agg(['SHIPPED', 'DELIVERED', 'PRODUCING'])).toBe('FULLY_ACCEPTED')
  })
})

describe('computeAggregateStatus — precedence', () => {
  it('any CHANGES_REQUESTED wins, even alongside accepted/pending', () => {
    expect(agg(['ACCEPTED', 'CHANGES_REQUESTED', 'PENDING_ACCEPT'])).toBe('CHANGES_REQUESTED')
  })

  it('CANCELLED order is sticky regardless of dispatch states', () => {
    expect(agg(['ACCEPTED', 'CHANGES_REQUESTED'], { orderStatus: 'CANCELLED' })).toBe('CANCELLED')
  })

  it('CANCELLED aggregate is sticky and never downgraded', () => {
    expect(agg(['PENDING_ACCEPT'], { current: 'CANCELLED' })).toBe('CANCELLED')
  })

  it('no dispatches → keeps the current status unchanged', () => {
    expect(agg([], { current: 'PARTIALLY_ACCEPTED' })).toBe('PARTIALLY_ACCEPTED')
  })
})

describe('computeAggregateStatus — rerouted / failure-terminal rows', () => {
  it('a stale DECLINED beside an ACCEPTED (no pending) still reads FULLY_ACCEPTED', () => {
    // The declined leg was rerouted; its replacement already accepted.
    expect(agg(['DECLINED', 'ACCEPTED'])).toBe('FULLY_ACCEPTED')
  })

  it('a DECLINED beside a fresh PENDING (the reroute) reads AWAITING_PARTNERS', () => {
    expect(agg(['DECLINED', 'PENDING_ACCEPT'])).toBe('AWAITING_PARTNERS')
  })

  it('DECLINED + ACCEPTED + PENDING → PARTIALLY_ACCEPTED', () => {
    expect(agg(['DECLINED', 'ACCEPTED', 'PENDING_ACCEPT'])).toBe('PARTIALLY_ACCEPTED')
  })

  it('every leg failure-terminal → AWAITING_PARTNERS (no live leg to be "fully accepted")', () => {
    expect(agg(['DECLINED', 'TIMED_OUT', 'WITHDRAWN'])).toBe('AWAITING_PARTNERS')
  })
})

describe('computeAggregateStatus — multi-SKU basket (the ships-together guarantee)', () => {
  // 2 items, each a PRODUCT + LABEL leg = 4 dispatches.
  it('reaches FULLY_ACCEPTED only when every leg of every item accepts', () => {
    expect(agg(['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'ACCEPTED'])).toBe('FULLY_ACCEPTED')
  })

  it('one still-pending leg holds the whole basket at PARTIALLY_ACCEPTED', () => {
    expect(agg(['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'PENDING_ACCEPT'])).toBe('PARTIALLY_ACCEPTED')
  })

  it('a CHANGES_REQUESTED on any item leg flags the whole basket', () => {
    expect(agg(['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'CHANGES_REQUESTED'])).toBe('CHANGES_REQUESTED')
  })
})
