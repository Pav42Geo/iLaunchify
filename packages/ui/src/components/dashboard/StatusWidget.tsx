// @ilaunchify/ui — StatusWidget.
//
// Pokecut "System Health" pattern — vertical list of green/amber/red
// indicators, each with a label, optional value, and optional sparkline
// of the last N samples (e.g. requests/hour, error rate).
//
// Used by:
//   - Admin: Compliance service health, Stripe webhook health, cron status
//   - Partner: Stripe Connect status (KYB / payouts / debits)

import * as React from 'react'
import { Widget, type WidgetBaseProps } from './Widget'
import { ChartSparkline } from '../charts/ChartSparkline'
import { cn } from '../../lib/utils'

export type StatusIndicatorState = 'green' | 'amber' | 'red'

export interface StatusIndicator {
  label: string
  /** Optional value shown beside the label (e.g. "1.2s avg", "99.7%"). */
  value?: string
  /** Optional detail line under the label. */
  sublabel?: string
  /** Indicator color. */
  status: StatusIndicatorState
  /** Optional inline sparkline of the last N samples. */
  sparkline?: number[]
}

export interface StatusWidgetProps extends WidgetBaseProps {
  indicators: StatusIndicator[]
  /** Custom empty-state message. */
  emptyLabel?: string
}

const STATUS_DOT: Record<StatusIndicatorState, string> = {
  green: 'bg-success-500',
  amber: 'bg-warning-500',
  red: 'bg-danger-500',
}

const STATUS_RING: Record<StatusIndicatorState, string> = {
  green: 'ring-success-200',
  amber: 'ring-warning-200',
  red: 'ring-danger-200',
}

const STATUS_VALUE: Record<StatusIndicatorState, string> = {
  green: 'text-success-700',
  amber: 'text-warning-700',
  red: 'text-danger-700',
}

const SPARK_TONE: Record<StatusIndicatorState, 'success' | 'warning' | 'danger'> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

export function StatusWidget({
  indicators,
  emptyLabel = 'No status data.',
  ...widgetProps
}: StatusWidgetProps) {
  return (
    <Widget {...widgetProps}>
      {indicators.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <ul className="space-y-2.5">
          {indicators.map((ind, idx) => (
            <li
              key={`${ind.label}-${idx}`}
              className="flex items-center gap-3 rounded-lg px-1.5 py-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-offset-0',
                  STATUS_DOT[ind.status],
                  STATUS_RING[ind.status],
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink-900">
                  {ind.label}
                </p>
                {ind.sublabel && (
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
                    {ind.sublabel}
                  </p>
                )}
              </div>
              {ind.sparkline && ind.sparkline.length >= 2 && (
                <ChartSparkline
                  points={ind.sparkline}
                  tone={SPARK_TONE[ind.status]}
                  width={64}
                  height={22}
                  ariaLabel={`${ind.label} trend`}
                  className="shrink-0"
                />
              )}
              {ind.value && (
                <span
                  className={cn(
                    'shrink-0 text-[12px] font-semibold tabular-nums',
                    STATUS_VALUE[ind.status],
                  )}
                >
                  {ind.value}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}
