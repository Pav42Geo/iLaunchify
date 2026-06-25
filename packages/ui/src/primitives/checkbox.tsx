import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

// Checkbox — native <input type="checkbox"> (sr-only, keeps full a11y +
// form semantics) with a tokenized custom box + check overlay. The box and the
// check are siblings AFTER the peer input, so peer-checked styling resolves.
// Selected color = --control-accent (shared with Radio + Switch).
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <label className={cn('relative inline-flex h-[18px] w-[18px] shrink-0 cursor-pointer', className)}>
      <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[var(--checkbox-radius)] border border-[var(--control-border)] bg-[var(--control-bg)] transition-colors peer-checked:border-[var(--control-accent)] peer-checked:bg-[var(--control-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--input-focus)] peer-focus-visible:ring-offset-1 peer-disabled:opacity-50"
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto h-3 w-3 opacity-0 text-[var(--control-accent-fg)] transition-opacity peer-checked:opacity-100"
      />
    </label>
  ),
)
Checkbox.displayName = 'Checkbox'
