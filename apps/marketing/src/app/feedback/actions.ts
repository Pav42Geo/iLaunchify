'use server'

// Enrich step for the tokened /feedback page (docs/FEEDBACK_MODULE.md §3.4).
// Auth model: the signed token IS the authorization — we re-verify it here and
// only touch the response row it points at, for the user it names.

import {
  verifyFeedbackToken,
  enrichFeedback,
  FEEDBACK_TOKEN_MAX_AGE_MS,
} from '@ilaunchify/notifications'

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
  return done ? { ok: true } : { ok: false, error: 'We couldn’t find your response' }
}
