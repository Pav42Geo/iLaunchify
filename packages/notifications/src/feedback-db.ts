// Feedback DB layer (docs/FEEDBACK_MODULE.md — FB-B/FB-C IO).
// Typed client (Stage 2 migration ran). Vote paths degrade gracefully where
// they ride the send pipeline; the page/action paths surface errors normally.

import { prisma } from '@ilaunchify/db'
import type { FeedbackScore, FeedbackSource } from '@ilaunchify/db'
import { FEEDBACK_PROMPTS, isFeedbackPromptKey } from './feedback-prompts'

// ---------------------------------------------------------------------------
// Vote + enrich (the tokened /feedback flow)
// ---------------------------------------------------------------------------

/**
 * Record a one-click vote — upsert on (user, subject, prompt): re-clicks
 * UPDATE the score (mind-change allowed; the page says "updated"). Tags and
 * comment persist across a score change until the user re-enriches.
 */
export async function recordFeedbackVote(params: {
  userId: string
  role?: string | null
  subjectType: string
  subjectId: string
  promptKey: string
  score: FeedbackScore
  late: boolean
  source?: FeedbackSource
}): Promise<{ id: string; updated: boolean }> {
  const existing = await prisma.feedbackResponse.findUnique({
    where: {
      userId_subjectType_subjectId_promptKey: {
        userId: params.userId,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        promptKey: params.promptKey,
      },
    },
    select: { id: true },
  })
  if (existing) {
    await prisma.feedbackResponse.update({
      where: { id: existing.id },
      data: { score: params.score, late: params.late, source: params.source ?? 'EMAIL_ONE_CLICK' },
    })
    return { id: existing.id, updated: true }
  }
  const row = await prisma.feedbackResponse.create({
    data: {
      userId: params.userId,
      role: params.role ?? null,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      promptKey: params.promptKey,
      score: params.score,
      late: params.late,
      source: params.source ?? 'EMAIL_ONE_CLICK',
    },
    select: { id: true },
  })
  return { id: row.id, updated: false }
}

/** Enrich page step: attach tags + comment to the already-recorded vote. */
export async function enrichFeedback(params: {
  responseId: string
  userId: string // ownership re-check — the id came from the client
  tags: string[]
  comment: string | null
}): Promise<boolean> {
  const row = await prisma.feedbackResponse.findFirst({
    where: { id: params.responseId, userId: params.userId },
    select: { id: true },
  })
  if (!row) return false
  await prisma.feedbackResponse.update({
    where: { id: row.id },
    data: {
      tags: params.tags.slice(0, 8),
      comment: params.comment?.trim().slice(0, 2000) || null,
      source: 'FEEDBACK_PAGE',
    },
  })
  return true
}

/** Always-on account form (PLATFORM/IDEA — repeatable, subjectId null). */
export async function submitAccountFeedback(params: {
  userId: string
  role: string
  subjectType: 'PLATFORM' | 'IDEA'
  score?: FeedbackScore | null
  comment: string
}): Promise<string> {
  const row = await prisma.feedbackResponse.create({
    data: {
      userId: params.userId,
      role: params.role,
      subjectType: params.subjectType,
      subjectId: null,
      promptKey: 'account-general',
      score: params.score ?? null,
      comment: params.comment.trim().slice(0, 4000),
      source: 'ACCOUNT_FORM',
    },
    select: { id: true },
  })
  return row.id
}

// ---------------------------------------------------------------------------
// Eligibility signals (dispatcher) + prompt settings
// ---------------------------------------------------------------------------

/** Recency + already-responded signals for shouldRenderFeedbackBlock. Fails closed-ish: on error, pretend the user just responded (no block > broken email). */
export async function getFeedbackSignals(params: {
  userId: string
  subjectType: string
  subjectId: string
  promptKey: string
}): Promise<{ lastFeedbackAt: Date | null; alreadyRespondedForSubject: boolean }> {
  try {
    const [latest, forSubject] = await Promise.all([
      prisma.feedbackResponse.findFirst({
        where: { userId: params.userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.feedbackResponse.findUnique({
        where: {
          userId_subjectType_subjectId_promptKey: {
            userId: params.userId,
            subjectType: params.subjectType,
            subjectId: params.subjectId,
            promptKey: params.promptKey,
          },
        },
        select: { id: true },
      }),
    ])
    return {
      lastFeedbackAt: latest?.createdAt ?? null,
      alreadyRespondedForSubject: forSubject != null,
    }
  } catch {
    return { lastFeedbackAt: new Date(), alreadyRespondedForSubject: true }
  }
}

/** Admin override row (null fields = code defaults). Null row = pure defaults. */
export async function getPromptSetting(promptKey: string): Promise<{
  enabled: boolean | null
  windowDays: number | null
  autoTicketOnDown: boolean | null
} | null> {
  try {
    const row = await prisma.feedbackPromptSetting.findUnique({ where: { promptKey } })
    if (!row) return null
    return { enabled: row.enabled, windowDays: row.windowDays, autoTicketOnDown: row.autoTicketOnDown }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Payload → subject mapping (pure, exported for the dispatcher + tests)
// ---------------------------------------------------------------------------

/** Which payload key carries the subject id for a prompt's subjectType. */
export function subjectIdFromPayload(
  promptKey: string,
  payload: Record<string, unknown>,
): { subjectType: string; subjectId: string } | null {
  if (!isFeedbackPromptKey(promptKey)) return null
  // Widened: the registry's CURRENT prompts don't cover every subject type —
  // the mapping must stay total as prompts are added.
  const subjectType: string = FEEDBACK_PROMPTS[promptKey].subjectType
  const key =
    subjectType === 'SUPPORT_TICKET'
      ? 'ticketId'
      : subjectType === 'DISPATCH' || subjectType === 'PROOF_LOOP'
        ? 'dispatchId'
        : subjectType === 'ONBOARDING'
          ? 'partnerId'
          : 'orderId' // DELIVERY | ORDER
  const v = payload[key]
  return typeof v === 'string' && v.length > 0 ? { subjectType, subjectId: v } : null
}
