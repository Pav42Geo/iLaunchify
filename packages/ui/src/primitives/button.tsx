import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

/**
 * iLaunchify Button — full pill shape, five variants.
 *
 * Locked design (2026-05-27, see docs/DESIGN_SYSTEM.md §8.1):
 *   - primary    Black pill, white text. Default CTA on light surfaces.
 *   - neon       Neon-green pill, black text. Primary CTA on dark surfaces
 *                (business landing 'Apply now'). NEVER use on light surfaces.
 *   - pink       Pink pill, white text. Secondary brand action (rare).
 *   - secondary  White pill, ink-900 text, hairline border. Cancel, secondary.
 *   - ghost      Transparent, inherits color. Tertiary low-priority.
 *
 * Heights: sm 36px / md 44px (default) / lg 52px. All full pill.
 * One primary or neon button per screen section.
 *
 * NEVER:
 *  - Outer colored glow shadows (explicit anti-pattern)
 *  - Neon variant on a light surface (1.3:1 contrast — invisible)
 *  - Mix variants in a way that puts two primary CTAs on the same surface
 */
const buttonVariants = cva(
  // Base — full pill, semibold, transition, focus ring, disabled state.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-semibold ' +
    'transition-[background,color,transform,box-shadow] duration-base ease-out-quart ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        primary:   'bg-ink-900 text-white hover:bg-black hover:-translate-y-px',
        neon:      'bg-neon-500 text-ink-900 hover:bg-neon-400 hover:-translate-y-px',
        pink:      'bg-pink-500 text-white hover:bg-pink-600 hover:-translate-y-px',
        secondary: 'bg-white text-ink-900 border border-ink-300 shadow-sm hover:bg-ink-50',
        ghost:     'bg-transparent text-ink-900 hover:bg-ink-100',
      },
      size: {
        sm: 'h-9 px-4 text-sm',   // 36px
        md: 'h-11 px-5 text-sm',  // 44px (default — matches input height)
        lg: 'h-13 px-7 text-base', // 52px
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
