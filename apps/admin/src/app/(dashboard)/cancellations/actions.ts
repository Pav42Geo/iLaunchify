'use server'

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { computeCancellationOutcome } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

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
  const admin = await requireRole('ADMIN')

  const req = await prisma.cancellationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      orderId: true,
      dispatchId: true,
      order: { select: { totalCents: true } },
    },
  })
  if (!req) return { ok: false, error: 'Cancellation request not found.' }
  if (req.status !== 'PENDING_REVIEW') {
    return { ok: false, error: `Already ${req.status.toLowerCase()}.` }
  }

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
      // TODO(B.4 follow-up): full refund + PartnerStrike + PartnerClawback when
      // the order was already in production.
      await tx.order.update({
        where: { id: req.orderId },
        data: { status: 'CANCELLED' },
      })
    }
  })

  // Snapshot the cancellation/refund policy in effect at decision time AND the
  // money breakdown it produces against the order total, so the record is
  // reproducible (the project values audit reproducibility). The refund isn't
  // executed here yet — the Stripe refund call lands with the payments capability —
  // but the exact fee/refund amounts under the live policy are now recorded at
  // decision time rather than recomputed later against possibly-changed settings.
  const policy = await getOrderSettings()
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
    },
  })

  revalidatePath('/cancellations')
  revalidatePath(`/orders/${req.orderId}`)
  return { ok: true }
}
