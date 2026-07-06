'use server'

// Feedback surface actions (docs/FEEDBACK_MODULE.md §3.6): response triage +
// review moderation. Every mutation writes AuditLog.

import { prisma } from '@ilaunchify/db'
import type { FeedbackTriageStatus, ReviewStatus } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function triageFeedback(input: {
  responseId: string
  status: FeedbackTriageStatus
  note?: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const row = await prisma.feedbackResponse.findUnique({ where: { id: input.responseId } })
  if (!row) return { ok: false, error: 'Response not found' }
  await prisma.feedbackResponse.update({
    where: { id: row.id },
    data: {
      status: input.status,
      reviewedById: admin.id,
      ...(input.note?.trim() ? { reviewNote: input.note.trim().slice(0, 1000) } : {}),
    },
  })
  await logAuditAs(admin, {
    entityType: 'FeedbackResponse',
    entityId: row.id,
    action: 'FEEDBACK_TRIAGED',
    fromValue: row.status,
    toValue: input.status,
  })
  revalidatePath('/notifications-center/feedback')
  return { ok: true }
}

export async function moderateReview(input: {
  reviewId: string
  status: ReviewStatus
  note?: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (input.status === 'HIDDEN' && !input.note?.trim()) {
    return { ok: false, error: 'Hiding a review requires a reason (audited)' }
  }
  const row = await prisma.productReview.findUnique({ where: { id: input.reviewId } })
  if (!row) return { ok: false, error: 'Review not found' }
  await prisma.productReview.update({
    where: { id: row.id },
    data: {
      status: input.status,
      moderatedById: admin.id,
      moderationNote: input.note?.trim().slice(0, 1000) || row.moderationNote,
    },
  })
  await logAuditAs(admin, {
    entityType: 'ProductReview',
    entityId: row.id,
    action: 'REVIEW_MODERATED',
    fromValue: row.status,
    toValue: input.status,
    payload: { productId: row.productId, note: input.note?.trim() || undefined },
  })
  revalidatePath('/notifications-center/feedback')
  return { ok: true }
}
