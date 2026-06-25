import * as React from 'react'
import { cn } from '../lib/utils'

// Radio — native <input type="radio"> (sr-only) + tokenized ring & dot. Group
// several by passing the same `name`. Selected color = --control-accent.
export const Radio = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <label className={cn('relative inline-flex h-[18px] w-[18px] shrink-0 cursor-pointer', className)}>
      <input ref={ref} type="radio" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border border-[var(--control-border)] bg-[var(--control-bg)] transition-colors peer-checked:border-[var(--control-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--input-focus)] peer-focus-visible:ring-offset-1 peer-disabled:opacity-50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 m-auto h-2 w-2 rounded-full bg-[var(--control-accent)] opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </label>
  ),
)
Radio.displayName = 'Radio'
