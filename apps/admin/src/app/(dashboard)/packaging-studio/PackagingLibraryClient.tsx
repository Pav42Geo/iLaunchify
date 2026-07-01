'use client'

// Admin Packaging Studio — model library client (P1). KPI strip + category filter +
// create form + model grid. Each card shows 3D-source, surface + die-line counts, and
// status. "Author 3D surfaces" is the P2 seam (disabled until the canvas ships).

import * as React from 'react'
import { Box, Boxes, Layers, Search, Plus, Loader2, Cuboid, PencilRuler } from 'lucide-react'
import { createPackagingModel, setPackagingModelStatus } from './actions'
import type { PackagingLibraryData, PackagingModelRow } from './loader'

const TOPOLOGIES: { value: string; label: string }[] = [
  { value: 'SINGLE_CONTAINER', label: 'Single container' },
  { value: 'CAPSULE_JAR', label: 'Capsule jar' },
  { value: 'POUCH_STAND_UP', label: 'Stand-up pouch' },
  { value: 'POUCH_FLAT', label: 'Flat pouch' },
  { value: 'TUBE', label: 'Tube' },
  { value: 'STICK_PACK', label: 'Stick pack' },
  { value: 'SACHET', label: 'Sachet' },
  { value: 'MULTI_CONTAINER_BOX', label: 'Multi-container box' },
  { value: 'CASE', label: 'Case / shipper' },
  { value: 'OTHER', label: 'Other' },
]
const CATEGORIES = ['BOTTLE', 'JAR', 'CAN', 'TUBE', 'POUCH', 'SACHET', 'STICK_PACK', 'BOX', 'CARTON', 'CASE', 'BAG', 'TUB', 'CUP', 'TIN', 'JUG', 'TRAY', 'SLEEVE', 'OTHER']

const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export function PackagingLibraryClient({ data }: { data: PackagingLibraryData }) {
  const [models, setModels] = React.useState<PackagingModelRow[]>(data.models)
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('ALL')
  const [creating, setCreating] = React.useState(false)
  const [form, setForm] = React.useState({ displayName: '', topology: 'SINGLE_CONTAINER', containerCategory: '' })
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter((m) => {
      if (category !== 'ALL' && m.containerCategory !== category) return false
      if (q && !m.displayName.toLowerCase().includes(q)) return false
      return true
    })
  }, [models, query, category])

  async function submitCreate() {
    if (!form.displayName.trim()) return
    setBusy(true)
    setMsg(null)
    const res = await createPackagingModel({
      displayName: form.displayName,
      topology: form.topology,
      containerCategory: form.containerCategory || undefined,
    }).catch(() => null)
    setBusy(false)
    if (res && res.ok) {
      setModels((prev) => [
        {
          id: res.id ?? Math.random().toString(36),
          displayName: form.displayName.trim(),
          slug: '',
          containerCategory: form.containerCategory || null,
          topology: form.topology,
          model3dSource: 'PARAMETRIC',
          has3dModel: false,
          surfaceCount: 0,
          boundSurfaceCount: 0,
          dielineCount: 0,
          status: 'ACTIVE',
        },
        ...prev,
      ])
      setForm({ displayName: '', topology: 'SINGLE_CONTAINER', containerCategory: '' })
      setCreating(false)
    } else {
      setMsg(res && !res.ok ? res.error : 'Could not create the model.')
    }
  }

  async function toggleStatus(m: PackagingModelRow) {
    const next = m.status === 'ACTIVE' ? 'DEPRECATED' : 'ACTIVE'
    setModels((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: next } : x)))
    const res = await setPackagingModelStatus(m.id, next).catch(() => null)
    if (!res || !res.ok) setModels((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: m.status } : x)))
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Models" value={data.kpis.total} icon={<Box className="h-4 w-4" />} />
        <Kpi label="With 3D model" value={data.kpis.with3d} icon={<Cuboid className="h-4 w-4" />} />
        <Kpi label="Surfaces" value={data.kpis.surfaces} icon={<Layers className="h-4 w-4" />} />
        <Kpi label="Die-lines" value={data.kpis.dielines} icon={<PencilRuler className="h-4 w-4" />} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700">
          <option value="ALL">All categories</option>
          {(data.categories.length ? data.categories : CATEGORIES).map((c) => (
            <option key={c} value={c}>
              {pretty(c)}
            </option>
          ))}
        </select>
        <div className="relative min-w-[200px] flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="w-full rounded-full border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          />
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-800"
        >
          <Plus className="h-4 w-4" /> New model
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px_auto]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-500">Name</span>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="e.g. Wide-mouth jar — 16oz"
                className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px]"
              />
            </label>
            <Select label="Topology" value={form.topology} options={TOPOLOGIES} onChange={(v) => setForm({ ...form, topology: v })} />
            <Select
              label="Category"
              value={form.containerCategory}
              options={[{ value: '', label: '—' }, ...CATEGORIES.map((c) => ({ value: c, label: pretty(c) }))]}
              onChange={(v) => setForm({ ...form, containerCategory: v })}
            />
            <div className="flex items-end">
              <button
                onClick={submitCreate}
                disabled={busy || !form.displayName.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
              </button>
            </div>
          </div>
          {msg && <p className="mt-2 text-[12px] text-warning-700">{msg}</p>}
        </div>
      )}

      {/* Grid */}
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-10 text-center text-[13px] text-ink-500">
          No packaging models yet. Create one to start building its 3D surfaces + die-lines.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => (
            <div key={m.id} className={`rounded-2xl border bg-white p-3 ${m.status === 'ACTIVE' ? 'border-ink-200' : 'border-ink-200 opacity-60'}`}>
              <div className="mb-2 flex aspect-[16/9] items-center justify-center rounded-xl bg-ink-50">
                <Boxes className="h-8 w-8 text-ink-300" />
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink-900">{m.displayName}</p>
                  <p className="truncate text-[11px] text-ink-400">
                    {m.containerCategory ? pretty(m.containerCategory) : 'Uncategorized'} · {pretty(m.topology)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.has3dModel ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-500'}`}>
                  {m.has3dModel ? '3D model' : 'Parametric'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-ink-500">
                <Chip>{m.surfaceCount} surface{m.surfaceCount === 1 ? '' : 's'}</Chip>
                <Chip>{m.boundSurfaceCount}/{m.surfaceCount} bound</Chip>
                <Chip>{m.dielineCount} die-line{m.dielineCount === 1 ? '' : 's'}</Chip>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <a
                  href={`/go/packaging-studio?packagingTypeId=${encodeURIComponent(m.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Author this model's clickable surfaces + bind die-lines"
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-ink-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:border-ink-400"
                >
                  <Cuboid className="h-3.5 w-3.5" /> Author surfaces
                </a>
                <button
                  onClick={() => toggleStatus(m)}
                  className="rounded-full border border-ink-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-600 hover:border-ink-400"
                >
                  {m.status === 'ACTIVE' ? 'Deprecate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-ink-400">{icon}<span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span></div>
      <p className="mt-1 text-[22px] font-bold tabular-nums text-ink-900">{value}</p>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-ink-100 px-2 py-0.5">{children}</span>
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[13px] text-ink-900">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
