'use client'

// Inline triage / moderation controls for the Feedback surface rows.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { FeedbackTriageStatus, ReviewStatus } from '@ilaunchify/db'
import { triageFeedback, moderateReview } from './actions'

const btn =
  'rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

export function TriageButtons({ responseId, status }: { responseId: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function set(s: FeedbackTriageStatus) {
    start(async () => {
      const r = await triageFeedback({ responseId, status: s })
      if (r.ok) router.refresh()
      else toast.error(r.error)
    })
  }
  return (
    <span className="inline-flex gap-1">
      {status !== 'REVIEWED' && (
        <button type="button" disabled={pending} onClick={() => set('REVIEWED')} className={btn}>
          Reviewed
        </button>
      )}
      {status !== 'ACTIONED' && (
        <button type="button" disabled={pending} onClick={() => set('ACTIONED')} className={btn}>
          Actioned
        </button>
      )}
      {status !== 'DISMISSED' && (
        <button type="button" disabled={pending} onClick={() => set('DISMISSED')} className={btn}>
          Dismiss
        </button>
      )}
    </span>
  )
}

export function ReviewModerationButtons({
  reviewId,
  status,
}: {
  reviewId: string
  status: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function set(s: ReviewStatus) {
    start(async () => {
      let note: string | undefined
      if (s === 'HIDDEN') {
        note = window.prompt('Reason for hiding (audited, required):') ?? undefined
        if (!note?.trim()) return
      }
      const r = await moderateReview({ reviewId, status: s, note })
      if (r.ok) router.refresh()
      else toast.error(r.error)
    })
  }
  return (
    <span className="inline-flex gap-1">
      {status !== 'HIDDEN' ? (
        <button type="button" disabled={pending} onClick={() => set('HIDDEN')} className={`${btn} text-danger-600`}>
          Hide
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => set('PUBLISHED')} className={btn}>
          Restore
        </button>
      )}
      {status === 'FLAGGED' && (
        <button type="button" disabled={pending} onClick={() => set('PUBLISHED')} className={btn}>
          Approve
        </button>
      )}
    </span>
  )
}
