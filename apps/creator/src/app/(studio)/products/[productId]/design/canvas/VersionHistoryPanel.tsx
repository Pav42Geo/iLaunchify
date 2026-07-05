'use client'

// VersionHistoryPanel — right-side dock (same chrome as CompliancePanel) that
// lists EditSnapshot versions of this design. Phase 1 (versioning v2 §4.2):
//   · Named versions (pinned) section on top — rename / unpin via kebab.
//   · Autosaves below, grouped by day.
//   · Hovering any row previews it in the large preview WITHOUT changing the
//     selection; browsing is safe — only Restore touches the live canvas.
//   · An AUTO row can be "Keep & name…"-ed → becomes a permanent named version.
// The top bar's prev/next icons move `selectedId` through the flat list.

import * as React from 'react'
import { X, RotateCcw, Loader2, Pin, PinOff, Bookmark, BookmarkPlus, ImageOff, MoreVertical, Pencil } from 'lucide-react'
import { relativeTime, type SnapshotItem } from '@ilaunchify/ui'

function KindBadge({ item }: { item: SnapshotItem }) {
  if (item.kind === 'MILESTONE')
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning-800">
        <Pin className="h-2.5 w-2.5" /> Milestone
      </span>
    )
  if (item.kind === 'MANUAL')
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-pink-700">
        <Bookmark className="h-2.5 w-2.5" /> Saved
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-full border border-ink-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-400">
      Auto
    </span>
  )
}

function Thumb({ src, className }: { src: string | null | undefined; className: string }) {
  if (!src)
    return (
      <div className={`flex items-center justify-center bg-ink-50 text-ink-300 ${className}`}>
        <ImageOff className="h-4 w-4" />
      </div>
    )
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="version preview" className={`object-contain ${className}`} />
}

