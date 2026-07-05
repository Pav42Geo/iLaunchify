'use client'

// Shared version-history UI for both editor surfaces (partner product-builder +
// creator Design Studio). Presentational only — the app wires the data + actions.
//   <SavedIndicator>      replaces the old "Save draft" button: passive autosave
//                         status + a History button.
//   <VersionHistoryDrawer> right-side drawer listing the last N snapshots +
//                         pinned milestones, each restorable.
// Backed by @ilaunchify/db EditSnapshot (createSnapshot/listSnapshots/getSnapshotJson).

import * as React from 'react'
import { Check, ChevronLeft, ChevronRight, Clock, Cloud, History, Loader2, Lock, RotateCcw, Pin, Bookmark, X } from 'lucide-react'

// lucide's `cloud-check` ships in a newer release than we pin (0.453.0), so we
// draw it here in the same 24×24 stroke style — a cloud with a check, matching
// the familiar "saved to cloud" affordance.
function CloudCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 1.5 8.74" />
      <path d="m9 12.75 2 2 4-4" />
    </svg>
  )
}

// PROMOTION — auto-pin on the outgoing Active when an alternate is promoted
// (versioning v2 §3.3); rendered like a milestone.
export type SnapshotKind = 'AUTO' | 'MILESTONE' | 'MANUAL' | 'PROMOTION'
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface SnapshotItem {
  id: string
  kind: SnapshotKind
  label: string | null
  pinned: boolean
  createdAt: Date
  /** Small PNG data URL preview (design studio). */
  thumbnail?: string | null
}

