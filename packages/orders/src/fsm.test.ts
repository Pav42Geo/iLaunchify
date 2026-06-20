import { describe, it, expect } from 'vitest'
import { assertOrderTransition } from './order-fsm'
import { assertDispatchTransition } from './dispatch-fsm'

// The status unions are module-private; derive the param types from the
// asserters so the casts below stay honest.
type OS = Parameters<typeof assertOrderTransition>[0]
type DS = Parameters<typeof assertDispatchTransition>[0]

// The documented transition spec (mirrors order-fsm/dispatch-fsm). These tests
// pin it: drop an allowed edge in the source and "permits every documented
// transition" fails; loosen a guard and "rejects undocumented" fails.
const ORDER_ALLOWED: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['ROUTING', 'REFUNDED', 'DISPUTED', 'CANCELLED'],
  ROUTING: ['IN_FULFILLMENT', 'ON_HOLD', 'CANCELLED'],
  IN_FULFILLMENT: ['READY_TO_SHIP', 'ON_HOLD', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED'],
  SHIPPED: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'DISPUTED', 'REFUNDED'],
  COMPLETED: ['DISPUTED', 'REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  ON_HOLD: ['ROUTING', 'IN_FULFILLMENT', 'CANCELLED'],
  DISPUTED: ['DELIVERED', 'COMPLETED', 'REFUNDED'],
}

const DISPATCH_ALLOWED: Record<string, string[]> = {
  PENDING_ACCEPT: ['ACCEPTED', 'DECLINED', 'TIMED_OUT', 'CANCELLED'],
  ACCEPTED: ['PRODUCING', 'CANCELLED'],
  PRODUCING: ['QUALITY_CHECK', 'READY', 'CANCELLED'],
  QUALITY_CHECK: ['READY', 'FAILED_QC', 'CANCELLED'],
  FAILED_QC: ['CANCELLED'],
  READY: ['SHIPPED'],
  SHIPPED: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  DECLINED: [],
  TIMED_OUT: [],
  CANCELLED: [],
}

describe('assertOrderTransition', () => {
  it('permits every documented transition', () => {
    for (const [from, tos] of Object.entries(ORDER_ALLOWED)) {
      for (const to of tos) {
        expect(() => assertOrderTransition(from as OS, to as OS)).not.toThrow()
      }
    }
  })

  it('rejects undocumented transitions (skipping ahead / going backward)', () => {
    expect(() => assertOrderTransition('PENDING_PAYMENT' as OS, 'DELIVERED' as OS)).toThrow(
      /Invalid Order transition/,
    )
    expect(() => assertOrderTransition('PAID' as OS, 'SHIPPED' as OS)).toThrow()
    expect(() => assertOrderTransition('COMPLETED' as OS, 'PAID' as OS)).toThrow()
    expect(() => assertOrderTransition('READY_TO_SHIP' as OS, 'PAID' as OS)).toThrow()
  })

  it('an order can be cancelled up to the point goods leave the facility', () => {
    // Admin cancellation approve / creator cancel — legal before SHIPPED.
    for (const from of ['PENDING_PAYMENT', 'PAID', 'ROUTING', 'IN_FULFILLMENT', 'ON_HOLD']) {
      expect(() => assertOrderTransition(from as OS, 'CANCELLED' as OS)).not.toThrow()
    }
  })

  it('a shipped/delivered order cannot be CANCELLED (use dispute/refund)', () => {
    for (const from of ['READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED']) {
      expect(() => assertOrderTransition(from as OS, 'CANCELLED' as OS)).toThrow()
    }
  })

  it('terminal states permit no outgoing transition', () => {
    for (const terminal of ['CANCELLED', 'REFUNDED']) {
      for (const to of Object.keys(ORDER_ALLOWED)) {
        expect(() => assertOrderTransition(terminal as OS, to as OS)).toThrow()
      }
    }
  })

  it('a status cannot transition to itself unless explicitly allowed', () => {
    for (const status of Object.keys(ORDER_ALLOWED)) {
      if (!ORDER_ALLOWED[status]!.includes(status)) {
        expect(() => assertOrderTransition(status as OS, status as OS)).toThrow()
      }
    }
  })
})

describe('assertDispatchTransition', () => {
  it('permits every documented transition', () => {
    for (const [from, tos] of Object.entries(DISPATCH_ALLOWED)) {
      for (const to of tos) {
        expect(() => assertDispatchTransition(from as DS, to as DS)).not.toThrow()
      }
    }
  })

  it('rejects undocumented transitions', () => {
    expect(() => assertDispatchTransition('PENDING_ACCEPT' as DS, 'SHIPPED' as DS)).toThrow(
      /Invalid Dispatch transition/,
    )
    // FAILED_QC only recovers via admin reroute → CANCELLED, never back to READY.
    expect(() => assertDispatchTransition('FAILED_QC' as DS, 'READY' as DS)).toThrow()
    expect(() => assertDispatchTransition('DECLINED' as DS, 'ACCEPTED' as DS)).toThrow()
  })

  it('the happy path PENDING_ACCEPT → … → DELIVERED is fully connected', () => {
    const happy = [
      'PENDING_ACCEPT',
      'ACCEPTED',
      'PRODUCING',
      'QUALITY_CHECK',
      'READY',
      'SHIPPED',
      'IN_TRANSIT',
      'DELIVERED',
    ]
    for (let i = 0; i < happy.length - 1; i++) {
      expect(() => assertDispatchTransition(happy[i] as DS, happy[i + 1] as DS)).not.toThrow()
    }
  })

  it('terminal states permit no outgoing transition', () => {
    for (const terminal of ['DELIVERED', 'DECLINED', 'TIMED_OUT', 'CANCELLED']) {
      for (const to of Object.keys(DISPATCH_ALLOWED)) {
        expect(() => assertDispatchTransition(terminal as DS, to as DS)).toThrow()
      }
    }
  })
})
