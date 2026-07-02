// =============================================================================
// Order change stage-gate matrix (CHANNEL_MANAGEMENT_SPEC §3.5c) — pure.
//
// The production stage decides what a creator may change and HOW:
//   FREE     applies instantly (re-priced + re-validated, no partner friction)
//   CONSENT  becomes an OrderChangeRequest with impact preview; partner accepts
//            or declines (EDI 860/865 pattern); nothing mutates until acceptance
//   LOCKED   not offered — the UI never renders a control this matrix forbids
//   REDIRECT shipped goods: carrier-level redirect via the logistics rail only
// Stages mirror the dispatch FSM; cancellation stays with the existing
// cancellation-policy module (referenced, not duplicated, here).
// =============================================================================

export const ORDER_CHANGE_STAGES = ['PENDING_ACCEPT', 'ACCEPTED', 'PRODUCING', 'READY', 'SHIPPED'] as const
export type OrderChangeStage = (typeof ORDER_CHANGE_STAGES)[number]

export const CHANGE_KINDS = ['QUANTITY', 'DESTINATION', 'TIMING', 'DESIGN'] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]

export type ChangeGate = 'FREE' | 'CONSENT' | 'LOCKED' | 'REDIRECT'

/** The §3.5c matrix, verbatim. */
const MATRIX: Record<ChangeKind, Record<OrderChangeStage, ChangeGate>> = {
  QUANTITY: {
    PENDING_ACCEPT: 'FREE',
    ACCEPTED: 'CONSENT',
    PRODUCING: 'LOCKED', // the honest answer mid-batch is "order more"
    READY: 'LOCKED',
    SHIPPED: 'LOCKED',
  },
  DESTINATION: {
    PENDING_ACCEPT: 'FREE',
    ACCEPTED: 'FREE', // manifest not cut yet
    PRODUCING: 'CONSENT', // re-validate temp class / carrier eligibility
    READY: 'CONSENT', // re-rate before handoff
    SHIPPED: 'REDIRECT', // carrier-level, best-effort, fees possible
  },
  TIMING: {
    PENDING_ACCEPT: 'FREE',
    ACCEPTED: 'FREE',
    PRODUCING: 'CONSENT',
    READY: 'CONSENT', // includes HOLD_AT_MANUFACTURER when the partner offers storage
    SHIPPED: 'LOCKED',
  },
  DESIGN: {
    PENDING_ACCEPT: 'FREE',
    ACCEPTED: 'CONSENT',
    PRODUCING: 'LOCKED',
    READY: 'LOCKED',
    SHIPPED: 'LOCKED',
  },
}

export function changeGate(kind: ChangeKind, stage: OrderChangeStage): ChangeGate {
  return MATRIX[kind][stage]
}

/** Everything offerable at a stage — drives which controls the UI renders. */
export function availableChanges(stage: OrderChangeStage): Array<{ kind: ChangeKind; gate: Exclude<ChangeGate, 'LOCKED'> }> {
  return CHANGE_KINDS.flatMap((kind) => {
    const gate = MATRIX[kind][stage]
    return gate === 'LOCKED' ? [] : [{ kind, gate }]
  })
}

// --- Change-request lifecycle (the 860/865 handshake) --------------------------

export const CHANGE_REQUEST_STATUSES = ['PROPOSED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'APPLIED'] as const
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number]

const REQUEST_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  PROPOSED: ['ACCEPTED', 'DECLINED', 'WITHDRAWN'],
  ACCEPTED: ['APPLIED'], // acceptance → mutation is a separate, audited step
  DECLINED: [],
  WITHDRAWN: [],
  APPLIED: [],
}

export function canTransitionChangeRequest(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return REQUEST_TRANSITIONS[from]?.includes(to) ?? false
}

/** Route a proposed change: FREE applies directly (no request row needed),
 *  CONSENT opens a request, LOCKED/REDIRECT explain themselves. */
export type ChangeRouting =
  | { path: 'APPLY'; revalidate: true }
  | { path: 'REQUEST'; revalidate: true }
  | { path: 'REJECT'; reason: string }

export function routeChange(kind: ChangeKind, stage: OrderChangeStage): ChangeRouting {
  const gate = changeGate(kind, stage)
  switch (gate) {
    case 'FREE':
      return { path: 'APPLY', revalidate: true }
    case 'CONSENT':
      return { path: 'REQUEST', revalidate: true }
    case 'REDIRECT':
      return { path: 'REJECT', reason: 'Shipped orders can only be redirected through the carrier (logistics) — fees may apply.' }
    case 'LOCKED':
      return {
        path: 'REJECT',
        reason:
          kind === 'QUANTITY' && (stage === 'PRODUCING' || stage === 'READY')
            ? 'Quantity is locked once production starts — place an additional order instead.'
            : 'This change is no longer available at the current production stage.',
      }
  }
}
