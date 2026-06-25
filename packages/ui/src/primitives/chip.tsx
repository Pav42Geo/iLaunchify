'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * iLaunchify Chip — filter chip with active state.
 *
 * Locked design (DESIGN_SYSTEM.md §8.5):
 *   default = outlined pill (border-firm + white bg, ink-secondary text)
 *   active  = filled pill (pink-500 bg + white text)
 *
 * Used on marketplace filter bars and cert filter rails. The active state
 * carries pink as the brand-accent affordance — recognizable across all
 * filter surfaces.
 *
 * `removable` renders an × glyph as visual affordance only — the chip itself
 * is a single button whose onClick the consumer wires to whatever action
 * makes sense (typically: toggle if !active, remove if active).
 */
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  removable?: boolean
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active = false, removable = false, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={active}
        className={cn(
          'inline-flex items-center gap-s-1 rounded-[var(--chip-radius)] px-s-3 py-s-2 text-[length:var(--fs-base)] font-medium ' +
            'transition-[background,color,border-color] duration-base ease-out-quart ' +
            'cursor-pointer whitespace-nowrap',
          active
            ? 'bg-[var(--chip-active-bg)] text-[var(--chip-active-fg)] border border-[var(--chip-active-border)]'
            : 'bg-[var(--chip-bg)] text-[var(--chip-fg)] border border-[var(--chip-border)] hover:text-ink-900',
          className,
        )}
        {...props}
      >
        {children}
        {removable && (
          <span aria-hidden="true" className="text-[14px] leading-none opacity-80">
            ×
          </span>
        )}
      </button>
    )
  },
)
Chip.displayName = 'Chip'
