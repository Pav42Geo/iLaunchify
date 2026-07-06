'use client'

// Progressive enrichment after the one-click vote: score-appropriate tag chips
// + one optional open question. Optional by design — the vote already counted.

import { useState, useTransition } from 'react'
import { submitEnrichment } from './actions'

export function EnrichForm({
  token,
  responseId,
  score,
  tags,
}: {
  token: string
  responseId: string
  score: 'UP' | 'DOWN'
  tags: string[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (done) {
    return (
      <p className="text-center text-sm text-ink-600">
        Thank you — that helps more than you know. You can close this tab. 💛
      </p>
    )
  }

  function toggle(tag: string) {
    setSelected((s) => (s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]))
  }

  function submit() {
    startTransition(async () => {
      const r = await submitEnrichment({ token, responseId, tags: selected, comment })
      if (r.ok) setDone(true)
      else setError(r.error)
    })
  }

  return (
    <div>
      <p className="text-center text-[13px] font-medium text-ink-700">
        {score === 'UP' ? 'What went well?' : 'What went wrong?'}{' '}
        <span className="font-normal text-ink-400">(optional)</span>
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            aria-pressed={selected.includes(t)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
              selected.includes(t)
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={
          score === 'UP' ? 'Anything you’d like us to know…' : 'What’s one thing we could improve?'
        }
        className="mt-4 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
      {error && <p className="mt-2 text-center text-xs text-danger-600">{error}</p>}
      <button
        type="button"
        disabled={pending || (selected.length === 0 && !comment.trim())}
        onClick={submit}
        className="mt-4 w-full rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {pending ? 'Sending…' : 'Send details'}
      </button>
      <p className="mt-2 text-center text-[11.5px] text-ink-400">
        Your rating is already saved — this part just adds detail.
      </p>
    </div>
  )
}
