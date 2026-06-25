import * as React from 'react'
import { cn } from '../lib/utils'

// Switch — native <input type="checkbox" role="switch"> (sr-only) + tokenized
// track & thumb. Off track = --switch-off-bg; on track = --control-accent.
export const Switch = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <label className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer', className)}>
      <input ref={ref} type="checkbox" role="switch" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-[var(--switch-off-bg)] transition-colors peer-checked:bg-[var(--control-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--input-focus)] peer-focus-visible:ring-offset-1 peer-disabled:opacity-50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--control-accent-fg)] shadow transition-transform peer-checked:translate-x-4"
      />
    </label>
  ),
)
Switch.displayName = 'Switch'
