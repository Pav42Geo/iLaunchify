'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { toggleChannel } from './actions'

export function ChannelToggle({
  channelId,
  initialEnabled,
}: { channelId: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  function handleToggle(next: boolean) {
    setEnabled(next)
    startTransition(async () => {
      const res = await toggleChannel({ channelId, enabled: next })
      if (!res.ok) {
        setEnabled(!next)
        toast.error(res.error)
      } else {
        toast.success(next ? 'Channel enabled' : 'Channel disabled')
      }
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={isPending}
      onClick={() => handleToggle(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        enabled ? 'bg-zinc-900' : 'bg-zinc-300'
      } disabled:opacity-50`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
