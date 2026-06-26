'use client'

// =============================================================================
// SubcategoryRowControls — per-row reorder chevrons + remove button.
// =============================================================================

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { moveSubcategoryInNiche, removeSubcategoryFromNiche } from '../../actions'

export function SubcategoryReorderControls({
  nicheId,
  subcategoryId,
}: {
  nicheId: string
  subcategoryId: string
}) {
  const [pending, startTransition] = useTransition()

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      await moveSubcategoryInNiche(nicheId, subcategoryId, direction)
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

export function RemoveSubcategoryButton({
  nicheId,
  subcategoryId,
  subcategoryName,
  nicheName,
}: {
  nicheId: string
  subcategoryId: string
  subcategoryName: string
  nicheName: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (typeof window !== 'undefined') {
      if (
        !window.confirm(
          `Remove "${subcategoryName}" from ${nicheName}? Creators will stop seeing this subcategory in this niche.`,
        )
      ) {
        return
      }
    }
    setError(null)
    startTransition(async () => {
      const res = await removeSubcategoryFromNiche(nicheId, subcategoryId)
      if (!res.ok) {
        setError(res.error)
        if (typeof window !== 'undefined') window.alert(res.error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={`Remove ${subcategoryName}`}
      title={error ?? `Remove ${subcategoryName}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-danger-600 transition-colors hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
