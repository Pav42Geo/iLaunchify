import * as React from 'react'
import { cn } from '../lib/utils'
import { SectionLabel } from './SectionLabel'

/**
 * OrderTimelineView — the creator-facing "running story" of a dispatch/order
 * (docs/EMAIL_NOTIFICATION_CENTER.md Part 3, checklist F). Renders the entries
 * produced by `buildDispatchTimeline` / `buildOrderTimeline`
 * (@ilaunchify/orders) as a vertical timeline: FSM state changes + partner
 * progress updates (notes, revised ETAs, photos, milestones).
 *
 * Presentational + dependency-free: props mirror `OrderTimelineEntry`
 * structurally but are declared locally so @ilaunchify/ui never imports the
 * orders package. Hosts resolve photoAssetId → url before passing entries in
 * (this package has no storage access).
 */

export type TimelineViewEntryKind = 'STATE' | 'NOTE' | 'ETA' | 'PHOTO' | 'MILESTONE' | (string & {})

export interface OrderTimelineViewEntry {
  id: string
  dispatchId: string
  at: string // ISO
  kind: TimelineViewEntryKind
  label: string
  detail?: string | null
  author?: string | null
  /** Resolved image URL for PHOTO entries (host maps photoAssetId → url). */
  photoUrl?: string | null
  attention?: boolean
}

export interface OrderTimelineViewProps {
  entries: OrderTimelineViewEntry[]
  /** Optional running ETA banner (ISO) — from `effectiveEta`. */
  etaAt?: string | null
  /** Newest entries first (default true — creators want the latest on top). */
  newestFirst?: boolean
  title?: string
  className?: string
  /** Compact removes the card chrome for embedding inside an existing panel. */
  compact?: boolean
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // ETA is a calendar date — format in UTC so it never shifts by viewer TZ
  // (matches fmtEta in @ilaunchify/orders dispatch-timeline).
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

const KIND_BADGE: Record<string, string> = {
  ETA: 'ETA',
  PHOTO: 'Photo',
  MILESTONE: 'Milestone',
  NOTE: 'Note',
}

function Dot({ kind, attention }: { kind: TimelineViewEntryKind; attention: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-1.5 block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--bg-surface)]',
        attention ? 'bg-danger-500' : kind === 'STATE' ? 'bg-ink-900' : 'bg-pink-500',
      )}
    />
  )
}

function EtaBanner({ etaAt }: { etaAt: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-ink-200 bg-[var(--bg-hero)] px-3 py-2">
      <span aria-hidden>📦</span>
      <span className="text-[length:var(--fs-sm)] text-ink-700">
        Estimated delivery <span className="font-semibold text-ink-900">{fmtDate(etaAt)}</span>
      </span>
    </div>
  )
}

export function OrderTimelineView({
  entries,
  etaAt,
  newestFirst = true,
  title = 'Production timeline',
  className,
  compact = false,
}: OrderTimelineViewProps) {
  const ordered = newestFirst ? [...entries].reverse() : entries

  const body = (
    <>
      {etaAt && <EtaBanner etaAt={etaAt} />}
      {ordered.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-ink-500">
          No activity yet — updates from your partners will appear here.
        </p>
      ) : (
        <ol className="relative ml-1 border-l border-ink-200 pl-4">
          {ordered.map((e) => (
            <li key={e.id} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[21.5px]">
                <Dot kind={e.kind} attention={e.attention ?? false} />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    'text-[length:var(--fs-sm)] font-medium',
                    e.attention ? 'text-danger-600' : 'text-ink-900',
                  )}
                >
                  {e.label}
                </span>
                {e.kind !== 'STATE' && KIND_BADGE[e.kind] && (
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                    {KIND_BADGE[e.kind]}
                  </span>
                )}
                <time dateTime={e.at} className="text-[length:var(--fs-xs)] text-ink-400">
                  {fmtDateTime(e.at)}
                </time>
              </div>
              {e.detail && (
                <p className="mt-0.5 whitespace-pre-line text-[length:var(--fs-sm)] text-ink-600">
                  {e.detail}
                </p>
              )}
              {e.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.photoUrl}
                  alt={e.detail ?? 'Production photo'}
                  className="mt-2 max-h-48 rounded-lg border border-ink-200 object-cover"
                />
              )}
              {e.author && (
                <div className="mt-0.5 text-[length:var(--fs-xs)] text-ink-400">— {e.author}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  )

  if (compact) return <div className={className}>{body}</div>

  return (
    <section
      className={cn(
        'rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] p-4',
        className,
      )}
    >
      <div className="mb-3">
        <SectionLabel>{title}</SectionLabel>
      </div>
      {body}
    </section>
  )
}
