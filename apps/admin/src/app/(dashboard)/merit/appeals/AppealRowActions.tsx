'use client'

// Adjudication controls for one appeal row (MM-4b). Acknowledge moves it to
// UNDER_REVIEW; the three outcomes close it. EXCLUDE/REATTRIBUTE prompt for a
// reason (recorded on the rating + appeal) because they change standing.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acknowledgeRatingAppeal, adjudicateRatingAppeal } from './actions'

type Outcome = 'UPHELD' | 'EXCLUDED' | 'REATTRIBUTED'

export function AppealRowActions({ appealId, status }: { appealId: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const open = status === 'SUBMITTED' || status === 'UNDER_REVIEW'

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setMsg(null); setErr(null)
    start(async () => {
      const r = await fn()
      if (r.ok) { setMsg(r.message ?? 'Done.'); router.refresh() }
      else setErr(r.error ?? 'Failed.')
    })
  }

  function adjudicate(outcome: Outcome) {
    let note: string | undefined
    if (outcome !== 'UPHELD') {
      const input = window.prompt(`Reason for ${outcome === 'EXCLUDED' ? 'excluding this rating' : 're-attributing this rating'} (recorded):`)
      if (input == null) return // cancelled
      note = input
    }
    run(() => adjudicateRatingAppeal(appealId, outcome, note))
  }

  if (!open) return <span className="text-[11px] text-ink-400">{msg ?? '—'}</span>

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === 'SUBMITTED' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => acknowledgeRatingAppeal(appealId))}
          className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        >
          Acknowledge
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => adjudicate('UPHELD')}
        className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
        Uphold rating
      </button>
      <button type="button" disabled={pending} onClick={() => adjudicate('EXCLUDED')}
        className="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-800 hover:bg-pink-100 disabled:opacity-50">
        Exclude
      </button>
      <button type="button" disabled={pending} onClick={() => adjudicate('REATTRIBUTED')}
        className="rounded-full border border-info-200 bg-info-50 px-2.5 py-1 text-[11px] font-semibold text-info-800 hover:bg-info-100 disabled:opacity-50">
        Re-attribute
      </button>
      {err && <span className="text-[11px] text-danger-600">{err}</span>}
    </div>
  )
}
