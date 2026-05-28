import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * VerifyCheck — the neon-green ✓ circle in the top-right of every
 * marketplace ProductCard (and in cert-verified contexts).
 *
 * Signals "this template has been verified by iLaunchify". The neon-on-black
 * pairing hits 16.4:1 (AAA) and is the highest-visibility affordance in the
 * system.
 *
 * Two sizes:
 *   sm — 22px (default for ProductCard)
 *   md — 28px (used in larger contexts like detail page hero badges)
 */
export interface VerifyCheckProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md'
}

export function VerifyCheck({ size = 'sm', className, ...props }: VerifyCheckProps) {
  return (
    <span
      role="img"
      aria-label="Verified by iLaunchify"
      className={cn(
        'inline-flex items-center justify-center rounded-pill bg-neon-500 text-ink-900 font-bold shadow-sm',
        size === 'sm' && 'w-[22px] h-[22px] text-[12px]',
        size === 'md' && 'w-7 h-7 text-sm',
        className,
      )}
      {...props}
    >
      ✓
    </span>
  )
}
