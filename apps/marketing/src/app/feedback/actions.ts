'use server'

// Enrich step for the tokened /feedback page (docs/FEEDBACK_MODULE.md §3.4).
// Auth model: the signed token IS the authorization — we re-verify it here and
// only touch the response row it points at, for the user it names.
//
// Auto-ticket (§3.6): DOWN + comment on a prompt with autoTicketOnDown (code
// default, admin-overridable) opens a support ticket linked back to the
// response. Best-effort — a ticket failure never loses the feedback.

import { prisma } from '@ilaunchify/db'
import {
  verifyFeedbackToken,
  enrichFeedback,
  getPromptSetting,
  isFeedbackPromptKey,
  feedbackPrompt,
  FEEDBACK_TOKEN_MAX_AGE_MS,
} from '@ilaunchify/notifications'
import { createTicket } from '@ilaunchify/support'

export async function submitEnrichment(input: {
  token: string
  responseId: string
  tags: string[]
  comment: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.FEEDBACK_TOKEN_SECRET
  if (!secret) return { ok: false, error: 'Feedback is not configured' }
  const v = verifyFeedbackToken(input.token, {
    secret,
    softWindowMs: FEEDBACK_TOKEN_MAX_AGE_MS, // lateness already recorded on the vote
  })
  if (!v.ok) return { ok: false, error: 'This link is no longer valid' }
  const done = await enrichFeedback({
    responseId: input.responseId,
    userId: v.userId,
    tags: input.tags,
    comment: input.comment || null,
  })
  if (!done) return { ok: false, error: 'We couldn’t find your response' }

  // ---- Auto-ticket on 👎 + comment (best-effort) ----------------------------
  try {
    const comment = input.comment.trim()
    if (v.score === 'DOWN' && comment && isFeedbackPromptKey(v.promptKey)) {
      const prompt = feedbackPrompt(v.promptKey)
      const setting = await getPromptSetting(v.promptKey)
      const autoTicket = setting?.autoTicketOnDown ?? prompt.autoTicketOnDown
      const response = await prisma.feedbackResponse.findUnique({
        where: { id: input.responseId },
        select: { supportTicketId: true, role: true },
      })
      if (autoTicket && response && !response.supportTicketId) {
        const ticket = await createTicket({
          requesterUserId: v.userId,
          requesterRole: (response.role === 'PARTNER' ? 'PARTNER' : 'CREATOR') as never,
          categorySlug: 'other',
          subject: `👎 ${prompt.question} — ${v.subjectType} ${v.subjectId.slice(-8)}`,
          body: `${comment}\n\nTags: ${input.tags.join(', ') || '—'}\n(Auto-opened from a thumbs-down feedback response.)`,
          ...(v.subjectType === 'ORDER' || v.subjectType === 'DELIVERY'
            ? { entityType: 'Order', entityId: v.subjectId }
            : {}),
        })
        await prisma.feedbackResponse.update({
          where: { id: input.responseId },
          data: { supportTicketId: ticket.id },
        })
      }
    }
  } catch {
    // feedback is saved either way — ticket creation is advisory
  }

  return { ok: true }
}
