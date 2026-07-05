'use client'

// SaveVersionDialog — Phase 1 named versions (docs/DESIGN_STUDIO_VERSIONING.md
// §4.2). Small centered dialog opened by ⌘/Ctrl+S or the top-bar bookmark
// button: name field (pre-filled "Version N — <date>"), Enter saves, Esc
// cancels. The shell owns the actual save (flush autosave → pinned MANUAL
// snapshot with thumbnail); this is chrome only.

import * as React from 'react'
import { Bookmark, Loader2, X } from 'lucide-react'

export function SaveVersionDialog({
  open,
  defaultName,
  saving,
  onSave,
  onClose,
}: {
  open: boolean
  /** Pre-filled suggestion, e.g. "Version 3 — Jul 5". */
  defaultName: string
  saving: boolean
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = React.useState(defaultName)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Re-seed the field each time the dialog opens (the suggested N advances).
  React.useEffect(() => {
    if (open) {
      setName(defaultName)
      // Select-all so typing replaces the suggestion in one keystroke.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [open, defaultName])

  if (!open) return null

  const commit = () => {
    if (saving) return
    onSave(name.trim() || defaultName)
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Save a version"
    >
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <div className="relative w-[420px] max-w-[92vw] rounded-2xl border border-ink-200 bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-50 text-pink-600">
              <Bookmark className="h-3.5 w-3.5" />
            </span>
            <div className="font-display text-[14px] font-semibold text-ink-900">Save a version</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
          Named versions are kept forever — come back to this exact design any time from Version history.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') onClose()
          }}
          placeholder={defaultName}
          className="mt-3 w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-900 outline-none transition-colors focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-ink-600 transition-colors hover:bg-ink-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save version
          </button>
        </div>
      </div>
    </div>
  )
}
