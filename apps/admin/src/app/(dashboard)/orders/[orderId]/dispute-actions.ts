'use server'

// Admin resolution of a creator-opened OrderDispute. Closes the dispute (RESOLVED
// or REJECTED) and returns the order to COMPLETED. V1 is record + close; any refund
// rides the payments capability. OrderDispute is a pending-migration model →
// cast-guarded until it lands.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertOrderTransition, createReprintDispatch } from '@ilaunchify/orders'
import { executeOrderRefund } from '@ilaunchify/payments'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function resolveOrderDispute({
  disputeId,
  decision,
  resolution,
  refundCents,
  strikePartner,
}: {
  disputeId: string
  decision: 'RESOLVED' | 'REJECTED'
  resolution?: string
  /** Refund to issue when RESOLVED in the creator's favor (admin-set, 0 = none). */
  refundCents?: number
  /** When RESOLVED in the creator's favor, record a reliability strike against the
      at-fault manufacturer (admin opt-in — fault in a dispute is case-specific). */
  strikePartner?: boolean
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

  // Reliability strike against the at-fault manufacturer — admin opt-in, RESOLVED
  // only. Supplementary + best-effort + cast-guarded (PartnerStrike), recorded
  // AFTER the resolution commits so a strike-write failure never blocks resolving.
  if (decision === 'RESOLVED' && strikePartner) {
    const manu = await prisma.orderDispatch.findFirst({
      where: { orderId: dispute.orderId, type: 'PRODUCT' },
      select: { id: true, partnerService: { select: { partnerId: true } } },
    })
    const partnerId = manu?.partnerService.partnerId
    if (partnerId) {
      const recorded = await (
        prisma as unknown as { partnerStrike: { create: (a: unknown) => Promise<unknown> } }
      ).partnerStrike
        .create({
          data: {
            partnerId,
            orderId: dispute.orderId,
            dispatchId: manu?.id ?? null,
            reason: 'Upheld quality dispute',
            status: 'ACTIVE',
            notes: `Dispute ${dispute.id} resolved in creator's favor`,
          },
        })
        .then(() => true)
        .catch(() => false)
      await logAuditAs(admin, {
        entityType: 'OrderDispute',
        entityId: dispute.id,
        action: 'ORDER_DISPUTE_PARTNER_STRIKE',
        payload: { orderId: dispute.orderId, partnerId, recorded },
      })
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

// Resolve a LABEL-dispatch dispute with the "reprint" outcome (PARTNER_ROLE_ACCOUNTS
// §3.3.C): spin up a fresh LABEL dispatch cloned from the disputed one, link the two
// via the audit payload, close the dispute RESOLVED, and notify printer + creator.
// The printer ping fires inside createReprintDispatch; the creator ping rides the
// existing dispute-resolved event here.
export async function resolveDisputeWithReprint({
  disputeId,
  dispatchId,
  resolution,
  costCents,
}: {
  disputeId: string
  /** The disputed LABEL dispatch to reprint. */
  dispatchId: string
  resolution?: string
  /** Reprint cost; 0 = goodwill reprint (default). */
  costCents?: number
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const disputeModel = (
    prisma as unknown as {
      orderDispute: {
        findUnique: (a: unknown) => Promise<{ id: string; status: string; orderId: string } | null>
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

  // The dispatch must be a LABEL leg ON this dispute's order — guard against a
  // stale/foreign id from the client.
  const dispatch = await prisma.orderDispatch.findUnique({
    where: { id: dispatchId },
    select: { id: true, type: true, orderId: true },
  })
  if (!dispatch || dispatch.orderId !== dispute.orderId) {
    return { ok: false, error: 'Dispatch not found on this order.' }
  }
  if (dispatch.type !== 'LABEL') {
    return { ok: false, error: 'Reprint applies only to LABEL (print) dispatches.' }
  }

  // Create the reprint (also notifies the printer). Do this before closing the
  // dispute so a failure leaves the dispute open for another attempt.
  const reprint = await createReprintDispatch({ originalDispatchId: dispatchId, costCents })
  if (!reprint.ok) return { ok: false, error: reprint.error }

  const order = await prisma.order.findUnique({
    where: { id: dispute.orderId },
    select: { status: true, creatorUserId: true },
  })

  await prisma.$transaction(async (tx) => {
    await (
      tx as unknown as { orderDispute: { update: (a: unknown) => Promise<unknown> } }
    ).orderDispute.update({
      where: { id: dispute.id },
      data: {
        status: 'RESOLVED',
        resolution: resolution?.trim() || `Reprint issued (dispatch ${reprint.dispatchId}).`,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    })
    if (order?.status === 'DISPUTED') {
      assertOrderTransition('DISPUTED', 'COMPLETED')
      await tx.order.update({
        where: { id: dispute.orderId },
        data: { status: 'COMPLETED' },
      })
    }
  })

  // The reprint↔original↔dispute linkage lives here, in the audit payload.
  // `reprintOfDispatchId` intentionally mirrors the first-class self-relation
  // column Cowork adds with P3 partner scorecards (defect-rate counting needs it
  // queryable). Keep the key name exact: the P3 backfill is mechanical —
  //   UPDATE OrderDispatch SET reprintOfDispatchId = payload->>'reprintOfDispatchId'
  //   WHERE id = <entityId>  (rows where action = 'DISPATCH_REPRINT_CREATED').
  await logAuditAs(admin, {
    entityType: 'OrderDispatch',
    entityId: reprint.dispatchId,
    action: 'DISPATCH_REPRINT_CREATED',
    payload: {
      orderId: dispute.orderId,
      disputeId: dispute.id,
      reprintOfDispatchId: dispatchId,
      reprintDispatchId: reprint.dispatchId,
      manifestVersion: reprint.manifestVersion,
      costCents: Math.max(0, Math.round(costCents ?? 0)),
    },
  })

  // Notify the creator the dispute is resolved (reprint underway) — same event
  // path as resolveOrderDispute. Best-effort.
  if (reprint.creatorUserId) {
    await dispatchNotification({
      userId: reprint.creatorUserId,
      event: 'CREATOR_ORDER_DISPUTE_RESOLVED' as unknown as NotificationEvent,
      data: { orderId: dispute.orderId, decision: 'RESOLVED', outcome: 'reprint' },
      audience: 'creator',
    })
  }

  revalidatePath(`/orders/${dispute.orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}
