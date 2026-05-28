'use client'

import * as React from 'react'
import { Heart } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * HeartFavorite — favorite toggle on ProductCards (bottom-right of image area).
 *
 * Controlled or uncontrolled. Hover turns pink; active state fills with
 * pink-500. The click handler stops propagation so it doesn't trigger the
 * parent card's navigation.
 */
export interface HeartFavoriteProps {
  /** Controlled value. */
  value?: boolean
  /** Uncontrolled initial value. */
  defaultValue?: boolean
  /** Called on toggle. */
  onToggle?: (next: boolean) => void
  className?: string
  /** Accessible label — defaults to "Add to favorites" / "Remove from favorites". */
  'aria-label'?: string
}

export function HeartFavorite({
  value,
  defaultValue = false,
  onToggle,
  className,
  ...props
}: HeartFavoriteProps) {
  const [internal, setInternal] = React.useState(defaultValue)
  const active = value ?? internal

  const handle = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const next = !active
    if (value === undefined) setInternal(next)
    onToggle?.(next)
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={
        props['aria-label'] ?? (active ? 'Remove from favorites' : 'Add to favorites')
      }
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center w-[26px] h-[26px] rounded-pill ' +
          'bg-white/92 shadow-sm transition-all duration-base ease-out-quart ' +
          'hover:scale-110 cursor-pointer',
        active ? 'text-pink-500' : 'text-ink-700 hover:text-pink-500',
        className,
      )}
    >
      <Heart
        className="w-[14px] h-[14px]"
        strokeWidth={1.75}
        fill={active ? 'currentColor' : 'none'}
      />
    </button>
  )
}
