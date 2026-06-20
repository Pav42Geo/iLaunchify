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
      requestedById: true,
      order: { select: { totalCents: true } },
    },
  })
  if (!req) return { ok: false, error: 'Cancellation request not found.' }
  if (req.status !== 'PENDING_REVIEW') {
    return { ok: false, error: `Already ${req.status.toLowerCase()}.` }
  }

  // Policy + the at-fault partner are resolved up front so the strike is created
  // atomically with the cancellation. The at-fault partner is the requester — a
  // partner who asked to cancel a dispatch they couldn't fulfill. Creator-initiated
  // requests have no Partner row for the requester, so no strike is recorded.
  const policy = await getOrderSettings()
  const strikePartner =
    decision === 'APPROVED'
      ? await prisma.partner.findFirst({
          where: { userId: req.requestedById },
          select: { id: true },
        })
      : null
  const willStrike = decision === 'APPROVED' && policy.partnerStrikeOnCancel && !!strikePartner

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
      // PartnerStrike is a pending-migration model → cast-guarded until the
      // migration lands (then remove the cast per POST_MIGRATION_CLEANUP).
      if (willStrike && strikePartner) {
        await (
          tx as unknown as {
            partnerStrike: { create: (a: unknown) => Promise<unknown> }
          }
        ).partnerStrike.create({
          data: {
            partnerId: strikePartner.id,
            cancellationRequestId: req.id,
            orderId: req.orderId,
            dispatchId: req.dispatchId,
            reason: 'Approved cancellation request',
            status: 'ACTIVE',
          },
        })
      }
    }
  })

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
      // Strike recorded against the at-fault partner, if the policy is on and the
      // requester is a partner.
      strike: willStrike ? { partnerId: strikePartner?.id ?? null } : undefined,
    },
  })

  revalidatePath('/cancellations')
  revalidatePath(`/orders/${req.orderId}`)
  return { ok: true }
}
