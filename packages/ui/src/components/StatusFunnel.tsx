import * as React from 'react'
import { cn } from '../lib/utils'

export interface FunnelStage {
  label: string
  value: number
  /** Bar segment tone. 'pink' highlights the focus stage. */
  tone?: 'ink' | 'pink' | 'muted'
  href?: string
}

/**
 * StatusFunnel — a horizontal pipeline (e.g. accepted → production → ready →
 * shipped) with a proportional segmented bar + a labeled count list. For the
 * partner production pipeline and the creator order pipeline.
 */
export function StatusFunnel({
  title,
  stages,
  className,
}: {
  title?: string
  stages: FunnelStage[]
  className?: string
}) {
  const bar = (tone?: FunnelStage['tone']) =>
    tone === 'pink' ? 'bg-pink-500' : tone === 'muted' ? 'bg-ink-300' : 'bg-ink-400'
  return (
    <div className={cn('rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-3.5', className)}>
      {title && <div className="text-[length:var(--fs-sm)] font-semibold text-ink-900">{title}</div>}
      <div className={cn('flex gap-1', title && 'mt-3')}>
        {stages.map((s, i) => (
          <div key={i} className={cn('h-2 rounded-pill', bar(s.tone))} style={{ flex: Math.max(s.value, 0.4) }} aria-hidden />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {stages.map((s, i) => {
          const row = (
            <>
              <span className="text-ink-600">{s.label}</span>
              <span className="font-semibold tabular-nums text-ink-900">{s.value}</span>
            </>
          )
          return s.href ? (
            <a key={i} href={s.href} className="flex items-center justify-between text-[length:var(--fs-md)] hover:underline">
              {row}
            </a>
          ) : (
            <div key={i} className="flex items-center justify-between text-[length:var(--fs-md)]">
              {row}
            </div>
          )
        })}
      </div>
    </div>
  )
}
