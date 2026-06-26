// @ilaunchify/ui — KpiWidget.
//
// Single big number + delta chip + optional inline sparkline. Matches the
// visual of `apps/admin/src/app/(dashboard)/partners/page.tsx` KpiCard
// (icon ball top-left, big numeral, hover ring) but extended with delta +
// sparkline. Whole tile is clickable when `href` is provided.
//
// The base <Widget> shell is overkill for KPIs (no header band, no footer),
// so this renders its own tighter chrome but reuses the same tone tables.

import * as React from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ChartSparkline } from '../charts/ChartSparkline'
import type { ChartTone } from '../charts/chartPalette'
import {
  WIDGET_SPAN_CLASSES,
  WIDGET_TONE_ICON_BALL,
  type WidgetSpan,
  type WidgetTone,
} from './Widget'

export interface KpiDelta {
  /** Display string (e.g. "4%", "+12", "$1.2k"). */
  value: string
  /** Direction — drives chip tone and arrow. */
  direction: 'up' | 'down' | 'flat'
}

export interface KpiWidgetProps {
  label: string
  value: string | number
  /** Optional second-tier metric beneath the big number (e.g. "Oldest: 12d"). */
  sublabel?: string
  /** Optional click target — when set the whole tile becomes a Link. */
  href?: string
  /** Tone — drives icon ball color. Default "ink". */
  tone?: WidgetTone
  /** Icon — Lucide component OR ReactNode. */
  icon?: React.ReactNode | LucideIcon
  /** Trend chip rendered top-right. */
  delta?: KpiDelta
  /** Inline sparkline beneath the value. */
  sparkline?: number[]
  /** Sparkline tone override — defaults to KPI tone (mapped to a ChartTone). */
  sparklineTone?: ChartTone
  /** 12-col grid span. Default 3 (5 across on desktop = standard KPI strip). */
  span?: WidgetSpan
  /** Visually marks the tile as the "current view" — adds a pink ring. */
  active?: boolean
  className?: string
}

const DELTA_TONE: Record<KpiDelta['direction'], string> = {
  up: 'bg-success-50 text-success-700',
  down: 'bg-danger-50 text-danger-700',
  flat: 'bg-ink-100 text-ink-600',
}

// Widget tones don't 1:1 map to chart tones for "ink" (chart-ink reads too
// heavy in a tiny sparkline). Provide a default mapping the consumer can
// override via `sparklineTone`.
const KPI_TO_CHART_TONE: Record<WidgetTone, ChartTone> = {
  pink: 'pink',
  ink: 'ink',
  success: 'success',
  warning: 'warning',
  info: 'info',
  danger: 'danger',
  neon: 'neon',
}

function renderIcon(icon: KpiWidgetProps['icon']): React.ReactNode {
  if (!icon) return null
  // Already a rendered element or text node — pass through.
  if (React.isValidElement(icon) || typeof icon === 'string' || typeof icon === 'number') {
    return icon
  }
  // Component TYPE (function OR forwardRef object). Lucide icons are forwardRef
  // objects, so `typeof === 'function'` misses them — see Widget.renderIcon.
  const Icon = icon as LucideIcon
  return <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
}

function formatValue(v: string | number): string {
  if (typeof v === 'string') return v
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 10_000) return (v / 1000).toFixed(0) + 'k'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return String(v)
}

export function KpiWidget({
  label,
  value,
  sublabel,
  href,
  tone = 'ink',
  icon,
  delta,
  sparkline,
  sparklineTone,
  span = 3,
  active,
  className,
}: KpiWidgetProps) {
  const iconNode = renderIcon(icon)
  const sparkTone: ChartTone = sparklineTone ?? KPI_TO_CHART_TONE[tone]
  const valueStr = formatValue(value)

  const outerCls = cn(
    'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5',
    'transition-[transform,box-shadow,border-color] duration-base ease-out-quart',
    'ring-1 ring-transparent',
    href &&
      'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
    active && 'ring-pink-300/40',
    WIDGET_SPAN_CLASSES[span],
    className,
  )

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {iconNode && (
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                WIDGET_TONE_ICON_BALL[tone],
              )}
            >
              {iconNode}
            </span>
          )}
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
        </div>
        {delta && <DeltaChip delta={delta} />}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              'font-display font-semibold leading-none tabular-nums tracking-tight text-ink-900',
              'text-[30px] sm:text-[32px]',
            )}
          >
            {valueStr}
          </p>
          {sublabel && (
            <p className="mt-1.5 text-[11.5px] text-ink-500">{sublabel}</p>
          )}
        </div>
        {sparkline && sparkline.length >= 2 && (
          <ChartSparkline
            points={sparkline}
            tone={sparkTone}
            width={72}
            height={28}
            ariaLabel={`${label} trend`}
            className="shrink-0"
          />
        )}
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={outerCls}>
        {body}
      </Link>
    )
  }
  return <div className={outerCls}>{body}</div>
}

function DeltaChip({ delta }: { delta: KpiDelta }) {
  const Icon =
    delta.direction === 'up'
      ? ArrowUpRight
      : delta.direction === 'down'
        ? ArrowDownRight
        : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-[3px] text-[11px] font-semibold tabular-nums',
        DELTA_TONE[delta.direction],
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{delta.value}</span>
    </span>
  )
}
