'use client'

// Die-cut Templates — Library client. Category filter + search + create form + card grid.
// Each card renders a thumbnail from the shape's outlineSvg and shows usage counts. Mirrors
// the Packaging Studio model-library UX, repointed at DieCutTemplate. Create + active/standard
// toggles are the P1 scope; full edit / replace-outline is a follow-up.

import * as React from 'react'
import { Shapes, Search, Plus, Loader2, Check } from 'lucide-react'
import { createDieCutTemplate, setDieCutTemplateActive, setDieCutTemplateStandard } from './actions'
import { DIE_CUT_CATEGORY_GROUPS, DIE_CUT_CATEGORIES, prettyCategory } from './constants'
import type { DieCutLibraryData, DieCutRow } from './loader'

// Outline-style thumbnail: force every shape to render stroked, not filled, regardless of how
// the stored outlineSvg specifies fill (the seeds store filled <rect>/<ellipse>/… with no fill
// attr, which would otherwise paint solid black). CSS beats presentation attributes, and
// non-scaling-stroke keeps the line a constant pixel width across very different viewBox sizes.
const OUTLINE = 'text-ink-600 [&_svg]:h-full [&_svg]:w-full [&_*]:!fill-none [&_*]:stroke-current [&_*]:[stroke-width:1.5] [&_*]:[vector-effect:non-scaling-stroke]'

