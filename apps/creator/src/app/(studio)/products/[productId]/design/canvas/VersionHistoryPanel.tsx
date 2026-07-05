'use client'

// VersionHistoryPanel — right-side dock (same chrome as CompliancePanel) that
// lists EditSnapshot versions of this design with a visual thumbnail preview +
// restore. The top bar's prev/next icons move `selectedId` through the list; the
// panel shows the selected version's preview; "Restore this version" commits it.
// Restore is the only thing that touches the live canvas — browsing is safe.

import * as React from 'react'
import { X, RotateCcw, Loader2, Pin, Bookmark, ImageOff } from 'lucide-react'
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

export function VersionHistoryPanel({
  open,
  onClose,
  items,
  selectedId,
  onSelect,
  onRestore,
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
  restoringId: string | null
  currentId: string | null
  /** Studio versioning v2 §4.1 — the slot on canvas ("Chocolate · Front label").
   *  Null/absent = single-slot product; no scope line shown. */
  scopeLabel?: string | null
}) {
  if (!open) return null
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null
  const currentResolved = currentId ?? items[0]?.id ?? null
  const restoring = restoringId !== null
  const selectedIsCurrent = selected ? selected.id === currentResolved : true

  return (
    <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-[380px] flex-col border-l border-ink-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <div>
          <div className="font-display text-[14px] font-semibold text-ink-900">
            Version history{scopeLabel ? <span className="font-normal text-ink-500"> — {scopeLabel}</span> : null}
          </div>
          <div className="text-[11px] text-ink-500">{items.length} version{items.length === 1 ? '' : 's'} · last 10 + milestones</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
          <X className="h-4 w-4" />
        </button>
      </header>

      {items.length === 0 ? (
        <div className="flex-1 px-4 py-8 text-center text-[12px] leading-relaxed text-ink-500">
          Versions appear here as you design — and at each milestone (export, restore).
        </div>
      ) : (
        <>
          {/* Selected preview */}
          <div className="border-b border-ink-200 p-3">
            <div className="relative overflow-hidden rounded-lg border border-ink-200 bg-[conic-gradient(#f1f1f3_90deg,#fafafb_0_180deg,#f1f1f3_0_270deg,#fafafb_0)] bg-[length:16px_16px]">
              <Thumb src={selected?.thumbnail} className="mx-auto block max-h-[220px] w-full" />
            </div>
            {selected && (
              <div className="mt-2 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-ink-900">
                    {selected.label ?? (selected.kind === 'AUTO' ? 'Autosave' : 'Snapshot')}
                    {selected.id === currentResolved && <span className="ml-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">Current</span>}
                  </div>
                  <div className="text-[11px] text-ink-500" title={selected.createdAt.toLocaleString()}>{relativeTime(selected.createdAt)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => selected && onRestore(selected.id)}
                  disabled={restoring || selectedIsCurrent}
                  className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
                >
                  {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {selectedIsCurrent ? 'Current version' : 'Restore this version'}
                </button>
              </div>
            )}
          </div>

          {/* Version list */}
          <div className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              {items.map((it) => {
                const on = selected?.id === it.id
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(it.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors ${on ? 'border-pink-300 bg-pink-50/60' : 'border-transparent hover:border-ink-200 hover:bg-ink-50'}`}
                    >
                      <Thumb src={it.thumbnail} className="h-11 w-11 shrink-0 rounded border border-ink-200 bg-white" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-medium text-ink-900">{it.label ?? (it.kind === 'AUTO' ? 'Autosave' : 'Snapshot')}</span>
                          {it.id === currentResolved && <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-pink-700">Now</span>}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] text-ink-500">{relativeTime(it.createdAt)}</span>
                      </span>
                      <KindBadge item={it} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <footer className="border-t border-ink-100 px-4 py-2 text-[10px] leading-relaxed text-ink-400">
            Milestones are kept; autosaves roll over after the latest 10.
          </footer>
        </>
      )}
    </aside>
  )
}
