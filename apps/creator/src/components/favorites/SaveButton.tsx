'use client'

// SaveButton — optimistic bookmark toggle (docs/FAVORITES_MANAGEMENT.md §11).
//
// Bookmark, not heart: "save to work on" reads as B2B utility. Fills pink when
// saved. Lives in the title-side action cluster (detail) or the card footer
// (grid) — NEVER overlaid on the product image. In P0 this is a creator-app
// component; graduate to @ilaunchify/ui when the marketing marketplace consumes
// it.

import { Bookmark } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toggleFavorite, type FavoritableKind } from '@/app/(dashboard)/favorites/actions'

interface Props {
  kind: FavoritableKind
  targetId: string
  initialSaved: boolean
  /** 'pill' shows an icon + label; 'icon' is a compact 30px circle (card footer). */
  variant?: 'pill' | 'icon'
}

export function SaveButton({ kind, targetId, initialSaved, variant = 'pill' }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [pending, startTransition] = useTransition()

  function onToggle() {
    // Optimistic flip; revert on failure.
    const next = !saved
    setSaved(next)
    startTransition(async () => {
      const res = await toggleFavorite({ kind, targetId })
      if (!res.ok) setSaved(!next)
      else setSaved(res.saved)
    })
  }

  const label = saved ? 'Saved' : 'Save'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from favorites' : 'Save to favorites'}
        disabled={pending}
        className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 ${
          saved
            ? 'border-pink-200 bg-pink-50 text-pink-700'
            : 'border-ink-200 bg-white text-ink-500 hover:border-ink-400 hover:text-ink-700'
        }`}
      >
        <Bookmark className="h-4 w-4" strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      disabled={pending}
      className={`inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ${
        saved
          ? 'border-pink-200 bg-pink-50 text-pink-700'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
      }`}
    >
      <Bookmark className="h-[17px] w-[17px]" strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      {label}
    </button>
  )
}
