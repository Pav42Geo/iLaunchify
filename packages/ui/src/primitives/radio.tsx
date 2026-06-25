import * as React from 'react'
import { cn } from '../lib/utils'

// Radio — native <input type="radio"> (sr-only) + tokenized ring & dot. Group
// several by passing the same `name`. Optional `label` renders clickable text
// beside the dot (whole row toggles). Selected color = --control-accent.
export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional clickable label text rendered beside the dot. */
  label?: React.ReactNode
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, ...props }, ref) => (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 select-none', className)}>
      <span className="relative inline-flex h-[18px] w-[18px] shrink-0">
        <input ref={ref} type="radio" className="peer sr-only" {...props} />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border border-[var(--control-border)] bg-[var(--control-bg)] transition-colors peer-checked:border-[var(--control-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--input-focus)] peer-focus-visible:ring-offset-1 peer-disabled:opacity-50"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto h-2 w-2 rounded-full bg-[var(--control-accent)] opacity-0 transition-opacity peer-checked:opacity-100"
        />
      </span>
      {label != null && <span className="text-[length:var(--fs-md)]">{label}</span>}
    </label>
  ),
)
Radio.displayName = 'Radio'
