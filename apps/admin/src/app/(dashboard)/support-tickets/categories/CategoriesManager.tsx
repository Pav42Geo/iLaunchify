'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, X } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import {
  createTicketCategory,
  updateTicketCategory,
  toggleTicketCategoryActive,
  type CategoryInput,
} from './actions'

export interface CategoryRow {
  id: string
  slug: string
  name: string
  description: string | null
  defaultPriority: string
  slaResponseMinutes: number | null
  slaResolveMinutes: number | null
  defaultAssigneeUserId: string | null
  sortOrder: number
  isActive: boolean
  ticketCount: number
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

const PRIORITY_TONE: Record<string, string> = {
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200',
  HIGH: 'bg-amber-50 text-amber-800 border-amber-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  LOW: 'bg-ink-100 text-ink-600 border-ink-200',
}

type Editing = { mode: 'create' } | { mode: 'edit'; row: CategoryRow } | null

export function CategoriesManager({
  rows,
  admins,
}: {
  rows: CategoryRow[]
  admins: { id: string; label: string }[]
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, start] = useTransition()
  const router = useRouter()

  function toggle(row: CategoryRow) {
    setBusyId(row.id)
    start(async () => {
      const r = await toggleTicketCategoryActive(row.id)
      setBusyId(null)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(row.isActive ? 'Category hidden.' : 'Category activated.')
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
          <Plus className="h-4 w-4" /> New category
        </button>
      </div>

      {editing && (
        <CategoryForm
          key={editing.mode === 'edit' ? editing.row.id : 'create'}
          editing={editing}
          admins={admins}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
            <tr>
              <Th>Category</Th>
              <Th>Priority</Th>
              <Th>SLA (resp / resolve)</Th>
              <Th>Assignee</Th>
              <Th className="text-right">Tickets</Th>
              <Th className="text-right">Order</Th>
              <Th>Active</Th>
              <Th className="w-[60px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((c) => (
              <tr key={c.id} className={cn('hover:bg-ink-50/40', !c.isActive && 'opacity-60')}>
                <td className="px-4 py-3 align-top">
                  <p className="font-semibold text-ink-900">{c.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">{c.slug}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={cn('inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', PRIORITY_TONE[c.defaultPriority] ?? PRIORITY_TONE.MEDIUM)}>
                    {c.defaultPriority.toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-[11.5px] text-ink-600">
                  {fmtMinutes(c.slaResponseMinutes)} / {fmtMinutes(c.slaResolveMinutes)}
                </td>
                <td className="px-4 py-3 align-top text-[11.5px] text-ink-600">
                  {admins.find((a) => a.id === c.defaultAssigneeUserId)?.label ?? <span className="text-ink-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right align-top tabular-nums text-ink-700">{c.ticketCount}</td>
                <td className="px-4 py-3 text-right align-top tabular-nums text-ink-500">{c.sortOrder}</td>
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.isActive}
                    aria-label={`${c.isActive ? 'Hide' : 'Activate'} ${c.name}`}
                    disabled={busyId === c.id}
                    onClick={() => toggle(c)}
                    className={cn(
                      'relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-60',
                      c.isActive ? 'bg-pink-500' : 'bg-ink-300',
                    )}
                  >
                    <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', c.isActive ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                  </button>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <button
                    type="button"
                    onClick={() => setEditing({ mode: 'edit', row: c })}
                    className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryForm({
  editing,
  admins,
  onClose,
  onSaved,
}: {
  editing: { mode: 'create' } | { mode: 'edit'; row: CategoryRow }
  admins: { id: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const row = editing.mode === 'edit' ? editing.row : null
  const [name, setName] = useState(row?.name ?? '')
  const [slug, setSlug] = useState(row?.slug ?? '')
  const [description, setDescription] = useState(row?.description ?? '')
  const [defaultPriority, setDefaultPriority] = useState(row?.defaultPriority ?? 'MEDIUM')
  const [slaResp, setSlaResp] = useState(row?.slaResponseMinutes?.toString() ?? '')
  const [slaResolve, setSlaResolve] = useState(row?.slaResolveMinutes?.toString() ?? '')
  const [assignee, setAssignee] = useState(row?.defaultAssigneeUserId ?? '')
  const [sortOrder, setSortOrder] = useState(row?.sortOrder?.toString() ?? '')
  const [pending, start] = useTransition()

  function save() {
    if (name.trim().length < 2) return toast.error('Name is required.')
    const input: CategoryInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      defaultPriority,
      slaResponseMinutes: slaResp === '' ? null : Number(slaResp),
      slaResolveMinutes: slaResolve === '' ? null : Number(slaResolve),
      defaultAssigneeUserId: assignee || null,
      ...(sortOrder !== '' ? { sortOrder: Number(sortOrder) } : {}),
      ...(editing.mode === 'create' ? { slug: slug.trim() || undefined } : {}),
    }
    start(async () => {
      const r = editing.mode === 'edit'
        ? await updateTicketCategory(editing.row.id, input)
        : await createTicketCategory(input)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(editing.mode === 'edit' ? 'Category updated.' : 'Category created.')
      onSaved()
    })
  }

  return (
    <div className="rounded-2xl border border-pink-200 bg-pink-50/30 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink-900">
          {editing.mode === 'edit' ? `Edit “${editing.row.name}”` : 'New category'}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Order issue" />
        </Field>
        <Field label={editing.mode === 'edit' ? 'Slug (locked)' : 'Slug (optional — derived from name)'}>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={editing.mode === 'edit'}
            className={cn(inputCls, editing.mode === 'edit' && 'bg-ink-50 text-ink-400')}
            placeholder="order-issue"
          />
        </Field>
        <Field label="Description" full>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="What this bucket covers (shown to the filer)." />
        </Field>
        <Field label="Default priority">
          <select value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)} className={inputCls}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </Field>
        <Field label="Default assignee (optional)">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
            <option value="">Unassigned (fan out to all admins)</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="SLA first-response (minutes — blank = priority default)">
          <input type="number" min={1} value={slaResp} onChange={(e) => setSlaResp(e.target.value)} className={inputCls} placeholder="e.g. 240" />
        </Field>
        <Field label="SLA resolve (minutes — optional)">
          <input type="number" min={1} value={slaResolve} onChange={(e) => setSlaResolve(e.target.value)} className={inputCls} placeholder="e.g. 1440" />
        </Field>
        <Field label="Sort order">
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={inputCls} placeholder="auto" />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-ink-200 px-4 py-1.5 text-[13px] font-semibold text-ink-700 hover:bg-ink-50">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={pending} className="rounded-full bg-pink-600 px-5 py-1.5 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50">
          {pending ? 'Saving…' : editing.mode === 'edit' ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('block', full && 'sm:col-span-2')}>
      <span className="mb-1 block text-[11.5px] font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>{children}</th>
}

function fmtMinutes(m: number | null): string {
  if (m == null) return '—'
  if (m % 1440 === 0) return `${m / 1440}d`
  if (m % 60 === 0) return `${m / 60}h`
  return `${m}m`
}
