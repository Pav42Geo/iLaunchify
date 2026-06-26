'use client'

// Per-row session revoke controls for /admin/security. Same inline-controls
// precedent as NicheRowControls / LifestyleTagActiveToggle.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldOff } from 'lucide-react'
import { revokeSession, revokeAllSessionsForUser } from './actions'

export function SessionRowControls({
  sessionId,
  userId,
  email,
}: {
  sessionId: string
  userId: string
  email: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<null | 'one' | 'all'>(null)

  function run(kind: 'one' | 'all') {
    if (confirming !== kind) {
      setConfirming(kind)
      return
    }
    startTransition(async () => {
      const r =
        kind === 'one'
          ? await revokeSession(sessionId)
          : await revokeAllSessionsForUser(userId)
      setConfirming(null)
      if (!r.ok) {
        // eslint-disable-next-line no-alert
        alert(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => run('one')}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 transition-colors hover:border-danger-300 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        title={`Sign out this session for ${email}`}
      >
        {pending && confirming !== 'all' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        ) : (
          <ShieldOff className="h-3 w-3" aria-hidden="true" />
        )}
        {confirming === 'one' ? 'Confirm revoke' : 'Revoke'}
      </button>
      <button
        type="button"
        onClick={() => run('all')}
        disabled={pending}
        className="inline-flex items-center rounded-full border border-danger-200 bg-danger-50 px-2.5 py-1 text-[11px] font-semibold text-danger-700 transition-colors hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        title={`Sign ${email} out of ALL devices`}
      >
        {confirming === 'all' ? 'Confirm: all devices' : 'Revoke all'}
      </button>
    </div>
  )
}
