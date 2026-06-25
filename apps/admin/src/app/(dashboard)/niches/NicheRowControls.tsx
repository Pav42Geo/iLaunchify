'use client'

// =============================================================================
// NicheRowControls — chevron up/down reorder + isActive toggle.
// =============================================================================

import { useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Switch } from '@ilaunchify/ui'
import { moveNiche, toggleNicheActive } from './actions'

export function NicheReorderControls({ nicheId }: { nicheId: string }) {
  const [pending, startTransition] = useTransition()

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveNiche(nicheId, direction)
    })
  }

  return (
    <div className="inline-flex flex-col items-center justify-center">
      <button
        type="button"
        onClick={() => move('up')}
        disabled={pending}
        aria-label="Move up"
        className="inline-flex h-4 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => move('down')}
        disabled={pending}
        aria-label="Move down"
        className="inline-flex h-4 w-5 items-center justify-center rounded text-ink-400 hover:bg-ink-50 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  )
}

export function NicheActiveToggle({
  nicheId,
  isActive,
}: {
  nicheId: string
  isActive: boolean
}) {
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleNicheActive(nicheId)
    })
  }

  return (
    <Switch
      checked={isActive}
      disabled={pending}
      onChange={handleToggle}
      aria-label={isActive ? 'Deactivate niche' : 'Activate niche'}
    />
  )
}
