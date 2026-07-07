// Tooltip — shared hover/focus hint (design-token styled, Amazon-flavored:
// white surface, gray border, roomy padding, near-black text). CSS-only, so it
// works in BOTH server and client components — no 'use client', no JS. Reveals
// on hover of the trigger and on keyboard focus (the wrapper is focusable).
//
//   <Tooltip content="Why this badge…"><Badge /></Tooltip>

import * as React from 'react'
import { cn } from '../lib/utils'

export interface TooltipProps {
  /** The hint shown on hover/focus. */
  content: React.ReactNode
  /** The trigger the tooltip attaches to. */
  children: React.ReactNode
  /** Which side of the trigger the bubble appears on. Default 'top'. */
  side?: 'top' | 'bottom'
  /** Tailwind width class for the bubble. Default 'w-[18rem]'. */
  widthClass?: string
  /** Extra classes on the bubble. */
  className?: string
  /** Extra classes on the inline wrapper (e.g. alignment). */
  triggerClassName?: string
}

export function Tooltip({
  content,
  children,
  side = 'top',
  widthClass = 'w-[18rem]',
  className,
  triggerClassName,
}: TooltipProps) {
  const pos = side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
  return (
    <span className={cn('group relative inline-flex', triggerClassName)} tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-40 -translate-x-1/2',
          pos,
          widthClass,
          'rounded-[var(--radius-lg)] border border-ink-300 bg-white px-4 py-3',
          'text-[12px] font-normal normal-case leading-relaxed tracking-normal text-ink-800 shadow-lg',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          className,
        )}
      >
        {content}
      </span>
    </span>
  )
}
