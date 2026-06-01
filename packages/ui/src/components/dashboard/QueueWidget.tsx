// @ilaunchify/ui — QueueWidget.
//
// Pokecut-style moderation queue: each row has a label + sublabel + a
// primary action button on the right. Actions can be a link or a callback;
// callback variant must be used inside a client component.
//
// Used by:
//   - Admin moderation queue (stuck leads / products / dispatches)
//   - Partner dispatches-awaiting-accept queue
//   - Creator orders-needing-attention queue

'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../../lib/utils'
import {
  Widget,
  type WidgetBaseProps,
  type WidgetTone,
} from './Widget'

export type QueueActionTone = 'success' | 'warning' | 'danger' | 'pink' | 'ink'

export interface QueueAction {
  label: string
  /** Link href OR callback (callback requires client component). */
  href?: string
  onSelect?: () => void
  tone?: QueueActionTone
  disabled?: boolean
}

export interface QueueWidgetItem {
  id: string
  label: string
  sublabel?: string
  /** Leading icon — a RENDERED element (e.g. `<Inbox />`). QueueWidget is a
   * client component, so a Lucide component (forwardRef object) can't cross the
   * RSC boundary — only ReactNode does. */
  icon?: React.ReactNode
  /** Tone for the leading icon ball / dot. */
  tone?: WidgetTone
  primaryAction: QueueAction
}

// QueueWidget is a client component (it supports onSelect callbacks), so its
// header icon must also be a ReactNode element, not a Lucide component — hence
// the Omit + re-declare. Server widgets (Widget/KpiWidget/...) keep the
// LucideIcon convenience because they render the icon server-side.
export interface QueueWidgetProps extends Omit<WidgetBaseProps, 'icon'> {
  items: QueueWidgetItem[]
  maxItems?: number
  emptyLabel?: string
  /** Header icon — pass a rendered element, e.g. `icon={<AlertTriangle />}`. */
  icon?: React.ReactNode
}

const ACTION_TONE: Record<QueueActionTone, string> = {
  // Black pill primary — matches the locked design system signature.
  ink: 'bg-ink-900 text-white hover:bg-black',
  pink: 'bg-pink-500 text-white hover:bg-pink-600',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  warning: 'bg-amber-500 text-white hover:bg-amber-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
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

const DOT_TONE: Record<WidgetTone, string> = {
  pink: 'bg-pink-500',
  ink: 'bg-ink-700',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  danger: 'bg-rose-500',
  neon: 'bg-neon-500',
}

function renderIcon(icon: QueueWidgetItem['icon']): React.ReactNode {
  // icon is a ReactNode (rendered element / text) — render as-is.
  return icon ?? null
}

function ActionButton({ action }: { action: QueueAction }) {
  const tone = action.tone ?? 'ink'
  const cls = cn(
    'inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap',
    'transition-colors duration-base',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    ACTION_TONE[tone],
  )

  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={action.onSelect}
      disabled={action.disabled}
      className={cls}
    >
      {action.label}
    </button>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

export function QueueWidget({
  items,
  maxItems,
  emptyLabel = 'Queue is clear.',
  ...widgetProps
}: QueueWidgetProps) {
  const sliced = typeof maxItems === 'number' ? items.slice(0, maxItems) : items

  return (
    <Widget {...widgetProps}>
      {sliced.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <ul className="divide-y divide-ink-100">
          {sliced.map((item) => {
            const tone: WidgetTone = item.tone ?? 'ink'
            const iconNode = renderIcon(item.icon)
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 px-1.5 py-2.5"
              >
                {iconNode ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      ICON_BALL_TONE[tone],
                    )}
                  >
                    {iconNode}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1 h-2 w-2 shrink-0 rounded-full',
                      DOT_TONE[tone],
                    )}
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
                <ActionButton action={item.primaryAction} />
              </li>
            )
          })}
        </ul>
      )}
    </Widget>
  )
}
