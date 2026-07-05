'use server'

import { prisma, getOrderSettings } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { computeCancellationOutcome, assertOrderTransition, releaseDispatchCommitted } from '@ilaunchify/orders'
import { executeOrderRefund } from '@ilaunchify/payments'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

// Pending NotificationEvent migration — cast the new literals until the enum lands
// (docs/NOTIFICATIONS-order-lifecycle.md). Drop the cast post-migration.
const evt = (e: string): NotificationEvent => e as unknown as NotificationEvent

type Result = { ok: true } | { ok: false; error: string }

/**
 * B.4 admin review of a partner-requested CancellationRequest (locked
 * 2026-05-19).
 *
 * APPROVE → cancel the order (Order.status = CANCELLED). Per spec the partner
 *   forfeits payment + takes a strike. The refund / PartnerStrike /
 *   PartnerClawback wiring is a follow-up (see TODO) — this lands the review
 *   decision + order cancel + audit.
 * DENY → partner must fulfill; the request is closed with optional notes.
 */
export async function reviewCancellation({
  requestId,
  decision,
  reviewNotes,
}: {
  requestId: string
  decision: 'APPROVED' | 'DENIED'
  reviewNotes?: string
}): Promise<Result> {
  const admin = await requireCapability('refunds:approve')

  const req = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      orderId: true,
      dispatchId: true,
      requestedById: true,
      order: { select: { totalCents: true, status: true, creatorUserId: true } },
    },
  })
  if (!req) return { ok: false, error: 'Cancellation request not found.' }
  if (req.status !== 'PENDING_REVIEW') {
    return { ok: false, error: `Already ${req.status.toLowerCase()}.` }
  }

  // On approval the order is voided (CANCELLED). The FSM allows that only up to the
  // point goods leave the facility (PAID/ROUTING/IN_FULFILLMENT/ON_HOLD/PENDING_PAYMENT).
  // A shipped/delivered order can't be cancelled — surface that instead of writing an
  // illegal state. Any captured payment is returned via a separate Refund record.
  if (decision === 'APPROVED' && req.order) {
    try {
      assertOrderTransition(req.order.status, 'CANCELLED')
    } catch {
      return {
        ok: false,
        error:
          'This order has already shipped or been delivered and can’t be cancelled — handle it as a dispute or refund instead.',
      }
    }
  }

  // Policy + the at-fault partner are resolved up front so the strike is created
  // atomically with the cancellation. The at-fault partner is the requester — a
  // partner who asked to cancel a dispatch they couldn't fulfill. Creator-initiated
  // requests have no Partner row for the requester, so no strike is recorded.
  const policy = await getOrderSettings()
  // The requester is a partner when a Partner row exists for their user (B.4 partner
  // request); creator-initiated requests have none. Resolved regardless of decision
  // so we can notify the partner of either outcome.
  const requesterPartner = await prisma.partner.findFirst({
    where: { userId: req.requestedById },
    select: { id: true },
  })
  const willStrike = decision === 'APPROVED' && policy.partnerStrikeOnCancel && !!requesterPartner

  await prisma.$transaction(async (tx) => {
    await tx.cancellationRequest.update({
      where: { id: req.id },
      data: {
        status: decision,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes?.trim() || null,
      },
    })
    if (decision === 'APPROVED') {
      await tx.order.update({
        where: { id: req.orderId },
        data: { status: 'CANCELLED' },
      })

      // Risk Center M1 — release every committed dispatch's capacity backlog.
      // Dispatch statuses aren't individually flipped here (V1); the ledger
      // release keys off the dispatch's CURRENT (committed) status so the
      // partner's headroom frees up the moment the cancellation is approved.
      const committedDispatches = await tx.orderDispatch.findMany({
        where: { orderId: req.orderId },
        select: {
          id: true,
          status: true,
          partnerServiceId: true,
          currentEtaAt: true,
          proposedDeadlineAt: true,
          acceptDeadlineAt: true,
          orderItem: { select: { quantity: true, packUnitsPerPack: true } },
        },
      })
      for (const d of committedDispatches) {
        await releaseDispatchCommitted(tx, d, d.status)
      }
    }
  })

  // The strike is SUPPLEMENTARY — recorded after the cancellation commits, never
  // inside its transaction. A failed statement inside an interactive transaction
  // poisons the whole tx (CockroachDB), so a missing partner_strike table (before
  // the migration lands, with partnerStrikeOnCancel defaulting true) would otherwise
  // roll back the entire approval. Best-effort + cast-guarded.
  let strikeRecorded = false
  if (willStrike && requesterPartner) {
    strikeRecorded = await (
      prisma as unknown as {
        partnerStrike: { create: (a: unknown) => Promise<unknown> }
      }
    ).partnerStrike
      .create({
        data: {
          partnerId: requesterPartner.id,
          cancellationRequestId: req.id,
          orderId: req.orderId,
          dispatchId: req.dispatchId,
          reason: 'Approved cancellation request',
          status: 'ACTIVE',
        },
      })
      .then(() => true)
      .catch(() => false)
  }

  // Snapshot the money breakdown the policy produces against the order total, so
  // the record is reproducible (the project values audit reproducibility). The
  // refund isn't executed here yet — the Stripe refund call lands with the payments
  // capability — but the exact fee/refund amounts under the live policy are recorded
  // at decision time rather than recomputed later against possibly-changed settings.
  const outcome =
    decision === 'APPROVED'
      ? computeCancellationOutcome(req.order?.totalCents ?? 0, {
          cancellationFeeBps: policy.cancellationFeeBps,
          refundProcessingFeeBps: policy.refundProcessingFeeBps,
        })
      : null

  await logAuditAs(admin, {
    entityType: 'CancellationRequest',
    entityId: req.id,
    action: decision === 'APPROVED' ? 'CANCELLATION_APPROVED' : 'CANCELLATION_DENIED',
    toValue: decision,
    payload: {
      orderId: req.orderId,
      dispatchId: req.dispatchId,
      reviewNotes: reviewNotes?.trim() || null,
      policyAtDecision:
        decision === 'APPROVED'
          ? {
              partnerStrikeOnCancel: policy.partnerStrikeOnCancel,
              cancellationFeeBps: policy.cancellationFeeBps,
              refundProcessingFeeBps: policy.refundProcessingFeeBps,
            }
          : undefined,
      // Computed money breakdown under the policy above (cents). Pending execution.
      refundBreakdown: outcome
        ? {
            basisCents: outcome.basisCents,
            cancellationFeeCents: outcome.cancellationFeeCents,
            processingFeeCents: outcome.processingFeeCents,
            refundCents: outcome.refundCents,
            feesExceededBasis: outcome.feesExceededBasis,
          }
        : undefined,
      // Strike against the at-fault partner — `recorded` is false if the write
      // failed (e.g. partner_strike table not yet migrated), so the approval still
      // succeeds and the gap is visible in the audit trail.
      strike: willStrike
        ? { partnerId: requesterPartner?.id ?? null, recorded: strikeRecorded }
        : undefined,
    },
  })

  // Refund execution — gated behind STRIPE_REFUNDS_ENABLED (dry-run otherwise, which
  // just records the planned amounts). Best-effort: a refund failure must never block
  // an approved cancellation. The order stays CANCELLED regardless (refund is separate).
  if (decision === 'APPROVED' && outcome && outcome.refundCents > 0) {
    try {
      const refundResult = await executeOrderRefund({
        orderId: req.orderId,
        refundCents: outcome.refundCents,
        reason: 'OTHER',
        initiatedByUserId: admin.id,
      })
      await logAuditAs(admin, {
        entityType: 'Order',
        entityId: req.orderId,
        action: refundResult.ok
          ? refundResult.executed
            ? 'REFUND_ISSUED'
            : 'REFUND_PLANNED'
          : 'REFUND_FAILED',
        payload: refundResult.ok
          ? {
              refundCents: outcome.refundCents,
              executed: refundResult.executed,
              refundId: refundResult.refundId ?? null,
              reversals: refundResult.plan.reversals.length,
              platformShareCents: refundResult.plan.platformShareCents,
            }
          : { refundCents: outcome.refundCents, error: refundResult.error },
      })
    } catch (err) {
      await logAuditAs(admin, {
        entityType: 'Order',
        entityId: req.orderId,
        action: 'REFUND_FAILED',
        payload: { refundCents: outcome.refundCents, error: (err as Error).message },
      }).catch(() => {})
    }
  }

  // Notify the affected parties (best-effort — dispatcher never throws).
  if (decision === 'APPROVED' && req.order?.creatorUserId) {
    await dispatchNotification({
      userId: req.order.creatorUserId,
      event: evt('CREATOR_ORDER_CANCELLED'),
      data: { orderId: req.orderId, refundCents: outcome?.refundCents },
      audience: 'creator',
    })
  }
  if (requesterPartner) {
    await dispatchNotification({
      userId: req.requestedById,
      event: evt('PARTNER_CANCELLATION_REVIEWED'),
      data: { orderId: req.orderId, decision },
      audience: 'partner',
    })
  }

  revalidatePath('/cancellations')
  revalidatePath(`/orders/${req.orderId}`)
  return { ok: true }
}
