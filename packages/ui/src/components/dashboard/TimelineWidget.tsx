// @ilaunchify/ui — TimelineWidget.
//
// Vertical timeline — used by the admin/partner/creator "Recent activity"
// rows and the creator dashboard's per-order milestone strip. Each item
// is rendered with a left rail, a tone-dot, a connector line, and the
// body text on the right.
//
// Optional `href` per item turns the row into a Link (whole-row hover).

import * as React from 'react'
import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  Widget,
  type WidgetBaseProps,
  type WidgetTone,
} from './Widget'

export interface TimelineItem {
  id: string
  /** Date OR pre-formatted string ("2h ago"). */
  when: Date | string
  title: string
  body?: string
  icon?: React.ReactNode | LucideIcon
  tone?: WidgetTone
  href?: string
}

export interface TimelineWidgetProps extends WidgetBaseProps {
  items: TimelineItem[]
  maxItems?: number
  emptyLabel?: string
}

const DOT_TONE: Record<WidgetTone, string> = {
  pink: 'bg-pink-500',
  ink: 'bg-ink-700',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  info: 'bg-info-500',
  danger: 'bg-danger-500',
  neon: 'bg-neon-500',
}

const ICON_BALL_TONE: Record<WidgetTone, string> = {
  pink: 'bg-pink-100 text-pink-700',
  ink: 'bg-ink-100 text-ink-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  info: 'bg-info-100 text-info-700',
  danger: 'bg-danger-100 text-danger-700',
  neon: 'bg-neon-500 text-ink-900',
}

function renderIcon(icon: TimelineItem['icon']): React.ReactNode {
  if (!icon) return null
  if (React.isValidElement(icon) || typeof icon === 'string' || typeof icon === 'number') {
    return icon
  }
  // Component TYPE (function OR forwardRef object). Lucide icons are forwardRef
  // objects, so `typeof === 'function'` misses them — see Widget.renderIcon.
  const Icon = icon as LucideIcon
  return <Icon className="h-3.5 w-3.5" aria-hidden="true" />
}

function relativeTime(when: Date | string): string {
  if (typeof when === 'string') return when
  const diffSec = (Date.now() - when.getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d`
  return when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

function Row({
  item,
  isLast,
}: {
  item: TimelineItem
  isLast: boolean
}) {
  const tone: WidgetTone = item.tone ?? 'pink'
  const iconNode = renderIcon(item.icon)
  const when = relativeTime(item.when)

  const body = (
    <div className="relative flex gap-3 pb-3">
      {/* Left rail — dot + optional connector line */}
      <div className="relative flex flex-col items-center" aria-hidden="true">
        {iconNode ? (
          <span
            className={cn(
              'relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white',
              ICON_BALL_TONE[tone],
            )}
          >
            {iconNode}
          </span>
        ) : (
          <span
            className={cn(
              'relative z-10 mt-1.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white',
              DOT_TONE[tone],
            )}
          />
        )}
        {!isLast && (
          <span className="absolute left-1/2 top-1 h-full w-px -translate-x-1/2 bg-ink-200" />
        )}
      </div>

      <div className="min-w-0 flex-1 leading-snug">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[13px] font-semibold text-ink-900">
            {item.title}
          </p>
          <span className="shrink-0 tabular-nums text-[11px] text-ink-400">
            {when}
          </span>
        </div>
        {item.body && (
          <p className="mt-0.5 text-[12px] text-ink-600">{item.body}</p>
        )}
      </div>
    </div>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block rounded-md transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        {body}
      </Link>
    )
  }
  return body
}

export function TimelineWidget({
  items,
  maxItems,
  emptyLabel = 'No activity yet.',
  ...widgetProps
}: TimelineWidgetProps) {
  const sliced = typeof maxItems === 'number' ? items.slice(0, maxItems) : items
  return (
    <Widget {...widgetProps}>
      {sliced.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <ol className="space-y-0">
          {sliced.map((item, i) => (
            <li key={item.id}>
              <Row item={item} isLast={i === sliced.length - 1} />
            </li>
          ))}
        </ol>
      )}
    </Widget>
  )
}
