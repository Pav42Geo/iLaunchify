'use client'

// Inline marketplace-visibility switch for live / paused products on the
// partner /products table. PUBLISHED = on (in the marketplace), PAUSED = off.
// One click flips it via the pause/resume server actions, with an optimistic
// pending state + toast. Only rendered for PUBLISHED | PAUSED rows.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@ilaunchify/ui'
import { pauseProduct, resumeProduct } from './actions'

export function LiveToggle({
  id,
  name,
  status,
}: {
  id: string
  name: string
  status: 'PUBLISHED' | 'PAUSED'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const isLive = status === 'PUBLISHED'

  function flip() {
    if (busy || pending) return
    if (isLive && !window.confirm(`Turn off “${name}”? It will disappear from the creator marketplace immediately. You can re-list it anytime.`)) {
      return
    }
    setBusy(true)
    startTransition(async () => {
      const r = isLive ? await pauseProduct(id) : await resumeProduct(id)
      setBusy(false)
      if (!r.ok) {
        toast.error(r.error ?? 'Could not update')
        return
      }
      toast.success(isLive ? `“${name}” turned off — hidden from marketplace` : `“${name}” is live again`)
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLive}
      aria-label={isLive ? `Turn off ${name}` : `Re-list ${name}`}
      disabled={busy || pending}
      onClick={flip}
      title={isLive ? 'Live in marketplace — click to turn off' : 'Paused — click to re-list'}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50',
        isLive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300'
          : 'border-ink-200 bg-ink-100 text-ink-600 hover:border-ink-300',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative h-3.5 w-6 flex-shrink-0 rounded-full transition-colors',
          isLive ? 'bg-emerald-500' : 'bg-ink-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-all',
            isLive ? 'left-[11px]' : 'left-0.5',
          )}
        />
      </span>
      {isLive ? 'Live' : 'Paused'}
    </button>
  )
}
