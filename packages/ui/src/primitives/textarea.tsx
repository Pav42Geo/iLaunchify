import * as React from 'react'
import { cn } from '../lib/utils'

// Textarea — multi-line sibling of Input. Reuses the same form-field tokens
// (--input-bg/text/placeholder/focus/radius) so it themes with everything else.
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full rounded-[var(--input-radius)] border border-[var(--border-soft)] bg-[var(--input-bg)] px-s-3 py-s-2 text-[length:var(--fs-md)] text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--input-focus)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
