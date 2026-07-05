'use client'

// Risk-event triage buttons (Risk Center M2). Thin client wrapper over the
// audited server action; the page re-renders via revalidatePath.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@ilaunchify/ui'
import { transitionRiskEvent } from './actions'

type Resolution = 'ACK' | 'RESOLVED' | 'MUTED' | 'FALSE_POSITIVE' | 'OPEN'

const BUTTONS: { to: Resolution; label: string; style: 'primary' | 'quiet' | 'danger' }[] = [
  { to: 'ACK', label: 'Acknowledge', style: 'quiet' },
  { to: 'RESOLVED', label: 'Resolve', style: 'primary' },
  { to: 'MUTED', label: 'Mute', style: 'quiet' },
  { to: 'FALSE_POSITIVE', label: 'False positive', style: 'danger' },
  { to: 'OPEN', label: 'Reopen', style: 'quiet' },
]

export function TriageActions({ eventId, allowed }: { eventId: string; allowed: Resolution[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const act = (to: Resolution) => {
    setError(null)
    startTransition(async () => {
      const res = await transitionRiskEvent({ eventId, to })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  const visible = BUTTONS.filter((b) => allowed.includes(b.to))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {visible.map((b) => (
          <button
            key={b.to}
            type="button"
            disabled={pending}
            onClick={() => act(b.to)}
            className={cn(
              'inline-flex items-center rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50',
              b.style === 'primary' && 'bg-ink-900 text-white hover:bg-ink-800',
              b.style === 'quiet' && 'border border-ink-200 bg-white text-ink-900 hover:border-ink-400',
              b.style === 'danger' && 'border border-danger-200 bg-danger-50 text-danger-800 hover:border-danger-400',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[12px] font-medium text-danger-700">{error}</p>}
    </div>
  )
}
