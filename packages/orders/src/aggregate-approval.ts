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

import type { Prisma } from '@ilaunchify/db'

export type AggregateStatus =
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
 * PURE — derive the aggregate approval status from the current order state and
 * the set of per-dispatch statuses. No I/O, so the rules (which are the
 * correctness keystone for multi-component + multi-SKU baskets — the order only
 * reaches FULLY_ACCEPTED when every live leg of every item has accepted) are
 * unit-testable without a database. `recomputeAggregateApprovalStatus` is the
 * thin I/O shell that reads the rows, calls this, and writes the result back.
 *
 * Rules (docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md §2), in precedence order:
 *   - order/aggregate already CANCELLED  → CANCELLED (sticky, never downgraded)
 *   - no dispatches yet                  → keep current
 *   - any CHANGES_REQUESTED              → CHANGES_REQUESTED
 *   - all LIVE legs accepted, none pending → FULLY_ACCEPTED
 *   - some accepted + some pending       → PARTIALLY_ACCEPTED
 *   - otherwise                          → AWAITING_PARTNERS
 * Failure-terminal rows (declined/timed-out/withdrawn/cancelled/failed-QC) are
 * excluded from the "all accepted" check because a rerouted leg leaves a stale
 * terminal row beside its fresh PENDING_ACCEPT replacement.
 */
export function computeAggregateStatus(params: {
  current: AggregateStatus | string
  orderStatus: string
  dispatchStatuses: string[]
}): AggregateStatus {
  const { current, orderStatus, dispatchStatuses } = params

  if (current === 'CANCELLED' || orderStatus === 'CANCELLED') {
    return 'CANCELLED'
  }
  if (dispatchStatuses.length === 0) {
    return current as AggregateStatus
  }

  const anyChangesRequested = dispatchStatuses.some((s) => s === 'CHANGES_REQUESTED')
  const anyPending = dispatchStatuses.some((s) => s === 'PENDING_ACCEPT')
  const liveStatuses = dispatchStatuses.filter((s) => !FAILURE_TERMINAL.has(s))
  const allLiveAccepted =
    liveStatuses.length > 0 && liveStatuses.every((s) => POST_ACCEPTED.has(s))
  const anyAccepted = dispatchStatuses.some((s) => POST_ACCEPTED.has(s))

  if (anyChangesRequested) return 'CHANGES_REQUESTED'
  if (allLiveAccepted && !anyPending) return 'FULLY_ACCEPTED'
  if (anyAccepted && anyPending) return 'PARTIALLY_ACCEPTED'
  return 'AWAITING_PARTNERS'
}

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

  const next = computeAggregateStatus({
    current: order.aggregateApprovalStatus,
    orderStatus: order.status,
    dispatchStatuses: dispatches.map((d) => d.status),
  })

  // Preserve the original no-write short-circuits: a CANCELLED order/aggregate
  // and the no-dispatches case never write (they just report the value).
  const shortCircuited =
    order.aggregateApprovalStatus === 'CANCELLED' ||
    order.status === 'CANCELLED' ||
    dispatches.length === 0
  if (!shortCircuited && next !== order.aggregateApprovalStatus) {
    await tx.order.update({
      where: { id: orderId },
      data: { aggregateApprovalStatus: next },
    })
  }
  return next
}
