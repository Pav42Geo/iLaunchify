'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * NotificationPreferenceMatrix — the group × channel opt-out grid
 * (docs/EMAIL_NOTIFICATION_CENTER.md — "Group-level opt-out"; checklist D).
 * Replaces the old 8-event list: one row per notification CATEGORY, one toggle
 * per channel. Mandatory categories render locked (always on).
 *
 * Presentational: props mirror `effectiveCategoryMatrix` (@ilaunchify/notifications)
 * structurally but are declared locally so @ilaunchify/ui stays dependency-free.
 * The host owns persistence via onToggle (optimistic or await — its choice).
 */

export type PreferenceChannel = 'IN_APP' | 'EMAIL' | (string & {})

export interface PreferenceMatrixCategory {
  slug: string
  label: string
  description?: string | null
  /** Locked = mandatory/transactional — rendered on + disabled. */
  locked: boolean
  /** Channels this category can use at all (cells outside are not rendered). */
  channels: PreferenceChannel[]
}

export interface PreferenceMatrixCell {
  category: string // slug
  channel: PreferenceChannel
  enabled: boolean
}

export interface NotificationPreferenceMatrixProps {
  categories: PreferenceMatrixCategory[]
  cells: PreferenceMatrixCell[]
  /** Column order + labels. Default: In-app, Email. */
  channelLabels?: Array<{ channel: PreferenceChannel; label: string }>
  onToggle?: (category: string, channel: PreferenceChannel, enabled: boolean) => void
  /** Disables every toggle (e.g. while a save is in flight). */
  disabled?: boolean
  className?: string
}

const DEFAULT_CHANNELS: Array<{ channel: PreferenceChannel; label: string }> = [
  { channel: 'IN_APP', label: 'In-app' },
  { channel: 'EMAIL', label: 'Email' },
]

function Toggle({
  checked,
  locked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  locked: boolean
  disabled: boolean
  label: string
  onChange: () => void
}) {
  const off = locked || disabled
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={off}
      onClick={onChange}
      title={locked ? 'Required — these notifications can’t be turned off' : undefined}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        checked ? (locked ? 'bg-ink-300' : 'bg-ink-900') : 'bg-ink-200',
        off ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

export function NotificationPreferenceMatrix({
  categories,
  cells,
  channelLabels = DEFAULT_CHANNELS,
  onToggle,
  disabled = false,
  className,
}: NotificationPreferenceMatrixProps) {
  const cellFor = (slug: string, channel: PreferenceChannel) =>
    cells.find((c) => c.category === slug && c.channel === channel)

  return (
    <div className={cn('overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)]', className)}>
      <table className="w-full border-collapse bg-[var(--bg-surface)]">
        <thead>
          <tr className="border-b border-ink-200 bg-[var(--bg-hero)]">
            <th className="px-4 py-2.5 text-left text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-ink-500">
              Notification group
            </th>
            {channelLabels.map((ch) => (
              <th
                key={ch.channel}
                className="w-24 px-4 py-2.5 text-center text-[length:var(--fs-xs)] font-medium uppercase tracking-wide text-ink-500"
              >
                {ch.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {categories.map((cat) => (
            <tr key={cat.slug}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[length:var(--fs-sm)] font-medium text-ink-900">{cat.label}</span>
                  {cat.locked && (
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                      Required
                    </span>
                  )}
                </div>
                {cat.description && (
                  <div className="mt-0.5 text-[length:var(--fs-xs)] text-ink-500">{cat.description}</div>
                )}
              </td>
              {channelLabels.map((ch) => {
                if (!cat.channels.includes(ch.channel)) {
                  return (
                    <td key={ch.channel} className="px-4 py-3 text-center text-ink-300" aria-hidden>
                      —
                    </td>
                  )
                }
                const cell = cellFor(cat.slug, ch.channel)
                const enabled = cat.locked ? true : (cell?.enabled ?? true)
                return (
                  <td key={ch.channel} className="px-4 py-3 text-center">
                    <Toggle
                      checked={enabled}
                      locked={cat.locked}
                      disabled={disabled}
                      label={`${cat.label} — ${ch.label}`}
                      onChange={() => onToggle?.(cat.slug, ch.channel, !enabled)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
