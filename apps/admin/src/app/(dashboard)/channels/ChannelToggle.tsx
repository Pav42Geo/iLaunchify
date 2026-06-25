'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@ilaunchify/ui'
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
    <Switch
      checked={enabled}
      disabled={isPending}
      onChange={(e) => handleToggle(e.target.checked)}
      aria-label={enabled ? 'Disable channel' : 'Enable channel'}
    />
  )
}
