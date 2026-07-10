'use client'

// Contest-a-rating entry (MM-6). Opens a small reason prompt and files an appeal
// via the server action. While an appeal is open, the manufacturer's standing is
// frozen against demotion (engine rule), so filing is safe and low-stakes.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fileRatingAppeal } from './actions'

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Appeal submitted',
  UNDER_REVIEW: 'Under review',
  UPHELD: 'Rating upheld',
  EXCLUDED: 'Removed',
  REATTRIBUTED: 'Re-attributed',
}

export function ContestRatingButton({
  ratingId,
  appealStatus,
  excluded,
}: {
  ratingId: string
  appealStatus: string | null
  excluded: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (excluded) return <span className="text-[11px] font-medium text-ink-400">Removed from your score</span>
  if (done) return <span className="text-[11px] font-medium text-info-700">{done}</span>
  if (appealStatus) return <span className="text-[11px] font-medium text-ink-500">{STATUS_LABEL[appealStatus] ?? appealStatus}</span>

  function submit() {
    setErr(null)
    if (reason.trim().length < 20) { setErr('Please add at least 20 characters explaining the issue.'); return }
    start(async () => {
      const r = await fileRatingAppeal(ratingId, reason)
      if (r.ok) { setDone('Appeal submitted'); setOpen(false); router.refresh() }
      else setErr(r.error)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:border-ink-300 hover:text-ink-900"
      >
        Contest
      </button>
    )
  }

  return (
    <div className="w-full max-w-md space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Why is this rating unfair or misattributed? An admin will review it."
        className="w-full rounded-lg border border-ink-200 px-2.5 py-2 text-[12.5px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-300"
      />
      {err && <p className="text-[11.5px] text-danger-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending} onClick={submit}
          className="rounded-full bg-ink-900 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50">
          {pending ? 'Submitting…' : 'Submit appeal'}
        </button>
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setErr(null) }}
          className="text-[11.5px] font-medium text-ink-500 hover:text-ink-800">
          Cancel
        </button>
      </div>
    </div>
  )
}
