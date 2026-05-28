import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

/**
 * iLaunchify Badge — small pill for status / category labels.
 *
 * Locked design (DESIGN_SYSTEM.md §8.4): 11px / 600 weight, +0.02em letter-spacing,
 * pill shape, semantic color variants.
 *
 * The neon variant is intentionally only legible on dark backgrounds — use
 * sparingly and never as a body-text color on white.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold leading-none tracking-[0.02em] whitespace-nowrap',
  {
    variants: {
      variant: {
        success: 'bg-success-50  text-success-500',
        warning: 'bg-warning-50  text-warning-500',
        danger:  'bg-danger-50   text-danger-500',
        info:    'bg-info-50     text-info-500',
        neutral: 'bg-ink-100     text-ink-600',
        pink:    'bg-pink-50     text-pink-700',
        /** Dark surfaces only — pairs with bg-ink-900. */
        neon:    'bg-ink-900     text-neon-500',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
