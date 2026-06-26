import * as React from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

export interface ActionQueueItem {
  /** Optional leading icon (a Lucide element). */
  icon?: React.ReactNode
  label: string
  /** Optional count badge. */
  count?: number
  href: string
  /** Urgency drives the leading dot color. */
  urgency?: 'high' | 'medium' | 'low'
}

/**
 * ActionQueue — the "needs you now" panel: a ranked list of items that need
 * action, each a count + jump link, with an urgency dot. The single most useful
 * dashboard widget per persona. Shows a friendly empty state when clear.
 */
export function ActionQueue({
  title = 'Needs you now',
  items,
  emptyLabel = 'All clear — nothing needs you right now.',
  className,
}: {
  title?: string
  items: ActionQueueItem[]
  emptyLabel?: string
  className?: string
}) {
  const dot = (u?: ActionQueueItem['urgency']) =>
    u === 'high' ? 'bg-pink-500' : u === 'medium' ? 'bg-warning-500' : 'bg-ink-300'
  return (
    <div className={cn('overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)]', className)}>
      <div className="px-4 pb-1 pt-3 text-[length:var(--fs-sm)] font-semibold text-ink-600">{title}</div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[length:var(--fs-sm)] text-ink-500">
          <Check className="h-4 w-4 text-success-500" aria-hidden /> {emptyLabel}
        </div>
      ) : (
        items.map((it, i) => (
          <a
            key={i}
            href={it.href}
            className="flex items-center gap-3 border-t border-ink-100 px-4 py-2.5 transition-colors hover:bg-ink-50/60"
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', dot(it.urgency))} aria-hidden />
            {it.icon && <span className="shrink-0 text-ink-500">{it.icon}</span>}
            <span className="min-w-0 flex-1 truncate text-[length:var(--fs-md)] text-ink-900">{it.label}</span>
            {it.count != null && (
              <span className="rounded-pill bg-pink-50 px-2 py-0.5 text-[length:var(--fs-xs)] font-semibold tabular-nums text-pink-700">
                {it.count}
              </span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          </a>
        ))
      )}
    </div>
  )
}
