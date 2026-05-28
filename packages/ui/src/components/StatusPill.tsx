import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

/**
 * StatusPill — small pill that sits in the top-left of a ProductCard image area.
 *
 * The marketplace status taxonomy (per MARKETPLACE_DESIGN.md): Bestseller / New /
 * Fast ship / Low MOQ / Top rated / Popular. Default treatment is a white pill
 * with dark text; `pink` variant uses pink-500 fill for "New"; `dark` variant
 * uses ink-900 fill (rarely used).
 *
 * Renders as a Span — pass `as="div"` etc. via the parent if needed.
 */
const statusPillVariants = cva(
  'inline-flex items-center rounded-pill px-2.5 py-1 text-[10px] font-semibold leading-none shadow-sm whitespace-nowrap',
  {
    variants: {
      variant: {
        /** Default — white background, dark text. Bestseller/Fast ship/Top rated/Low MOQ/Popular. */
        light: 'bg-white/95 text-ink-900',
        /** Pink fill — "New". */
        pink:  'bg-pink-500 text-white',
        /** Ink fill — rare emphasis. */
        dark:  'bg-ink-900  text-white',
      },
    },
    defaultVariants: { variant: 'light' },
  },
)

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {}

export function StatusPill({ className, variant, ...props }: StatusPillProps) {
  return <span className={cn(statusPillVariants({ variant }), className)} {...props} />
}