// ---------------------------------------------------------------------------
// Relative time — small, dependency-free.
// ---------------------------------------------------------------------------
export function relativeTime(date: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fullStamp(date: Date): string {
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Clock time only, e.g. "3:45 PM" — for the "Saved at …" hover tooltip. */
function clockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// SavedIndicator — autosave status pill + History button.
// ---------------------------------------------------------------------------
export function SavedIndicator({
  status,
  savedAt,
  onSave,
  onOpenHistory,
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
  className = '',
}: {
  status: SaveStatus
  savedAt: Date | null
  /** When provided, the status icon becomes a "Save now" button — clicking it
   *  flushes pending autosaves immediately instead of waiting for the debounce.
   *  Return false (or reject) when nothing was actually saved — e.g. required
   *  fields missing — so the green "Saved" confirmation does NOT show. */
  onSave?: () => void | boolean | Promise<void | boolean>
  onOpenHistory?: () => void
  /** Step to the previous (older) version in the history panel. */
  onPrev?: () => void
  /** Step to the next (newer) version in the history panel. */
  onNext?: () => void
  canPrev?: boolean
  canNext?: boolean
  className?: string
}) {
  // Re-render every 30s so the "Saved 2 min ago" tooltip stays fresh.
  const [, tick] = React.useState(0)
  React.useEffect(() => {
    if (!savedAt) return
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [savedAt])

  // Brief post-click flash — a green check on success, a pink X when nothing was
  // saved (e.g. required fields missing) — so the user sees their click did (or
  // couldn't do) something. Clears after ~1.4s.
  const [justSaved, setJustSaved] = React.useState(false)
  const [justFailed, setJustFailed] = React.useState(false)
  const flashTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = React.useCallback((ok: boolean) => {
    setJustSaved(ok)
    setJustFailed(!ok)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => { setJustSaved(false); setJustFailed(false) }, 1400)
  }, [])
  React.useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])
  const handleSaveClick = React.useCallback(async () => {
    if (status === 'saving') return
    try {
      const result = await onSave?.()
      flash(result !== false) // false → nothing saved → pink-X flash; otherwise green check
    } catch {
      flash(false)
    }
  }, [status, onSave, flash])

  // Resting affordance is a cloud-with-check ("saved to cloud") — the icon also
  // doubles as a manual "save now" button. A plain cloud means not-saved-yet.
  let StatusIcon: React.ComponentType<{ className?: string }> = CloudCheck
  let tip = savedAt ? `Saved at ${clockTime(savedAt)}` : 'All changes saved automatically'
  let tone = 'text-ink-600'
  let spin = false
  if (status === 'saving') {
    StatusIcon = Loader2
    tip = 'Saving…'
    tone = 'text-ink-500'
    spin = true
  } else if (status === 'error') {
    StatusIcon = X
    tip = 'Save failed — retrying'
    tone = 'text-danger-600'
  } else if (status === 'dirty') {
    StatusIcon = Cloud
    tip = savedAt ? 'Unsaved changes' : 'Not saved yet'
    tone = 'text-pink-600'
  }

  // The post-click flash overrides whatever the live status is showing.
  if (justSaved && status !== 'saving') {
    StatusIcon = Check
    tone = 'text-success-600'
    spin = false
    tip = 'Saved!'
  } else if (justFailed && status !== 'saving') {
    StatusIcon = X
    tone = 'text-pink-600'
    spin = false
    tip = 'Not saved'
  }

  // Borderless icon-button — same chrome as the notification bell in the top bar.
  const btn =
    'rounded-md p-2 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-600'

  // When onSave is wired, the status icon doubles as a "Save now" button —
  // shows live autosave state AND lets the user force a save on demand.
  const saveTip = status === 'saving' ? 'Saving…' : `${tip} · click to save now`

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {/* Autosave status — icon + native tooltip. Clickable "Save now" when onSave. */}
      {onSave ? (
        <span className="relative">
          <button
            type="button"
            onClick={() => { void handleSaveClick() }}
            disabled={status === 'saving'}
            className={`rounded-md p-2 ${tone} transition-colors hover:bg-ink-100 disabled:cursor-default disabled:hover:bg-transparent`}
            title={saveTip}
            aria-label={saveTip}
          >
            <StatusIcon className={`h-5 w-5 transition-transform duration-200 ${spin ? 'animate-spin' : ''} ${justSaved || justFailed ? 'scale-110' : 'scale-100'}`} />
          </button>
          {/* Post-click message — auto-shows for ~1.4s under the icon. */}
          {justSaved && savedAt && status !== 'saving' && (
            <span
              role="status"
              className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-success-600 shadow-lg"
            >
              Saved at {clockTime(savedAt)}
            </span>
          )}
          {justFailed && status !== 'saving' && (
            <span
              role="status"
              className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-pink-600 shadow-lg"
            >
              Not saved yet
            </span>
          )}
        </span>
      ) : (
        <span className={`rounded-md p-2 ${tone}`} title={tip} aria-label={tip}>
          <StatusIcon className={`h-5 w-5 ${spin ? 'animate-spin' : ''}`} />
        </span>
      )}

      {(onPrev || onNext) && (
        <>
          <button type="button" className={btn} onClick={onPrev} disabled={!canPrev} title="Previous version" aria-label="Previous version">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={btn} onClick={onNext} disabled={!canNext} title="Next version" aria-label="Next version">
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {onOpenHistory && (
        <button type="button" className={btn} onClick={onOpenHistory} title="Version history" aria-label="Version history">
          <History className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kind badge.
// ---------------------------------------------------------------------------
function KindBadge({ item }: { item: SnapshotItem }) {
  if (item.kind === 'MILESTONE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-warning-800">
        <Pin className="h-2.5 w-2.5" /> Milestone
      </span>
    )
  }
  if (item.kind === 'MANUAL') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">
        <Bookmark className="h-2.5 w-2.5" /> Saved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-ink-200 bg-white px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink-400">
      Auto
    </span>
  )
}

// ---------------------------------------------------------------------------
// VersionHistoryDrawer — right-side drawer of restorable snapshots.
// ---------------------------------------------------------------------------
export function VersionHistoryDrawer({
  open,
  onClose,
  items,
  onRestore,
  restoringId = null,
  currentId = null,
  title = 'Version history',
  emptyHint = 'Snapshots appear here as you work — and at each milestone (step advance, confirm, submit).',
  allowRestore = true,
  footnote,
}: {
  open: boolean
  onClose: () => void
  items: SnapshotItem[]
  onRestore: (id: string) => void
  restoringId?: string | null
  currentId?: string | null
  title?: string
  emptyHint?: string
  /** When false, snapshots are shown read-only (no Restore button). */
  allowRestore?: boolean
  /** Optional override for the footer note. */
  footnote?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <aside className="relative flex h-full w-[360px] max-w-[90vw] flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-ink-600" />
            <div>
              <div className="font-display text-[14px] font-semibold text-ink-900">{title}</div>
              <div className="text-[11px] text-ink-500">{items.length} version{items.length === 1 ? '' : 's'} · last 10 + milestones</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-ink-500">{emptyHint}</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it, i) => {
                const isCurrent = currentId ? it.id === currentId : i === 0
                const restoring = restoringId === it.id
                return (
                  <li
                    key={it.id}
                    className={`rounded-xl border px-3 py-2.5 ${isCurrent ? 'border-pink-300 bg-pink-50/60' : 'border-ink-200 hover:border-ink-300'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-semibold text-ink-900">{it.label ?? (it.kind === 'AUTO' ? 'Autosave' : 'Snapshot')}</span>
                          {isCurrent && <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">Current</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500" title={fullStamp(it.createdAt)}>
                          <Clock className="h-3 w-3" /> {relativeTime(it.createdAt)}
                        </div>
                      </div>
                      <KindBadge item={it} />
                    </div>
                    {allowRestore && !isCurrent && (
                      <button
                        type="button"
                        onClick={() => onRestore(it.id)}
                        disabled={restoring || restoringId !== null}
                        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700 disabled:opacity-50"
                      >
                        {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        {restoring ? 'Restoring…' : 'Restore this version'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-ink-100 px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-400">
          <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> {footnote ?? 'Milestones are kept; autosaves roll over after the latest 10.'}</span>
        </footer>
      </aside>
    </div>
  )
}
