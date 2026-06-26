'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { approvePackagingReview, rejectPackagingReview, type ReviewRow, type ReviewFile } from './actions'

const isImage = (name: string) => /\.(png|jpe?g|webp|gif|avif)$/i.test(name)
const fmtPanel = (p: string | null) => (p ? p[0] + p.slice(1).toLowerCase() : '')

const CATEGORIES = ['BOTTLE', 'JAR', 'CAN', 'TUBE', 'POUCH', 'SACHET', 'STICK_PACK', 'BOX', 'CARTON', 'CASE', 'OTHER']
const CAT_LABEL: Record<string, string> = {
  BOTTLE: 'Bottle', JAR: 'Jar', CAN: 'Can', TUBE: 'Tube', POUCH: 'Pouch', SACHET: 'Sachet',
  STICK_PACK: 'Stick pack', BOX: 'Box', CARTON: 'Carton', CASE: 'Case', OTHER: 'Other',
}

export function ReviewQueue({ initial }: { initial: ReviewRow[] }) {
  const [rows, setRows] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Record<string, { name: string; category: string; notes: string }>>({})

  function edit(id: string, patch: Partial<{ name: string; category: string; notes: string }>) {
    setDraft((d) => ({ ...d, [id]: { name: d[id]?.name ?? '', category: d[id]?.category ?? '', notes: d[id]?.notes ?? '', ...patch } }))
  }

  function approve(r: ReviewRow) {
    const d = draft[r.id] ?? { name: '', category: '', notes: '' }
    const name = d.name || r.name
    const category = d.category || r.suggestedCategory || 'OTHER'
    startTransition(async () => {
      const res = await approvePackagingReview(r.id, name, category)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Published “${name}” to the catalog`)
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    })
  }

  function reject(r: ReviewRow) {
    const notes = draft[r.id]?.notes ?? ''
    startTransition(async () => {
      const res = await rejectPackagingReview(r.id, notes)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Submission rejected')
      setRows((rs) => rs.filter((x) => x.id !== r.id))
    })
  }

  if (rows.length === 0) {
    return <p className="rounded-2xl border border-ink-200 bg-white px-6 py-10 text-center text-sm text-ink-500">No packaging awaiting review.</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const d = draft[r.id]
        return (
          <div key={r.id} className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold text-ink-900">{r.name}</div>
                <div className="text-xs text-ink-500">
                  {r.topology}
                  {r.suggestedCategory ? ` · suggested: ${CAT_LABEL[r.suggestedCategory] ?? r.suggestedCategory}` : ''}
                  {r.submittedAt ? ` · ${new Date(r.submittedAt).toLocaleDateString()}` : ''}
                </div>
              </div>
            </div>

            {/* Parameters supplied by the partner. */}
            {(r.material || r.dimensions || r.maxWeightG != null) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.material && <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600">Material: <b className="font-semibold text-ink-800">{r.material}</b></span>}
                {r.dimensions && (r.dimensions.lengthMm || r.dimensions.widthMm || r.dimensions.heightMm) && (
                  <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600">{r.dimensions.lengthMm ?? '–'} × {r.dimensions.widthMm ?? '–'} × {r.dimensions.heightMm ?? '–'} mm</span>
                )}
                {r.maxWeightG != null && <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600">Max {r.maxWeightG} g</span>}
              </div>
            )}

            {/* Partner-uploaded mockups + die-lines (each die-line panel-tagged). */}
            {r.files.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">Uploaded artwork ({r.files.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {r.files.map((f, i) => <FileTile key={i} f={f} />)}
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium text-ink-600">
                Catalog name
                <input
                  value={d?.name ?? r.name}
                  onChange={(e) => edit(r.id, { name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-pink-500"
                />
              </label>
              <label className="text-xs font-medium text-ink-600">
                Container category
                <select
                  value={d?.category ?? r.suggestedCategory ?? 'OTHER'}
                  onChange={(e) => edit(r.id, { category: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-pink-500"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </label>
            </div>

            <input
              value={d?.notes ?? ''}
              onChange={(e) => edit(r.id, { notes: e.target.value })}
              placeholder="Rejection note (optional)"
              className="mt-2 w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-pink-500"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => approve(r)}
                disabled={pending}
                className="rounded-full bg-pink-600 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
              >
                Approve → publish to catalog
              </button>
              <button
                type="button"
                onClick={() => reject(r)}
                disabled={pending}
                className="rounded-full border border-ink-200 px-4 py-1.5 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// One uploaded artwork tile — image thumbnail for photos/mockups, a doc tile for
// die-lines, with a role/panel chip. Click opens the signed URL in a new tab.
function FileTile({ f }: { f: ReviewFile }) {
  const chip = f.role === 'DIELINE' ? (f.panel ? fmtPanel(f.panel) : 'Die-line') : (f.label || 'Mockup')
  const body = (
    <>
      <div className="relative grid aspect-square place-items-center overflow-hidden bg-ink-50">
        {f.url && isImage(f.name) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.url} alt={f.name} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[11px] font-semibold uppercase text-ink-400">{f.name.split('.').pop() ?? 'file'}</span>
        )}
        <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${f.role === 'DIELINE' ? 'bg-info-100 text-info-700' : 'bg-pink-100 text-pink-700'}`}>{chip}</span>
      </div>
      <div className="truncate px-1.5 py-1 text-[10.5px] text-ink-600" title={f.name}>{f.name}</div>
    </>
  )
  return f.url
    ? <a href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-ink-200 bg-white transition-colors hover:border-pink-300">{body}</a>
    : <div className="block overflow-hidden rounded-xl border border-ink-200 bg-white opacity-70">{body}</div>
}
