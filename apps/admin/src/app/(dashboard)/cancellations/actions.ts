'use server'

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
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
    select: { id: true, status: true, orderId: true, dispatchId: true },
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

  // Snapshot the cancellation/refund policy in effect at decision time, so when
  // the strike/refund-retention flows ship the record is reproducible (the
  // project values audit reproducibility). The policy isn't enforced here yet.
  const policy = await getOrderSettings()

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
    },
  })

  revalidatePath('/cancellations')
  revalidatePath(`/orders/${req.orderId}`)
  return { ok: true }
}
