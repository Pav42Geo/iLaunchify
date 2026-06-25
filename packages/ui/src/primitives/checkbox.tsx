import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

// Checkbox — native <input type="checkbox"> (sr-only, keeps full a11y +
// form semantics) with a tokenized custom box + check overlay. The input, box,
// and check are siblings inside the box-group span, so peer-checked resolves.
// Optional `label` renders clickable text beside the box (whole row toggles).
// Selected color = --control-accent (shared with Radio + Switch).
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional clickable label text rendered beside the box. */
  label?: React.ReactNode
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 select-none', className)}>
      <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
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
      </span>
      {label != null && <span className="text-[length:var(--fs-md)]">{label}</span>}
    </label>
  ),
)
Checkbox.displayName = 'Checkbox'
