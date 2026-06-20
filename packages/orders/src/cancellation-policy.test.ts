import { describe, it, expect } from 'vitest'
import { canCreatorSelfCancel } from './cancellation-policy'

describe('canCreatorSelfCancel', () => {
  it('allows an unpaid order awaiting partners', () => {
    expect(canCreatorSelfCancel({ status: 'PENDING_PAYMENT', aggregateApprovalStatus: 'AWAITING_PARTNERS' }))
      .toEqual({ allowed: true, reason: null })
  })

  it('allows a paid, not-yet-accepted order', () => {
    expect(canCreatorSelfCancel({ status: 'PAID', aggregateApprovalStatus: 'AWAITING_PARTNERS' }).allowed).toBe(true)
  })

  it('allows routing while awaiting partners or changes requested', () => {
    expect(canCreatorSelfCancel({ status: 'ROUTING', aggregateApprovalStatus: 'AWAITING_PARTNERS' }).allowed).toBe(true)
    expect(canCreatorSelfCancel({ status: 'ROUTING', aggregateApprovalStatus: 'CHANGES_REQUESTED' }).allowed).toBe(true)
  })

  it('blocks once a partner has accepted, even if order still reads ROUTING', () => {
    expect(canCreatorSelfCancel({ status: 'ROUTING', aggregateApprovalStatus: 'PARTIALLY_ACCEPTED' }))
      .toEqual({ allowed: false, reason: 'PARTNER_COMMITTED' })
    expect(canCreatorSelfCancel({ status: 'ROUTING', aggregateApprovalStatus: 'FULLY_ACCEPTED' }).reason)
      .toBe('PARTNER_COMMITTED')
  })

  it('blocks in-production statuses', () => {
    for (const status of ['IN_FULFILLMENT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED']) {
      expect(canCreatorSelfCancel({ status }).reason).toBe('IN_PRODUCTION')
    }
  })

  it('blocks terminal statuses', () => {
    for (const status of ['CANCELLED', 'REFUNDED', 'DISPUTED', 'COMPLETED']) {
      expect(canCreatorSelfCancel({ status }).reason).toBe('TERMINAL')
    }
  })

  it('treats a missing aggregate as awaiting partners (allowed pre-fulfillment)', () => {
    expect(canCreatorSelfCancel({ status: 'PAID' }).allowed).toBe(true)
  })
})
