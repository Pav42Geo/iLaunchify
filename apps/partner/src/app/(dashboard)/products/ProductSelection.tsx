'use client'

// Bulk-select layer for the /products table. A client SelectionProvider wraps the
// (server-rendered) table; per-row checkboxes + a select-all checkbox register
// into shared context, and a floating BulkActionsBar appears when ≥1 row is
// selected. Discard runs deleteDraft on the selected DRAFT/NEEDS_CHANGES rows.

import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, X } from 'lucide-react'
import { Checkbox } from '@ilaunchify/ui'
import { deleteDraft } from './actions'

interface RowMeta { id: string; name: string; status: string }
interface SelCtx {
  selected: Set<string>
  toggle: (id: string) => void
  toggleAll: () => void
  clear: () => void
  allIds: string[]
  rows: RowMeta[]
}
const Ctx = createContext<SelCtx | null>(null)
const useSel = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('SelectionProvider missing')
  return c
}

const DRAFTISH = new Set(['DRAFT', 'NEEDS_CHANGES'])

export function SelectionProvider({ allIds, rows, children }: { allIds: string[]; rows: RowMeta[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const value = useMemo<SelCtx>(() => ({
    selected, allIds, rows,
    toggle: (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }),
    toggleAll: () => setSelected((s) => (s.size === allIds.length ? new Set() : new Set(allIds))),
    clear: () => setSelected(new Set()),
  }), [selected, allIds, rows])
  return <Ctx.Provider value={value}>{children}<BulkActionsBar /></Ctx.Provider>
}

export function SelectAllCheckbox() {
  const { selected, allIds, toggleAll } = useSel()
  const all = allIds.length > 0 && selected.size === allIds.length
  const some = selected.size > 0 && !all
  return (
    <Checkbox
      aria-label="Select all"
      checked={all}
      ref={(el) => { if (el) el.indeterminate = some }}
      onChange={toggleAll}
      className="cursor-pointer"
    />
  )
}

export function RowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSel()
  return (
    <Checkbox
      aria-label="Select row"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      onClick={(e) => e.stopPropagation()}
      className="cursor-pointer"
    />
  )
}

function BulkActionsBar() {
  const { selected, rows, clear } = useSel()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (selected.size === 0) return null

  const selectedRows = rows.filter((r) => selected.has(r.id))
  const draftIds = selectedRows.filter((r) => DRAFTISH.has(r.status)).map((r) => r.id)

  function discard() {
    if (draftIds.length === 0) { toast.error('Only drafts can be discarded — none selected.'); return }
    if (!window.confirm(`Discard ${draftIds.length} draft${draftIds.length === 1 ? '' : 's'}? This permanently deletes them and can’t be undone.`)) return
    startTransition(async () => {
      const results = await Promise.all(draftIds.map((id) => deleteDraft(id)))
      const ok = results.filter((r) => r.ok).length
      const failed = results.length - ok
      if (ok) toast.success(`${ok} draft${ok === 1 ? '' : 's'} discarded${failed ? ` · ${failed} failed` : ''}`)
      else toast.error('Could not discard the selected drafts.')
      clear()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-ink-200 bg-white px-4 py-2 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35)]">
        <span className="text-[12.5px] font-medium text-ink-700">{selected.size} selected</span>
        <span className="h-4 w-px bg-ink-200" />
        <button
          type="button"
          onClick={discard}
          disabled={pending || draftIds.length === 0}
          title={draftIds.length === 0 ? 'No drafts in selection' : `Discard ${draftIds.length} draft(s)`}
          className="inline-flex items-center gap-1.5 rounded-full bg-danger-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-danger-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Discard{draftIds.length ? ` (${draftIds.length})` : ''}
        </button>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[12px] text-ink-500 hover:text-ink-900">
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>
  )
}
