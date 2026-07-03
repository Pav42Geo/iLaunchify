'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BadgeCheck } from 'lucide-react'
import { confirmRampDispatch } from './actions'

export function ConfirmRampButton({ dispatchId }: { dispatchId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      const r = await confirmRampDispatch({ dispatchId })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Ramp dispatch confirmed')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={confirm}
      className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {busy ? 'Confirming…' : 'Confirm'}
    </button>
  )
}
