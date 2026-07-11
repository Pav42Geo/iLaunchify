'use client'

// Promote-an-interest button (StaffMeUp-inverted, decided 2026-07-10).
// Spends ONE promo token for a LABELED pinned slot on the creator's compare
// screen — ranking math never sees it, and the button says so.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { promoteInterest } from './actions'

export function PromoteInterestButton({
  interestId,
  tokenBalance,
}: {
  interestId: string
  tokenBalance: number
}) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const hasTokens = tokenBalance > 0

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || !hasTokens}
        title={
          hasTokens
            ? 'Pins your interest in a labeled Promoted slot — the creator’s ranking is unaffected'
            : 'No promo tokens — token purchase opens with payments go-live'
        }
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await promoteInterest(interestId)
            if (!r.ok) setError(r.error)
            else router.refresh()
          })
        }
        className="inline-flex items-center gap-1 rounded-pill border border-ink-200 bg-white px-s-4 py-s-2 text-ui-caption font-bold text-ink-700 transition hover:border-pink-500 hover:text-pink-700 disabled:opacity-50"
      >
        ✨ {pending ? 'Promoting…' : 'Promote (1 token)'}
      </button>
      {error ? <span className="text-ui-label normal-case tracking-normal text-danger-700">{error}</span> : null}
    </div>
  )
}
