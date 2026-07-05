'use server'

// Creator response to a partner-proposed delivery delay (docs/ROUTING_BINDING_MODEL.md §7).
// A partner who can make the order but not by the quoted date proposed a later date
// (status stayed PENDING_ACCEPT + delayProposedAt set). The creator now:
//   - APPROVES → the dispatch becomes ACCEPTED on the revised date (same finalize as a
//     normal partner accept, via the shared recomputeAggregateApprovalStatus).
//   - REJECTS  → the dispatch is DECLINED and the order is cancelled (refund needed),
//     per D1 (owner-pinned manufacturing can't be rerouted).
// Cast-guarded — the proposal columns ship with a pending migration.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { recomputeAggregateApprovalStatus, bookDispatchCommitted } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

interface OwnedDispatch {
  id: string
  status: string
  orderId: string
  type: string
  manifestVersion: number
  proposedDeadlineAt: Date | null
  delayProposedAt: Date | null
  // Risk Center M1 — capacity-ledger booking on delay-accept.
  partnerServiceId: string
  currentEtaAt: Date | null
  acceptDeadlineAt: Date
  orderItem: { quantity: number; packUnitsPerPack: number | null } | null
}

/** Load a dispatch the current creator owns (order → brand → creatorProfile → user). */
async function loadOwnedDispatch(userId: string, dispatchId: string): Promise<OwnedDispatch | null> {
  return (prisma as unknown as {
    orderDispatch: { findFirst: (a: unknown) => Promise<OwnedDispatch | null> }
  }).orderDispatch.findFirst({
    where: { id: dispatchId, order: { brand: { creatorProfile: { userId } } } },
    select: {
      id: true,
      status: true,
      orderId: true,
      type: true,
      manifestVersion: true,
      proposedDeadlineAt: true,
      delayProposedAt: true,
      partnerServiceId: true,
      currentEtaAt: true,
      acceptDeadlineAt: true,
      orderItem: { select: { quantity: true, packUnitsPerPack: true } },
    },
  })
}

export async function respondToDispatchDelay({
  dispatchId,
  approve,
}: {
  dispatchId: string
  approve: boolean
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Order not found.' }
  if (dispatch.status !== 'PENDING_ACCEPT' || !dispatch.delayProposedAt || !dispatch.proposedDeadlineAt) {
    return { ok: false, error: 'There is no pending delay to respond to.' }
  }

  if (approve) {
    let aggregate = 'AWAITING_PARTNERS'
    await prisma.$transaction(async (tx) => {
      await (tx as unknown as { orderDispatch: { update: (a: unknown) => Promise<unknown> } }).orderDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedManifestVersion: dispatch.manifestVersion,
          // The agreed date becomes the dispatch's deadline; clear the pending flag.
          acceptDeadlineAt: dispatch.proposedDeadlineAt,
          delayProposedAt: null,
        },
      })
      // Risk Center M1 — the agreed (delayed) deadline month gets the booking.
      await bookDispatchCommitted(tx, {
        ...dispatch,
        acceptDeadlineAt: dispatch.proposedDeadlineAt ?? dispatch.acceptDeadlineAt,
      })
      aggregate = await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
      if (aggregate === 'FULLY_ACCEPTED') {
        await tx.order.update({ where: { id: dispatch.orderId }, data: { status: 'IN_FULFILLMENT' } })
      }
    })

    await logAuditAs(user, {
      entityType: 'OrderDispatch',
      entityId: dispatch.id,
      action: 'DISPATCH_DELAY_APPROVED',
      fromValue: 'PENDING_ACCEPT',
      toValue: 'ACCEPTED',
      payload: { orderId: dispatch.orderId, type: dispatch.type, revisedDeadlineAt: dispatch.proposedDeadlineAt?.toISOString() ?? null },
    })
  } else {
    // Reject → decline the dispatch + cancel the order (refund needed). Mirrors the
    // manufacturer-decline path; manufacturing is owner-pinned so there's no reroute.
    // The order is PAID (a dispatch exists), so capture the refund obligation as a
    // structured PENDING SupportRefundRequest — it lands in the admin refund Inbox
    // (approve→executeOrderRefund) instead of living only in a note that could be
    // missed. Amount = the real captured charge.
    const paidCharge = await prisma.charge.findFirst({
      where: { orderId: dispatch.orderId, status: 'SUCCEEDED' },
      select: { amountCents: true },
    })
    await prisma.$transaction(async (tx) => {
      await (tx as unknown as { orderDispatch: { update: (a: unknown) => Promise<unknown> } }).orderDispatch.update({
        where: { id: dispatch.id },
        data: { status: 'DECLINED', declinedAt: new Date(), declineNotes: 'Creator rejected the proposed delivery delay', delayProposedAt: null },
      })
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'CANCELLED',
          aggregateApprovalStatus: 'CANCELLED',
          internalNotes: 'Creator rejected the partner’s proposed delay — order cancelled, refund needed',
        },
      })
      if (paidCharge && paidCharge.amountCents > 0) {
        await tx.supportRefundRequest.create({
          data: {
            orderId: dispatch.orderId,
            requestedById: user.id,
            amountCents: paidCharge.amountCents,
            reason: 'Creator rejected the partner’s proposed delivery delay — order auto-cancelled, full refund owed',
          },
        })
      }
    })

    await logAuditAs(user, {
      entityType: 'OrderDispatch',
      entityId: dispatch.id,
      action: 'DISPATCH_DELAY_REJECTED',
      fromValue: 'PENDING_ACCEPT',
      toValue: 'DECLINED',
      payload: { orderId: dispatch.orderId, type: dispatch.type },
    })
  }

  revalidatePath(`/orders/${dispatch.orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}
