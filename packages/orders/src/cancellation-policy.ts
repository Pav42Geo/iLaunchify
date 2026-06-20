// Single source of truth for "can the creator self-cancel this order?" — used by
// both the creator cancel action and the order-page Cancel button so the two can
// never disagree (button shows but action rejects, or vice-versa). PURE.
//
// Policy (Pavel 2026-06-20):
//   - allowed before any partner commits: unpaid, paid, or routing while still
//     AWAITING_PARTNERS / CHANGES_REQUESTED
//   - blocked once a partner has accepted (PARTIALLY_ACCEPTED / FULLY_ACCEPTED) — the
//     order may still read ROUTING until every partner accepts
//   - blocked once in/after fulfillment, or terminal
// An admin can still force-cancel; this governs creator SELF-serve only.

export type CreatorCancelBlockReason = 'TERMINAL' | 'IN_PRODUCTION' | 'PARTNER_COMMITTED'

export interface CreatorCancelEligibility {
  allowed: boolean
  reason: CreatorCancelBlockReason | null
}

// In/after fulfillment, or a terminal/closed state — never creator-cancellable.
const IN_PRODUCTION_OR_TERMINAL = new Set([
  'IN_FULFILLMENT',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'DISPUTED',
])

// A partner has accepted (and likely started producing their leg).
const PARTNER_COMMITTED_AGGREGATES = new Set(['PARTIALLY_ACCEPTED', 'FULLY_ACCEPTED'])

export function canCreatorSelfCancel(order: {
  status: string
  aggregateApprovalStatus?: string | null
}): CreatorCancelEligibility {
  if (IN_PRODUCTION_OR_TERMINAL.has(order.status)) {
    // CANCELLED/REFUNDED/DISPUTED/COMPLETED are "terminal"; the rest are in-production.
    const terminal = ['CANCELLED', 'REFUNDED', 'DISPUTED', 'COMPLETED'].includes(order.status)
    return { allowed: false, reason: terminal ? 'TERMINAL' : 'IN_PRODUCTION' }
  }
  if (PARTNER_COMMITTED_AGGREGATES.has(order.aggregateApprovalStatus ?? 'AWAITING_PARTNERS')) {
    return { allowed: false, reason: 'PARTNER_COMMITTED' }
  }
  return { allowed: true, reason: null }
}
