'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { cn, Switch } from '@ilaunchify/ui'
import {
  createCannedReply,
  updateCannedReply,
  toggleCannedReplyActive,
  deleteCannedReply,
  type CannedReplyInput,
} from './actions'

export interface CannedReplyRowVM {
  id: string
  title: string
  body: string
  categoryId: string | null
  isActive: boolean
  sortOrder: number
}

type Editing = { mode: 'create' } | { mode: 'edit'; row: CannedReplyRowVM } | null

export function SavedRepliesManager({
  rows,
  categories,
}: {
  rows: CannedReplyRowVM[]
  categories: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, start] = useTransition()
  const router = useRouter()
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? '—' : 'Global')

  function toggle(row: CannedReplyRowVM) {
    setBusyId(row.id)
    start(async () => {
      const r = await toggleCannedReplyActive(row.id)
      setBusyId(null)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(row.isActive ? 'Reply hidden.' : 'Reply activated.')
      router.refresh()
    })
  }

  function remove(row: CannedReplyRowVM) {
    if (!confirm(`Delete saved reply “${row.title}”? This can’t be undone.`)) return
    setBusyId(row.id)
    start(async () => {
      const r = await deleteCannedReply(row.id)
      setBusyId(null)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success('Reply deleted.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing({ mode: 'create' })}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800"
        >
          <Plus className="h-4 w-4" /> New reply
        </button>
      </div>

      {editing && (
        <ReplyForm
          key={editing.mode === 'edit' ? editing.row.id : 'create'}
          editing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center text-[13px] text-ink-600">
          No saved replies yet. Create one to speed up common responses.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <Th>Title</Th>
                <Th>Preview</Th>
                <Th>Scope</Th>
                <Th className="text-right">Order</Th>
                <Th>Active</Th>
                <Th className="w-[90px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.id} className={cn('hover:bg-ink-50/40', !r.isActive && 'opacity-60')}>
                  <td className="px-4 py-3 align-top font-semibold text-ink-900">{r.title}</td>
                  <td className="max-w-[360px] px-4 py-3 align-top text-[11.5px] text-ink-600">
                    <span className="line-clamp-2">{r.body}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={cn('inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', r.categoryId ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-ink-200 bg-ink-50 text-ink-600')}>
                      {catName(r.categoryId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums text-ink-500">{r.sortOrder}</td>
                  <td className="px-4 py-3 align-top">
                    <Switch
                      checked={r.isActive}
                      disabled={busyId === r.id}
                      onChange={() => toggle(r)}
                      aria-label={`${r.isActive ? 'Hide' : 'Activate'} ${r.title}`}
                      className="flex-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing({ mode: 'edit', row: r })}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        disabled={busyId === r.id}
                        aria-label={`Delete ${r.title}`}
                        className="inline-flex items-center rounded-lg border border-ink-200 px-2 py-1 text-ink-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReplyForm({
  editing,
  categories,
  onClose,
  onSaved,
}: {
  editing: { mode: 'create' } | { mode: 'edit'; row: CannedReplyRowVM }
  categories: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const row = editing.mode === 'edit' ? editing.row : null
  const [title, setTitle] = useState(row?.title ?? '')
  const [body, setBody] = useState(row?.body ?? '')
  const [categoryId, setCategoryId] = useState(row?.categoryId ?? '')
  const [sortOrder, setSortOrder] = useState(row?.sortOrder?.toString() ?? '')
  const [pending, start] = useTransition()

  function save() {
    if (title.trim().length < 2) return toast.error('Title is required.')
    if (body.trim().length < 2) return toast.error('Reply body is required.')
    const input: CannedReplyInput = {
      title: title.trim(),
      body: body.trim(),
      categoryId: categoryId || null,
      ...(sortOrder !== '' ? { sortOrder: Number(sortOrder) } : {}),
    }
    start(async () => {
      const r = editing.mode === 'edit'
        ? await updateCannedReply(editing.row.id, input)
        : await createCannedReply(input)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(editing.mode === 'edit' ? 'Reply updated.' : 'Reply created.')
      onSaved()
    })
  }

  return (
    <div className="rounded-2xl border border-pink-200 bg-pink-50/30 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink-900">
          {editing.mode === 'edit' ? `Edit “${editing.row.title}”` : 'New saved reply'}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Asking for order number" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">Reply body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Hi {{name}}, thanks for reaching out…" className={inputCls} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">Scope</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">Global (every ticket)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">Sort order</span>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="auto" className={inputCls} />
          </label>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-ink-200 px-4 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-50">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={pending} className="rounded-full bg-pink-600 px-5 py-1.5 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50">
          {pending ? 'Saving…' : editing.mode === 'edit' ? 'Save changes' : 'Create reply'}
        </button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>{children}</th>
}
