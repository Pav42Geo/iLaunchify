// One-click feedback landing (docs/FEEDBACK_MODULE.md §3.4).
//
// The click IS the vote: GET verifies the signed token and records the score
// immediately (idempotent — re-clicks update), then progressively asks for
// tags + an optional comment. Late tokens record flagged `late` with a banner.
// Invalid tokens land on guidance, never a dead end (Part 2 policy).

import { prisma } from '@ilaunchify/db'
import {
  verifyFeedbackToken,
  recordFeedbackVote,
  isFeedbackPromptKey,
  feedbackPrompt,
  promptTags,
  promptWindowMs,
  getPromptSetting,
  FEEDBACK_TOKEN_MAX_AGE_MS,
} from '@ilaunchify/notifications'
import { EnrichForm } from './EnrichForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Feedback — iLaunchify' }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </main>
  )
}

function Invalid() {
  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">This link looks broken</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        The feedback link is incomplete or has expired. You can always share feedback from your
        account instead — open <span className="font-medium text-ink-900">Settings → Give feedback</span>{' '}
        in your iLaunchify app. We read everything.
      </p>
    </Shell>
  )
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const secret = process.env.FEEDBACK_TOKEN_SECRET
  if (!token || !secret) return <Invalid />

  // Verify with the hard ceiling only — lateness is computed against the
  // PROMPT's window below (the window can be admin-tuned per prompt).
  const v = verifyFeedbackToken(token, { secret, softWindowMs: FEEDBACK_TOKEN_MAX_AGE_MS })
  if (!v.ok || !isFeedbackPromptKey(v.promptKey)) return <Invalid />

  const prompt = feedbackPrompt(v.promptKey)
  const setting = await getPromptSetting(v.promptKey)
  const late = Date.now() - v.issuedAt.getTime() > promptWindowMs(v.promptKey, setting?.windowDays)

  const user = await prisma.user
    .findUnique({ where: { id: v.userId }, select: { role: true } })
    .catch(() => null)
  if (!user) return <Invalid />

  // The click records the vote — before any further interaction.
  const { id: responseId, updated } = await recordFeedbackVote({
    userId: v.userId,
    role: user.role,
    subjectType: v.subjectType,
    subjectId: v.subjectId,
    promptKey: v.promptKey,
    score: v.score,
    late,
  })

  return (
    <Shell>
      <div
        aria-hidden
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-xl text-white"
      >
        {v.score === 'UP' ? '👍' : '👎'}
      </div>
      <h1 className="text-center text-xl font-semibold tracking-tight text-ink-900">
        {updated ? 'Got it — updated!' : 'Thanks — noted!'}
      </h1>
      <p className="mt-1 text-center text-sm text-ink-600">
        {prompt.question} · You said{' '}
        <span className="font-medium text-ink-900">
          {v.score === 'UP' ? 'it was great' : 'not so great'}
        </span>
        .
      </p>
      {late && (
        <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-center text-xs text-ink-500">
          This one came in past the response window — we've saved it and will read it, it just
          won't count toward partner scores.
        </p>
      )}
      <div className="mt-6">
        <EnrichForm
          token={token}
          responseId={responseId}
          score={v.score}
          tags={[...promptTags(v.promptKey, v.score)]}
        />
      </div>
    </Shell>
  )
}
