'use server'

// Admin resolution of a creator-opened OrderDispute. Closes the dispute (RESOLVED
// or REJECTED) and returns the order to COMPLETED. V1 is record + close; any refund
// rides the payments capability. OrderDispute is a pending-migration model →
// cast-guarded until it lands.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertOrderTransition } from '@ilaunchify/orders'
import { executeOrderRefund } from '@ilaunchify/payments'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function resolveOrderDispute({
  disputeId,
  decision,
  resolution,
  refundCents,
}: {
  disputeId: string
  decision: 'RESOLVED' | 'REJECTED'
  resolution?: string
  /** Refund to issue when RESOLVED in the creator's favor (admin-set, 0 = none). */
  refundCents?: number
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const disputeModel = (
    prisma as unknown as {
      orderDispute: {
        findUnique: (a: unknown) => Promise<{ id: string; status: string; orderId: string } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
  ).orderDispute

  const dispute = await disputeModel.findUnique({
    where: { id: disputeId },
    select: { id: true, status: true, orderId: true },
  })
  if (!dispute) return { ok: false, error: 'Dispute not found.' }
  if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
    return { ok: false, error: `Already ${dispute.status.toLowerCase()}.` }
  }

  const order = await prisma.order.findUnique({
    where: { id: dispute.orderId },
    select: { status: true, creatorUserId: true, totalCents: true },
  })

  await prisma.$transaction(async (tx) => {
    await (
      tx as unknown as { orderDispute: { update: (a: unknown) => Promise<unknown> } }
    ).orderDispute.update({
      where: { id: dispute.id },
      data: {
        status: decision,
        resolution: resolution?.trim() || null,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    })
    // Close the dispute on the order — both decisions return it to COMPLETED.
    if (order?.status === 'DISPUTED') {
      assertOrderTransition('DISPUTED', 'COMPLETED')
      await tx.order.update({
        where: { id: dispute.orderId },
        data: { status: 'COMPLETED' },
      })
    }
  })

  await logAuditAs(admin, {
    entityType: 'OrderDispute',
    entityId: dispute.id,
    action: 'ORDER_DISPUTE_RESOLVED',
    toValue: decision,
    payload: { orderId: dispute.orderId, resolution: resolution?.trim() || null },
  })

  // Refund when the dispute is upheld in the creator's favor and the admin set an
  // amount (capped at the order total). Gated behind STRIPE_REFUNDS_ENABLED (dry-run
  // otherwise). The order stays COMPLETED here; the charge.refunded webhook moves it
  // COMPLETED→REFUNDED once the real refund settles. Best-effort.
  if (decision === 'RESOLVED' && refundCents && refundCents > 0) {
    const capped = Math.min(refundCents, order?.totalCents ?? refundCents)
    try {
      const refundResult = await executeOrderRefund({
        orderId: dispute.orderId,
        refundCents: capped,
        reason: 'NOT_AS_DESCRIBED',
        initiatedByUserId: admin.id,
      })
      await logAuditAs(admin, {
        entityType: 'Order',
        entityId: dispute.orderId,
        action: refundResult.ok
          ? refundResult.executed
            ? 'REFUND_ISSUED'
            : 'REFUND_PLANNED'
          : 'REFUND_FAILED',
        payload: refundResult.ok
          ? {
              refundCents: capped,
              executed: refundResult.executed,
              refundId: refundResult.refundId ?? null,
              source: 'dispute',
            }
          : { refundCents: capped, error: refundResult.error, source: 'dispute' },
      })
    } catch (err) {
      await logAuditAs(admin, {
        entityType: 'Order',
        entityId: dispute.orderId,
        action: 'REFUND_FAILED',
        payload: { refundCents: capped, error: (err as Error).message, source: 'dispute' },
      }).catch(() => {})
    }
  }

  // Notify the creator of the outcome (best-effort). Pending NotificationEvent
  // migration — cast the literal until the enum lands.
  if (order?.creatorUserId) {
    await dispatchNotification({
      userId: order.creatorUserId,
      event: 'CREATOR_ORDER_DISPUTE_RESOLVED' as unknown as NotificationEvent,
      data: { orderId: dispute.orderId, decision },
      audience: 'creator',
    })
  }
  revalidatePath(`/orders/${dispute.orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}
