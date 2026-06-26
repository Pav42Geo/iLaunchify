'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { acceptAdminInvite } from './actions'

export function AcceptInvitePanel({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function accept() {
    setError(null)
    start(async () => {
      const r = await acceptAdminInvite({ token })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setDone(true)
      // Give them a beat to read the confirmation, then into the console.
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 1200)
    })
  }

  if (done) {
    return (
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 p-3 text-[13px] font-medium text-success-800">
        <CheckCircle2 className="h-4.5 w-4.5" /> You&apos;re in — taking you to the admin console…
      </div>
    )
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
      >
        {pending ? 'Accepting…' : 'Accept invite'}
      </button>
      {error && (
        <p className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12.5px] text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
}
