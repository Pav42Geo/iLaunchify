import * as React from 'react'
import { cn } from '../lib/utils'
import { TrendChart } from './TrendChart'

export interface MetricDelta {
  /** Magnitude, e.g. 12 for "12%". */
  value: number
  direction: 'up' | 'down'
  /** Whether "up" is good (green) — defaults true; set false for cost metrics. */
  goodUp?: boolean
  /** Trailing text, e.g. "vs prior 30d" or "this month". */
  suffix?: string
}

/**
 * MetricCard — a KPI card: label, big tabular value, an optional trend delta
 * chip (green/red ▲▼) and an optional sparkline. Token-driven; links if `href`.
 * The dashboard KPI strip building block (replaces ad-hoc KpiWidget variants).
 */
export function MetricCard({
  label,
  value,
  delta,
  sparkline,
  icon,
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  delta?: MetricDelta
  sparkline?: number[]
  /** Optional corner icon (pass a Lucide element). */
  icon?: React.ReactNode
  href?: string
  className?: string
}) {
  const good = delta ? (delta.goodUp ?? true) === (delta.direction === 'up') : false
  const body = (
    <div
      className={cn(
        'rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-3.5 transition-colors',
        href && 'hover:border-[var(--card-border-hover)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--fs-sm)] text-ink-600">{label}</span>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums tracking-tight text-ink-900">{value}</div>
      {(delta || (sparkline && sparkline.length > 1)) && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {delta ? (
            <span className={cn('inline-flex items-center gap-0.5 text-[length:var(--fs-xs)] font-semibold', good ? 'text-success-500' : 'text-danger-500')}>
              <span aria-hidden>{delta.direction === 'up' ? '↑' : '↓'}</span>
              {Math.abs(delta.value)}%{delta.suffix ? <span className="font-normal text-ink-500"> {delta.suffix}</span> : null}
            </span>
          ) : (
            <span />
          )}
          {sparkline && sparkline.length > 1 && (
            <TrendChart data={sparkline} height={22} className="max-w-[84px]" ariaLabel={`${label} trend`} />
          )}
        </div>
      )}
    </div>
  )
  return href ? (
    <a href={href} className="block">
      {body}
    </a>
  ) : (
    body
  )
}
