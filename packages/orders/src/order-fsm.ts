// Order finite-state-machine.
//
// States from prisma schema OrderStatus enum:
//   PENDING_PAYMENT → PAID → ROUTING → IN_FULFILLMENT → READY_TO_SHIP →
//   SHIPPED → IN_TRANSIT → DELIVERED → COMPLETED
//   Side states: CANCELLED, REFUNDED, ON_HOLD, DISPUTED

type OrderStatus =
  | 'PENDING_PAYMENT' | 'PAID' | 'ROUTING' | 'IN_FULFILLMENT' | 'READY_TO_SHIP'
  | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED'
  | 'CANCELLED' | 'REFUNDED' | 'ON_HOLD' | 'DISPUTED'

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID:            ['ROUTING', 'REFUNDED', 'DISPUTED'],
  ROUTING:         ['IN_FULFILLMENT', 'ON_HOLD'],
  IN_FULFILLMENT:  ['READY_TO_SHIP', 'ON_HOLD'],
  READY_TO_SHIP:   ['SHIPPED'],
  SHIPPED:         ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT:      ['DELIVERED'],
  DELIVERED:       ['COMPLETED', 'DISPUTED', 'REFUNDED'],
  COMPLETED:       ['DISPUTED', 'REFUNDED'],
  CANCELLED:       [],
  REFUNDED:        [],
  ON_HOLD:         ['ROUTING', 'IN_FULFILLMENT', 'CANCELLED'],
  DISPUTED:        ['DELIVERED', 'COMPLETED', 'REFUNDED'],
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new Error(`Invalid Order transition: ${from} → ${to}`)
  }
}

/**
 * Stub: transitions an order. Real implementation wraps the DB update + emits
 * domain events for the transfer scheduler / notification system.
 */
export async function transitionOrder(
  _orderId: string,
  _to: OrderStatus,
): Promise<void> {
  // Implemented in Week 8 (Stripe Connect + dual-dispatch wiring per ROADMAP.md)
  throw new Error('transitionOrder: not yet implemented')
}
