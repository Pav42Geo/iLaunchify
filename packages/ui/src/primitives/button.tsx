import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils'

/**
 * iLaunchify Button — full pill shape, six variants.
 *
 * Locked design (2026-05-27, see docs/DESIGN_SYSTEM.md §8.1):
 *   - primary    Black pill, white text. Default CTA on light surfaces.
 *   - neon       Neon-green pill, black text. Primary CTA on dark surfaces
 *                (business landing 'Apply now'). NEVER use on light surfaces.
 *   - pink       Pink pill, white text. Secondary brand action (rare).
 *   - secondary  White pill, ink-900 text, hairline border. Cancel, secondary.
 *   - outline    Transparent, ink-900 text, hairline border. Like secondary
 *                without the white fill — for use over tinted/cream surfaces.
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
  'inline-flex items-center justify-center gap-s-2 whitespace-nowrap rounded-[var(--button-radius)] font-semibold ' +
    'transition-[background,color,transform,box-shadow] duration-base ease-out-quart ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
  {
    variants: {
      variant: {
        primary:   'bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)] hover:bg-[var(--button-primary-bg-hover)] hover:-translate-y-px',
        neon:      'bg-[var(--button-neon-bg)] text-[var(--button-neon-fg)] hover:bg-[var(--button-neon-bg-hover)] hover:-translate-y-px',
        pink:      'bg-[var(--button-pink-bg)] text-[var(--button-pink-fg)] hover:bg-[var(--button-pink-bg-hover)] hover:-translate-y-px',
        secondary: 'bg-[var(--button-secondary-bg)] text-[var(--button-secondary-fg)] border border-[var(--button-secondary-border)] shadow-sm hover:bg-[var(--button-secondary-bg-hover)]',
        outline:   'bg-transparent text-[var(--button-outline-fg)] border border-[var(--button-outline-border)] hover:bg-[var(--button-outline-bg-hover)]',
        ghost:     'bg-transparent text-[var(--button-ghost-fg)] hover:bg-[var(--button-ghost-bg-hover)]',
      },
      size: {
        sm: 'h-9 px-s-4 text-[length:var(--fs-md)]',   // 36px · pad 16 (s-4)
        md: 'h-11 px-s-5 text-[length:var(--fs-md)]',  // 44px · pad 24 (s-5, was 20 off-grid)
        lg: 'h-13 px-s-6 text-[length:var(--fs-lg)]',  // 52px · pad 32 (s-6, was 28 off-grid)
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
