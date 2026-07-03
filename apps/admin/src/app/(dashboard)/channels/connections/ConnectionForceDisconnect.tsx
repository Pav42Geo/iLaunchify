'use client'

// Admin force-disconnect for ONE creator↔store connection — the surgical tier
// of the channel kill-switch ladder (registry pause = platform-wide; this = one
// store). Requires a reason; it lands in the audit log verbatim.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Unplug } from 'lucide-react'
import { adminDisconnectConnection } from '../actions'

export function ConnectionForceDisconnect({ connectionId, label }: { connectionId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    startTransition(async () => {
      const res = await adminDisconnectConnection(connectionId, reason)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Disconnected ${label}`)
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Force-disconnect this store (audited; creator can reconnect)"
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 text-[10.5px] font-bold uppercase text-ink-500 transition hover:border-danger-300 hover:bg-danger-50 hover:text-danger-700"
      >
        <Unplug className="h-3 w-3" />
        Disconnect
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (audited)…"
        className="w-[180px] rounded-lg border border-danger-200 px-2 py-1 text-[11.5px] focus:border-danger-400 focus:outline-none focus:ring-1 focus:ring-danger-200"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by explicit click
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending || reason.trim().length < 5}
        className="rounded-full bg-danger-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-danger-700 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-full border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 hover:bg-ink-50"
      >
        Cancel
      </button>
    </div>
  )
}