/** "Today" / "Yesterday" / "Jul 3" bucket label for the autosave day groups. */
function dayLabel(date: Date, now: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const n = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((n.getTime() - d.getTime()) / 86_400_000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function VersionHistoryPanel({
  open,
  onClose,
  items,
  selectedId,
  onSelect,
  onRestore,
  onUpdateMeta,
  onSaveVersion,
  restoringId,
  currentId,
  scopeLabel,
}: {
  open: boolean
  onClose: () => void
  items: SnapshotItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRestore: (id: string) => void
  /** Rename / pin-toggle a version (Phase 1). Absent = read-only chrome. */
  onUpdateMeta?: (id: string, patch: { label?: string | null; pinned?: boolean }) => void | Promise<void>
  /** Opens the Save-version dialog (also on ⌘S / top-bar bookmark). */
  onSaveVersion?: () => void
  restoringId: string | null
  currentId: string | null
  /** Studio versioning v2 §4.1 — the slot on canvas ("Chocolate · Front label").
   *  Null/absent = single-slot product; no scope line shown. */
  scopeLabel?: string | null
}) {
  // Hover preview: transient — reverts to the selection on mouse-leave.
  const [hoverId, setHoverId] = React.useState<string | null>(null)
  // Kebab + inline rename state.
  const [menuId, setMenuId] = React.useState<string | null>(null)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [draftLabel, setDraftLabel] = React.useState('')

  if (!open) return null

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const previewed = (hoverId && items.find((i) => i.id === hoverId)) || selected
  const currentResolved = currentId ?? items[0]?.id ?? null
  const restoring = restoringId !== null
  const previewedIsCurrent = previewed ? previewed.id === currentResolved : true

  const pinnedItems = items.filter((i) => i.pinned)
  const autoItems = items.filter((i) => !i.pinned)
  const dayGroups: Array<{ day: string; rows: SnapshotItem[] }> = []
  for (const it of autoItems) {
    const day = dayLabel(it.createdAt)
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.day === day) last.rows.push(it)
    else dayGroups.push({ day, rows: [it] })
  }

  const startRename = (it: SnapshotItem) => {
    setMenuId(null)
    setRenamingId(it.id)
    setDraftLabel(it.label ?? '')
  }
  const commitRename = (it: SnapshotItem, keepAndName = false) => {
    const label = draftLabel.trim()
    setRenamingId(null)
    if (!onUpdateMeta) return
    if (keepAndName) void onUpdateMeta(it.id, { label: label || 'Kept version', pinned: true })
    else if (label !== (it.label ?? '')) void onUpdateMeta(it.id, { label: label || null })
  }

  const row = (it: SnapshotItem, opts: { keepable?: boolean } = {}) => {
    const on = previewed?.id === it.id
    const renaming = renamingId === it.id
    return (
      <li key={it.id} className="relative">
        <div
          onMouseEnter={() => setHoverId(it.id)}
          onMouseLeave={() => setHoverId((h) => (h === it.id ? null : h))}
          className={`flex w-full items-center gap-2.5 rounded-lg border p-1.5 transition-colors ${on ? 'border-pink-300 bg-pink-50/60' : 'border-transparent hover:border-ink-200 hover:bg-ink-50'}`}
        >
          <button type="button" onClick={() => onSelect(it.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Thumb src={it.thumbnail} className="h-11 w-11 shrink-0 rounded border border-ink-200 bg-white" />
            <span className="min-w-0 flex-1">
              {renaming ? (
                <input
                  autoFocus
                  type="text"
                  value={draftLabel}
                  maxLength={80}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(it)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => commitRename(it)}
                  className="w-full rounded border border-pink-300 bg-white px-1.5 py-0.5 text-[12px] text-ink-900 outline-none focus:ring-2 focus:ring-pink-100"
                />
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-ink-900">{it.label ?? (it.kind === 'AUTO' ? 'Autosave' : 'Snapshot')}</span>
                  {it.id === currentResolved && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-pink-700">Now</span>}
                </span>
              )}
              <span className="mt-0.5 block text-[10.5px] text-ink-500" title={it.createdAt.toLocaleString()}>{relativeTime(it.createdAt)}</span>
            </span>
          </button>
          <KindBadge item={it} />
          {onUpdateMeta && (
            <button
              type="button"
              onClick={() => setMenuId((m) => (m === it.id ? null : it.id))}
              aria-label="Version actions"
              className="shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Kebab menu */}
        {menuId === it.id && onUpdateMeta && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
            <div className="absolute right-1 top-9 z-50 w-44 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-xl">
              {opts.keepable ? (
                <button
                  type="button"
                  onClick={() => { setMenuId(null); setRenamingId(it.id); setDraftLabel(''); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                >
                  <BookmarkPlus className="h-3.5 w-3.5 text-pink-600" /> Keep &amp; name…
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startRename(it)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuId(null); void onUpdateMeta(it.id, { pinned: false }) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                  >
                    <PinOff className="h-3.5 w-3.5" /> Unpin
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </li>
    )
  }

  return (
    <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-[380px] flex-col border-l border-ink-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <div>
          <div className="font-display text-[14px] font-semibold text-ink-900">
            Version history{scopeLabel ? <span className="font-normal text-ink-500"> — {scopeLabel}</span> : null}
          </div>
          <div className="text-[11px] text-ink-500">{items.length} version{items.length === 1 ? '' : 's'} · named kept forever</div>
        </div>
        <div className="flex items-center gap-1">
          {onSaveVersion && (
            <button
              type="button"
              onClick={onSaveVersion}
              className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700"
              title="Save a named version (⌘S)"
            >
              <BookmarkPlus className="h-3 w-3" /> Save version
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex-1 px-4 py-8 text-center text-[12px] leading-relaxed text-ink-500">
          Versions appear here as you design. Press <span className="font-semibold text-ink-700">⌘S</span> to save a named version you can return to any time.
        </div>
      ) : (
        <>
          {/* Preview — follows hover, falls back to the selection. */}
          <div className="border-b border-ink-200 p-3">
            <div className="relative overflow-hidden rounded-lg border border-ink-200 bg-[conic-gradient(#f1f1f3_90deg,#fafafb_0_180deg,#f1f1f3_0_270deg,#fafafb_0)] bg-[length:16px_16px]">
              <Thumb src={previewed?.thumbnail} className="mx-auto block max-h-[220px] w-full" />
            </div>
            {previewed && (
              <div className="mt-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-ink-900">
                    {previewed.label ?? (previewed.kind === 'AUTO' ? 'Autosave' : 'Snapshot')}
                    {previewed.id === currentResolved && <span className="ml-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">Current</span>}
                  </div>
                  <div className="text-[11px] text-ink-500" title={previewed.createdAt.toLocaleString()}>{relativeTime(previewed.createdAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => previewed && onRestore(previewed.id)}
                  disabled={restoring || previewedIsCurrent}
                  className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
                >
                  {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {previewedIsCurrent ? 'Current version' : 'Restore this version'}
                </button>
              </div>
            )}
          </div>

          {/* Version list — named (pinned) on top, autosaves grouped by day. */}
          <div className="flex-1 overflow-y-auto p-2">
            {pinnedItems.length > 0 && (
              <>
                <div className="px-1.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Named versions</div>
                <ul className="space-y-1">{pinnedItems.map((it) => row(it))}</ul>
              </>
            )}
            {dayGroups.map((g) => (
              <React.Fragment key={g.day}>
                <div className="px-1.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{g.day}</div>
                <ul className="space-y-1">{g.rows.map((it) => row(it, { keepable: true }))}</ul>
              </React.Fragment>
            ))}
          </div>

          <footer className="border-t border-ink-100 px-4 py-2 text-[10px] leading-relaxed text-ink-400">
            Named versions are kept forever; autosaves roll over after the latest 10.
          </footer>
        </>
      )}
    </aside>
  )
}
