'use client'

// General account feedback form — always available, never expires.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { sendAccountFeedback } from './actions'

const KINDS = [
  { kind: 'PLATFORM' as const, label: 'Experience or bug', help: 'How iLaunchify is working for you — or where it broke.' },
  { kind: 'IDEA' as const, label: 'Idea or request', help: 'Something you wish the platform did.' },
]

export function FeedbackForm() {
  const [kind, setKind] = useState<'PLATFORM' | 'IDEA'>('PLATFORM')
  const [score, setScore] = useState<'UP' | 'DOWN' | null>(null)
  const [comment, setComment] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const r = await sendAccountFeedback({ kind, score, comment })
      if (r.ok) {
        toast.success('Sent — we read every one. Thank you!')
        setComment('')
        setScore(null)
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => setKind(k.kind)}
            aria-pressed={kind === k.kind}
            className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
              kind === k.kind ? 'border-ink-900 bg-ink-50/60' : 'border-ink-200 hover:border-ink-400'
            }`}
          >
            <div className="text-[13.5px] font-semibold text-ink-900">{k.label}</div>
            <div className="mt-0.5 text-[12px] text-ink-500">{k.help}</div>
          </button>
        ))}
      </div>

      {kind === 'PLATFORM' && (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-600">Overall right now:</span>
          {(['UP', 'DOWN'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScore(score === s ? null : s)}
              aria-pressed={score === s}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                score === s ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-600 hover:border-ink-400'
              }`}
            >
              {s === 'UP' ? '👍 Good' : '👎 Rough'}
            </button>
          ))}
          <span className="text-[11.5px] text-ink-400">(optional)</span>
        </div>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={5}
        maxLength={4000}
        placeholder={kind === 'IDEA' ? 'What should we build, and what would it unlock for you?' : 'What happened — and where were you in the app?'}
        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
      <button
        type="button"
        disabled={pending || comment.trim().length < 5}
        onClick={submit}
        className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {pending ? 'Sending…' : 'Send feedback'}
      </button>
    </div>
  )
}
