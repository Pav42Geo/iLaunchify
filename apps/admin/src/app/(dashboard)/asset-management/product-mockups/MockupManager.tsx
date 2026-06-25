'use client'

// Per-PackagingType mockup manager (docs/MOCKUP_STRATEGY.md, Slice 1).
// Upload a white-label photo, drag the print area, flip DRAFT→ACTIVE, delete.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { PrintAreaEditor } from './PrintAreaEditor'
import { uploadMockupTemplate, setMockupStatus, deleteMockupTemplate } from './actions'

export interface MockupRow {
  id: string
  label: string
  surfaceKey: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  imageUrl: string | null
  printAreaQuad: unknown
}
export interface PackagingTypeGroup {
  id: string
  displayName: string
  mockups: MockupRow[]
}

const SURFACES = ['', 'front', 'back', 'wrap', 'lid', 'side']
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-ink-100 text-ink-600',
  ACTIVE: 'bg-success-50 text-success-600',
  ARCHIVED: 'bg-ink-50 text-ink-400',
}

export function MockupManager({ group }: { group: PackagingTypeGroup }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const [surfaceKey, setSurfaceKey] = useState('')

  function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Choose an image first'); return }
    if (!label.trim()) { toast.error('Add a label'); return }
    const fd = new FormData()
    fd.set('packagingTypeId', group.id)
    fd.set('label', label.trim())
    fd.set('surfaceKey', surfaceKey)
    fd.set('file', file)
    start(async () => {
      const res = await uploadMockupTemplate(fd)
      if (res.ok) {
        toast.success('Mockup uploaded')
        setLabel(''); setSurfaceKey(''); if (fileRef.current) fileRef.current.value = ''
        setOpen(false); router.refresh()
      } else toast.error(res.error)
    })
  }
  function changeStatus(id: string, status: (typeof STATUSES)[number]) {
    start(async () => {
      const res = await setMockupStatus(id, status)
      if (res.ok) router.refresh()
      else toast.error(res.error)
    })
  }
  function remove(id: string, lbl: string) {
    if (!confirm(`Delete mockup “${lbl}”? The uploaded image stays in the library.`)) return
    start(async () => {
      const res = await deleteMockupTemplate(id)
      if (res.ok) { toast.success('Deleted'); router.refresh() }
      else toast.error(res.error)
    })
  }

  return (
    <section className="rounded-3xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2 rounded-t-3xl border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
        <h3 className="font-display text-[15px] font-semibold text-ink-900">{group.displayName}</h3>
        <span className="text-[11.5px] text-ink-500">{group.mockups.length} mockup{group.mockups.length === 1 ? '' : 's'}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-ink-300 px-3 py-1 text-[12px] font-semibold text-ink-700 hover:border-ink-500"
        >
          <Plus className="h-3.5 w-3.5" /> Add mockup
        </button>
      </div>

      <div className="space-y-5 p-5">
        {open && (
          <div className="rounded-2xl border border-dashed border-ink-300 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-800">Label</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="16 oz jar — front"
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-ink-800">Surface</span>
                <select
                  value={surfaceKey}
                  onChange={(e) => setSurfaceKey(e.target.value)}
                  className="w-full rounded-lg border border-ink-200 px-2 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                >
                  {SURFACES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="text-[12px]" />
              <button
                type="button"
                onClick={upload}
                disabled={pending}
                className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
              >
                {pending ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">PNG/JPG/WEBP, max 8 MB. Use a clean white-label product photo.</p>
          </div>
        )}

        {group.mockups.length === 0 && !open && (
          <p className="text-[13px] italic text-ink-400">No mockups yet — add a white-label photo to enable design previews for products on this container.</p>
        )}

        {group.mockups.map((m) => (
          <div key={m.id} className="rounded-2xl border border-ink-100 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink-900">{m.label}</span>
              {m.surfaceKey && <span className="text-[11px] text-ink-400">· {m.surfaceKey}</span>}
              <span className={'ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ' + (STATUS_STYLE[m.status] ?? '')}>{m.status}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {STATUSES.filter((s) => s !== m.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeStatus(m.id, s)}
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-600 hover:border-ink-400"
                  >
                    {s === 'ACTIVE' ? 'Activate' : s === 'ARCHIVED' ? 'Archive' : 'To draft'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => remove(m.id, m.label)}
                  aria-label="Delete mockup"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 text-ink-500 hover:border-pink-300 hover:text-pink-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {m.imageUrl ? (
              <PrintAreaEditor mockupId={m.id} imageUrl={m.imageUrl} initial={m.printAreaQuad} />
            ) : (
              <p className="text-[12px] italic text-ink-400">Base image has no public URL — re-upload.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
