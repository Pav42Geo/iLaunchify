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

// ---------------------------------------------------------------------------
// Review-attribution (docs/REVIEW_ATTRIBUTION_MODEL.md) — aspect-note moderation
// + admin controls singleton.
// ---------------------------------------------------------------------------

export async function moderateAspectNote(input: {
  noteId: string
  status: ReviewStatus
  note?: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (input.status === 'HIDDEN' && !input.note?.trim()) {
    return { ok: false, error: 'Hiding a note requires a reason (audited)' }
  }
  const row = await prisma.reviewAspectNote.findUnique({ where: { id: input.noteId } })
  if (!row) return { ok: false, error: 'Note not found' }
  await prisma.reviewAspectNote.update({
    where: { id: row.id },
    data: {
      status: input.status,
      moderatedById: admin.id,
      moderationNote: input.note?.trim().slice(0, 1000) || row.moderationNote,
    },
  })
  await logAuditAs(admin, {
    entityType: 'ReviewAspectNote',
    entityId: row.id,
    action: 'REVIEW_ASPECT_NOTE_MODERATED',
    fromValue: row.status,
    toValue: input.status,
    payload: { aspect: row.aspect, partnerServiceId: row.partnerServiceId, note: input.note?.trim() || undefined },
  })
  revalidatePath('/notifications-center/feedback')
  return { ok: true }
}

export async function updateAttributionControls(input: {
  attributionEnabled: boolean
  reanchorEnabled: boolean
  enforceReanchorFloor: boolean
  offeredAspects: string[]
  reanchorFlagRate: number
  reanchorFlagMinNotes: number
}): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const VALID = ['PACKAGING', 'PRINTING', 'FULFILLMENT']
  const offered = input.offeredAspects.filter((a) => VALID.includes(a))
  const rate = Math.min(1, Math.max(0, Number(input.reanchorFlagRate) || 0))
  const minNotes = Math.max(1, Math.round(Number(input.reanchorFlagMinNotes) || 1))
  const data = {
    attributionEnabled: input.attributionEnabled,
    reanchorEnabled: input.reanchorEnabled,
    enforceReanchorFloor: input.enforceReanchorFloor,
    offeredAspects: offered,
    reanchorFlagRate: rate,
    reanchorFlagMinNotes: minNotes,
    updatedById: admin.id,
  }
  await prisma.reviewAttributionSetting.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  })
  await logAuditAs(admin, {
    entityType: 'ReviewAttributionSetting',
    entityId: '1',
    action: 'REVIEW_ATTRIBUTION_CONTROLS_UPDATED',
    payload: data,
  })
  revalidatePath('/notifications-center/feedback')
  return { ok: true }
}