function ShapePreview({ svg, w, h }: { svg: string; w: number; h: number }) {
  const s = (svg ?? '').trim()
  if (s.startsWith('<svg')) {
    return <div className={`flex h-full w-full items-center justify-center ${OUTLINE}`} dangerouslySetInnerHTML={{ __html: s }} />
  }
  const inner = s.startsWith('<') ? s : `<path d="${s.replace(/"/g, '&quot;')}" />`
  return (
    <svg
      viewBox={`0 0 ${w > 0 ? w : 100} ${h > 0 ? h : 100}`}
      className={OUTLINE}
      preserveAspectRatio="xMidYMid meet"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}

export function DieCutTemplatesClient({ data }: { data: DieCutLibraryData }) {
  const [rows, setRows] = React.useState<DieCutRow[]>(data.rows)
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('ALL')
  const [creating, setCreating] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ name: '', category: 'BOTTLE_WRAP', widthMm: '', heightMm: '', outlineSvg: '' })

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (category !== 'ALL' && r.category !== category) return false
      if (q && !r.name.toLowerCase().includes(q) && !prettyCategory(r.category).toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, query, category])

  async function submitCreate() {
    if (!form.name.trim()) { setMsg('Name is required.'); return }
    setBusy(true); setMsg(null)
    const res = await createDieCutTemplate({
      name: form.name,
      category: form.category,
      widthMm: Number(form.widthMm),
      heightMm: Number(form.heightMm),
      outlineSvg: form.outlineSvg,
    }).catch(() => null)
    setBusy(false)
    if (res && res.ok) {
      setRows((prev) => [
        {
          id: res.id ?? Math.random().toString(36).slice(2),
          name: form.name.trim(), slug: '', category: form.category,
          widthMm: Number(form.widthMm) || 0, heightMm: Number(form.heightMm) || 0,
          outlineSvg: form.outlineSvg.trim(), bleedMm: 3, safeAreaMm: 3,
          isStandard: true, isActive: true,
          usage: { templates: 0, dielines: 0, containers: 0 },
        },
        ...prev,
      ])
      setForm({ name: '', category: form.category, widthMm: '', heightMm: '', outlineSvg: '' })
      setCreating(false)
    } else {
      setMsg((res && !res.ok && res.error) || 'Could not create the template.')
    }
  }

  async function toggleActive(r: DieCutRow) {
    const next = !r.isActive
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: next } : x)))
    const res = await setDieCutTemplateActive(r.id, next).catch(() => null)
    if (!res || !res.ok) setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)))
  }

  async function toggleStandard(r: DieCutRow) {
    const next = !r.isStandard
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isStandard: next } : x)))
    const res = await setDieCutTemplateStandard(r.id, next).catch(() => null)
    if (!res || !res.ok) setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, isStandard: r.isStandard } : x)))
  }

  const kpis: { label: string; value: number }[] = [
    { label: 'Templates', value: data.stats.total },
    { label: 'Active', value: data.stats.active },
    { label: 'Standard', value: data.stats.standard },
    { label: 'Categories', value: data.stats.categories },
    { label: 'In use', value: data.stats.inUse },
  ]

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-ink-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shapes…"
            className="h-10 w-64 rounded-full border border-ink-200 bg-white pl-9 pr-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-full border border-ink-200 bg-white px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          <option value="ALL">All categories</option>
          {DIE_CUT_CATEGORY_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.values.map((v) => <option key={v} value={v}>{prettyCategory(v)}</option>)}
            </optgroup>
          ))}
        </select>
        <button
          onClick={() => { setCreating((v) => !v); setMsg(null) }}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-ink-900 px-5 text-[14px] font-medium text-white hover:bg-black"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-ink-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[13px]">
              <span className="mb-1 block font-medium text-ink-700">Name</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-10 w-full rounded-lg border border-ink-200 px-3 outline-none focus-visible:ring-2 focus-visible:ring-pink-500" />
            </label>
            <label className="text-[13px]">
              <span className="mb-1 block font-medium text-ink-700">Category</span>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="h-10 w-full rounded-lg border border-ink-200 px-3 outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
                {DIE_CUT_CATEGORY_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.values.map((v) => <option key={v} value={v}>{prettyCategory(v)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-[13px]">
              <span className="mb-1 block font-medium text-ink-700">Width (mm)</span>
              <input type="number" min={0} value={form.widthMm} onChange={(e) => setForm((f) => ({ ...f, widthMm: e.target.value }))}
                className="h-10 w-full rounded-lg border border-ink-200 px-3 outline-none focus-visible:ring-2 focus-visible:ring-pink-500" />
            </label>
            <label className="text-[13px]">
              <span className="mb-1 block font-medium text-ink-700">Height (mm)</span>
              <input type="number" min={0} value={form.heightMm} onChange={(e) => setForm((f) => ({ ...f, heightMm: e.target.value }))}
                className="h-10 w-full rounded-lg border border-ink-200 px-3 outline-none focus-visible:ring-2 focus-visible:ring-pink-500" />
            </label>
            <label className="text-[13px] sm:col-span-2">
              <span className="mb-1 block font-medium text-ink-700">Outline (SVG path <code>d</code> or full <code>&lt;svg&gt;</code>)</span>
              <textarea value={form.outlineSvg} onChange={(e) => setForm((f) => ({ ...f, outlineSvg: e.target.value }))}
                rows={3} placeholder="M0 0 H100 V60 H0 Z"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-pink-500" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={submitCreate} disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-pink-600 px-5 text-[14px] font-medium text-white hover:bg-pink-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create
            </button>
            <button onClick={() => { setCreating(false); setMsg(null) }} className="text-[14px] text-ink-500 hover:text-ink-900">Cancel</button>
            {msg && <span className="text-[13px] text-pink-700">{msg}</span>}
          </div>
        </div>
      )}

      {/* Grid */}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-200 bg-white p-8 text-center text-[14px] text-ink-500">
          No die-cut templates{category !== 'ALL' ? ` in ${prettyCategory(category)}` : ''} yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((r) => {
            const used = r.usage.templates + r.usage.dielines + r.usage.containers
            return (
              <div key={r.id} className={`rounded-2xl border bg-white p-4 ${r.isActive ? 'border-ink-200' : 'border-ink-200 opacity-60'}`}>
                <div className="mb-3 flex h-28 items-center justify-center rounded-xl border border-ink-100 bg-ink-50 p-3">
                  <ShapePreview svg={r.outlineSvg} w={r.widthMm} h={r.heightMm} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink-900" title={r.name}>{r.name}</p>
                    <p className="text-[12px] text-ink-500">{prettyCategory(r.category)}</p>
                  </div>
                  <Shapes className="h-4 w-4 shrink-0 text-ink-300" />
                </div>
                <p className="mt-1 text-[12px] text-ink-500">
                  {r.widthMm}×{r.heightMm} mm · bleed {r.bleedMm} · safe {r.safeAreaMm}
                </p>
                <p className="mt-1 text-[12px] text-ink-500">
                  {used === 0 ? 'Not used yet' : `${r.usage.templates} templates · ${r.usage.dielines} die-lines · ${r.usage.containers} containers`}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => toggleActive(r)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium ${r.isActive ? 'bg-[#B5FF3D]/30 text-ink-900' : 'bg-ink-100 text-ink-500'}`}>
                    {r.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => toggleStandard(r)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium ${r.isStandard ? 'bg-ink-900 text-white' : 'border border-ink-200 text-ink-600'}`}>
                    {r.isStandard ? 'Standard' : 'Custom'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[12px] text-ink-400">
        {DIE_CUT_CATEGORIES.length} categories in the die-cut taxonomy. Container defaults are assigned in
        {' '}Container Die-lines; full edit / replace-outline is a follow-up.
      </p>
    </div>
  )
}
