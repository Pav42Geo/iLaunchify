'use server'

// Always-on account feedback (docs/FEEDBACK_MODULE.md §3.4) — no window, ever.

import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { submitAccountFeedback } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

export async function sendAccountFeedback(input: {
  kind: 'PLATFORM' | 'IDEA'
  score?: 'UP' | 'DOWN' | null
  comment: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  const comment = input.comment.trim()
  if (comment.length < 5) return { ok: false, error: 'Tell us a little more — a few words at least.' }
  const id = await submitAccountFeedback({
    userId: user.id,
    role: user.role,
    subjectType: input.kind,
    score: input.score ?? null,
    comment,
  })
  await logAuditAs(user, {
    entityType: 'FeedbackResponse',
    entityId: id,
    action: 'ACCOUNT_FEEDBACK_SUBMITTED',
    payload: { kind: input.kind, hasScore: input.score != null },
  })
  revalidatePath('/settings/feedback')
  return { ok: true }
}
