// Dispatch finite-state-machine.
//
// States from DispatchStatus enum. Each Order has 1..N OrderDispatches
// (PRODUCT and LABEL types) advancing independently.
//
// Per docs/USER_ROLES.md decision 2026-05-18:
// - Partners may decline. Decline window: 24h from dispatch creation.
// - On timeout or decline, auto-reroute. After 3 reroutes, flag for manual handling.

type DispatchStatus =
  | 'PENDING_ACCEPT' | 'ACCEPTED' | 'PRODUCING' | 'READY'
  | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED'
  | 'DECLINED' | 'TIMED_OUT' | 'CANCELLED'

const TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  PENDING_ACCEPT: ['ACCEPTED', 'DECLINED', 'TIMED_OUT', 'CANCELLED'],
  ACCEPTED:       ['PRODUCING', 'CANCELLED'],
  PRODUCING:      ['READY', 'CANCELLED'],
  READY:          ['SHIPPED'],
  SHIPPED:        ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT:     ['DELIVERED'],
  DELIVERED:      [],
  DECLINED:       [],
  TIMED_OUT:      [],
  CANCELLED:      [],
}

export function assertDispatchTransition(from: DispatchStatus, to: DispatchStatus): void {
  const allowed = TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new Error(`Invalid Dispatch transition: ${from} → ${to}`)
  }
}

export async function transitionDispatch(
  _dispatchId: string,
  _to: DispatchStatus,
): Promise<void> {
  // Implemented in Week 8
  throw new Error('transitionDispatch: not yet implemented')
}

export const DEFAULT_ACCEPT_WINDOW_HOURS = 24
export const MAX_REROUTES = 3
