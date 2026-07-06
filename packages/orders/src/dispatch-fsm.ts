// Dispatch finite-state-machine.
//
// States from DispatchStatus enum. Each Order has 1..N OrderDispatches
// (PRODUCT and LABEL types) advancing independently.
//
// Per docs/USER_ROLES.md decision 2026-05-18:
// - Partners may decline. Decline window: 24h from dispatch creation.
// - On timeout or decline, auto-reroute. After 3 reroutes, flag for manual handling.

type DispatchStatus =
  | 'PENDING_ACCEPT' | 'ACCEPTED' | 'PRODUCING'
  | 'QUALITY_CHECK' | 'FAILED_QC'
  | 'READY' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED'
  | 'DECLINED' | 'TIMED_OUT' | 'CANCELLED'

// Partner workflow with QC sub-states (B6):
//   PRODUCING → QUALITY_CHECK → READY (happy path)
//   PRODUCING → QUALITY_CHECK → FAILED_QC (rare; admin reroutes manually)
//   PRODUCING → READY (skip QC for low-risk dispatches)
// SHIPPED splits into IN_TRANSIT before DELIVERED for partners with carrier
// integration that surfaces in-transit signals (V1: partner manually marks).
const TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  PENDING_ACCEPT: ['ACCEPTED', 'DECLINED', 'TIMED_OUT', 'CANCELLED'],
  ACCEPTED:       ['PRODUCING', 'CANCELLED'],
  PRODUCING:      ['QUALITY_CHECK', 'READY', 'CANCELLED'],
  QUALITY_CHECK:  ['READY', 'FAILED_QC', 'CANCELLED'],
  FAILED_QC:      ['CANCELLED'],            // recovery happens via admin reroute
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
/** Default reroute cap when OrderSettings.maxReroutes is unset. */
export const MAX_REROUTES = 3

// ─── Reroute budget (settings-driven cap) ────────────────────────────────────
// The cap is admin-tunable via OrderSettings.maxReroutes, edited on the Routing
// & Rotation control room (Dispatch lifecycle tab). These pure helpers are the
// SINGLE definition of "how many reroutes are allowed" — resolve the configured
// value once, then gate against a dispatch's rerouteCount.
//
// NOTE (2026-07-06): live enforcement is not wired yet — `transitionDispatch`
// is still a stub and V1 reroute is manual, so nothing INCREMENTS/BLOCKS on this
// budget in production today. When the dispatch-transition + auto-reroute path
// lands (Week 8), it consumes these helpers instead of a hardcoded literal, so
// the admin knob is authoritative from day one. Until then the setting is real
// and stored; only the enforcement caller is pending.

/** Resolve the effective reroute cap: the configured value, or the default. */
export function resolveMaxReroutes(configured?: number | null): number {
  if (configured == null || !Number.isFinite(configured) || configured < 0) {
    return MAX_REROUTES
  }
  return Math.floor(configured)
}

/** How many reroutes remain for a dispatch (never negative). */
export function rerouteBudgetRemaining(rerouteCount: number, configured?: number | null): number {
  const cap = resolveMaxReroutes(configured)
  return Math.max(0, cap - Math.max(0, Math.floor(rerouteCount)))
}

/** Whether another reroute is permitted for a dispatch under the configured cap. */
export function canReroute(rerouteCount: number, configured?: number | null): boolean {
  return rerouteBudgetRemaining(rerouteCount, configured) > 0
}
