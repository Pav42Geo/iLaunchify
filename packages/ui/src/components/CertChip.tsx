import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * CertChip — single certification pill.
 *
 * Renders a `Certification` object at card-tag size per OOUX_OBJECT_MAP.md §2.8.
 * Two visual treatments:
 *   - `tone="organic"` glows neon green — used for high-affinity flags like
 *     USDA Organic, Non-GMO Project, Plant-Based.
 *   - `tone="neutral"` (default) renders as a muted ink chip.
 *
 * The neon variant is the system's strongest "this thing is verified-special"
 * affordance — use sparingly (1-2 per card max).
 */
export interface CertChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'organic' | 'neutral'
}

export function CertChip({ tone = 'neutral', className, children, ...props }: CertChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-pill whitespace-nowrap border',
        tone === 'organic'
          ? 'bg-neon-500 border-neon-500 text-ink-900 font-semibold'
          : 'bg-ink-100 border-ink-200 text-ink-700',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
