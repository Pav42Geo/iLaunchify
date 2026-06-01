// @ilaunchify/ui — ListWidget.
//
// Top-N rows widget — InboxPreview / TopSKU / Cert-expiry / recent
// DesignVersion activity all collapse to this shape. Each row is an
// optional link with a leading tone dot + label + optional value chip on
// the right.
//
// Pattern locked in apps/admin/.../widgets/InboxPreview.tsx (the seed):
//   - colored dot · title · subtitle / value chip · trailing age or arrow
//   - row hover = bg-ink-50, focus-visible ring

import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Widget, type WidgetBaseProps, type WidgetTone } from './Widget'

export interface ListWidgetItem {
  id: string
  label: string
  /** Secondary line below label. */
  sublabel?: string
  /** Right-side value chip. */
  value?: string
  /** When set the whole row becomes a Link. */
  href?: string
  /** Leading icon — Lucide component or ReactNode. */
  icon?: React.ReactNode | LucideIcon
  /** Tone for the leading dot / icon ball. */
  tone?: WidgetTone
  /** Optional trailing label (e.g. "12d", "2h ago"). Replaces the chevron. */
  trailingLabel?: string
}

export interface ListWidgetProps extends WidgetBaseProps {
  items: ListWidgetItem[]
  /** Cap the visible rows. Default = render all. */
  maxItems?: number
  /** Custom empty-state message. */
  emptyLabel?: string
}

const DOT_TONE: Record<WidgetTone, string> = {
  pink: 'bg-pink-500',
  ink: 'bg-ink-700',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  danger: 'bg-rose-500',
  neon: 'bg-neon-500',
}

const ICON_BALL_TONE: Record<WidgetTone, string> = {
  pink: 'bg-pink-100 text-pink-700',
  ink: 'bg-ink-100 text-ink-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  danger: 'bg-rose-100 text-rose-700',
  neon: 'bg-neon-500 text-ink-900',
}

function renderIcon(icon: ListWidgetItem['icon']): React.ReactNode {
  if (!icon) return null
  if (typeof icon === 'function') {
    const Icon = icon as LucideIcon
    return <Icon className="h-3.5 w-3.5" aria-hidden="true" />
  }
  return icon
}

function Row({ item }: { item: ListWidgetItem }) {
  const tone: WidgetTone = item.tone ?? 'ink'
  const iconNode = renderIcon(item.icon)

  const inner = (
    <div
      className={cn(
        'flex items-center gap-3 px-1.5 py-2.5',
        'transition-colors',
        item.href &&
          'hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded-md',
      )}
    >
      {iconNode ? (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            ICON_BALL_TONE[tone],
          )}
        >
          {iconNode}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', DOT_TONE[tone])}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink-900">
          {item.label}
        </p>
        {item.sublabel && (
          <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
            {item.sublabel}
          </p>
        )}
      </div>
      {item.value && (
        <span className="rounded-full bg-ink-100 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider tabular-nums text-ink-700">
          {item.value}
        </span>
      )}
      {item.trailingLabel ? (
        <span className="shrink-0 tabular-nums text-[11px] text-ink-400">
          {item.trailingLabel}
        </span>
      ) : item.href ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
      ) : null}
    </div>
  )

  if (item.href) {
    return <Link href={item.href}>{inner}</Link>
  }
  return inner
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

export function ListWidget({
  items,
  maxItems,
  emptyLabel = 'Nothing here yet.',
  ...widgetProps
}: ListWidgetProps) {
  const sliced = typeof maxItems === 'number' ? items.slice(0, maxItems) : items
  return (
    <Widget {...widgetProps}>
      {sliced.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <ul className="divide-y divide-ink-100">
          {sliced.map((item) => (
            <li key={item.id}>
              <Row item={item} />
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}
