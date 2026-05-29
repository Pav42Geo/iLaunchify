// Phase H — aggregate approval status maintenance.
//
// Order.aggregateApprovalStatus is derived from the per-dispatch FSM
// state. This helper computes it from current dispatch rows and writes
// it back to the Order row. Call inside the transaction that just
// transitioned a dispatch so the read-write window is consistent.
//
// Aggregation rules (per docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md §2):
//   * any CHANGES_REQUESTED  → CHANGES_REQUESTED
//   * all ACCEPTED or further → FULLY_ACCEPTED
//   * any ACCEPTED + any PENDING_ACCEPT → PARTIALLY_ACCEPTED
//   * any PENDING_ACCEPT, none ACCEPTED → AWAITING_PARTNERS
//   * order already CANCELLED       → CANCELLED (no override)

import type { Prisma } from '@prisma/client'

type AggregateStatus =
  | 'AWAITING_PARTNERS'
  | 'PARTIALLY_ACCEPTED'
  | 'CHANGES_REQUESTED'
  | 'FULLY_ACCEPTED'
  | 'CANCELLED'

// Dispatches in a post-acceptance state count as "accepted" for the
// aggregate calculation — they got there by passing through ACCEPTED.
const POST_ACCEPTED = new Set([
  'ACCEPTED',
  'PRODUCING',
  'QUALITY_CHECK',
  'READY',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
])

const FAILURE_TERMINAL = new Set([
  'DECLINED',
  'TIMED_OUT',
  'WITHDRAWN',
  'CANCELLED',
  'FAILED_QC',
])

/**
 * Read every OrderDispatch row for the order, compute the aggregate
 * status, write it back to the Order row. Skips write when already at
 * CANCELLED so admin-cancels stick.
 */
export async function recomputeAggregateApprovalStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<AggregateStatus> {
  const [order, dispatches] = await Promise.all([
    tx.order.findUnique({
      where: { id: orderId },
      select: { aggregateApprovalStatus: true, status: true },
    }),
    tx.orderDispatch.findMany({
      where: { orderId },
      select: { status: true },
    }),
  ])
  if (!order) throw new Error(`Order ${orderId} not found`)

  // Sticky CANCELLED — don't downgrade
  if (
    order.aggregateApprovalStatus === 'CANCELLED' ||
    order.status === 'CANCELLED'
  ) {
    return 'CANCELLED'
  }

  if (dispatches.length === 0) {
    return order.aggregateApprovalStatus as AggregateStatus
  }

  const anyChangesRequested = dispatches.some(
    (d) => d.status === 'CHANGES_REQUESTED',
  )
  const anyPending = dispatches.some((d) => d.status === 'PENDING_ACCEPT')
  // For "all accepted or further" we exclude failure-terminal rows that
  // were rerouted — those are replaced by fresh PENDING_ACCEPT rows on
  // the new partner, so a stale DECLINED + a fresh PENDING shouldn't
  // count as fully-accepted-with-leftovers.
  const liveDispatches = dispatches.filter(
    (d) => !FAILURE_TERMINAL.has(d.status),
  )
  const allLiveAccepted =
    liveDispatches.length > 0 &&
    liveDispatches.every((d) => POST_ACCEPTED.has(d.status))
  const anyAccepted = dispatches.some((d) => POST_ACCEPTED.has(d.status))

  let next: AggregateStatus
  if (anyChangesRequested) {
    next = 'CHANGES_REQUESTED'
  } else if (allLiveAccepted && !anyPending) {
    next = 'FULLY_ACCEPTED'
  } else if (anyAccepted && anyPending) {
    next = 'PARTIALLY_ACCEPTED'
  } else {
    next = 'AWAITING_PARTNERS'
  }

  if (next !== order.aggregateApprovalStatus) {
    await tx.order.update({
      where: { id: orderId },
      data: { aggregateApprovalStatus: next },
    })
  }
  return next
}
