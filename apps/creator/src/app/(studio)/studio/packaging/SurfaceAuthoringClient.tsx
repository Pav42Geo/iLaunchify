'use client'

// Admin Packaging Studio — surface authoring client (P2 Slice A).
// Define a packaging model's clickable SURFACES (label, role, part, bleed, decorable)
// and bind each to a die-line, then save to PackagingType.defaultSurfaces. The three.js
// canvas that draws the hotspot borders on the 3D model is the next slice; this editor
// already authors everything the surface JSON carries (incl. the die-line binding).

import * as React from 'react'
import { Plus, Trash2, Save, Loader2, Check, Cuboid, Link2, Crosshair, ArrowLeft, PencilRuler } from 'lucide-react'
import { DielineFrameEditor, DEFAULT_FRAME_LAYOUT, type PackagingSurface, type SurfaceRole, type SurfacePurpose } from '@ilaunchify/ui'
import { savePackagingSurfaces, getDielineEditorData, saveDielineFrames, type DielineEditorData } from './actions'
import type { PackagingAuthoringData, BindableDieline } from './loader'
import { Packaging3DView } from './Packaging3DView'

const ROLES: SurfaceRole[] = ['CONTAINER', 'CLOSURE', 'WRAP', 'PANEL', 'OTHER']
const PURPOSES: SurfacePurpose[] = ['pdp', 'info', 'other']
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

function blankSurface(i: number): PackagingSurface {
  return { key: `surface-${i + 1}-${Date.now().toString(36)}`, label: `Surface ${i + 1}`, role: 'CONTAINER', surfacePurpose: 'pdp', decorable: true, defaultBleedMm: 3, dielineIds: [], sortOrder: i }
}

export function SurfaceAuthoringClient({ data }: { data: PackagingAuthoringData }) {
  const [surfaces, setSurfaces] = React.useState<PackagingSurface[]>(data.surfaces)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(data.surfaces[0]?.key ?? null)
  const [placeMode, setPlaceMode] = React.useState(false)
  // Inline 2D die-line editor (click a bound surface's die-line → opens "in place").
  const [editing, setEditing] = React.useState<{ id: string; label: string; data: DielineEditorData } | null>(null)
  const [loadingDieline, setLoadingDieline] = React.useState<string | null>(null)

  const dielineLabel = React.useMemo(() => new Map(data.dielines.map((d) => [d.id, d.label])), [data.dielines])

  async function openDieline(dielineId: string) {
    setLoadingDieline(dielineId)
    const d = await getDielineEditorData(dielineId).catch(() => null)
    setLoadingDieline(null)
    if (d) setEditing({ id: dielineId, label: dielineLabel.get(dielineId) ?? 'Die-line', data: d })
  }

  function update(i: number, patch: Partial<PackagingSurface>) {
    setSurfaces((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
    setSaved(false)
  }
  function add() {
    setSurfaces((prev) => [...prev, blankSurface(prev.length)])
    setSaved(false)
  }
  function remove(i: number) {
    setSurfaces((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, sortOrder: idx })))
    setSaved(false)
  }
  function setAnchor(key: string, anchor: { x: number; y: number; z: number }) {
    setSurfaces((prev) => prev.map((s) => (s.key === key ? { ...s, hotspot: { ...s.hotspot, anchor } } : s)))
    setSaved(false)
  }
  function toggleBinding(i: number, dielineId: string) {
    setSurfaces((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, dielineIds: s.dielineIds.includes(dielineId) ? s.dielineIds.filter((x) => x !== dielineId) : [...s.dielineIds, dielineId] } : s)),
    )
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setErr(null)
    const res = await savePackagingSurfaces(data.id, surfaces.map((s, i) => ({ ...s, sortOrder: i }))).catch(() => null)
    setSaving(false)
    if (res && res.ok) setSaved(true)
    else setErr(res && !res.ok ? res.error : 'Could not save.')
  }

  // Inline 2D die-line editor — opens "in the same place" (full view) for the surface's die-line.
  if (editing) {
    const ed = editing
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <DielineFrameEditor
          initialLayout={structuredClone(ed.data.frames ?? DEFAULT_FRAME_LAYOUT)}
          initialTrim={ed.data.trim}
          initialSafe={ed.data.safe}
          backdrop={{ fileUrl: ed.data.backdropUrl, isPdf: false }}
          onPersist={async ({ layout, trim, safe }) => {
            const res = await saveDielineFrames(ed.id, { layout, trim, safe }).catch(() => null)
            return res && res.ok ? { ok: true } : { ok: false, error: (res && !res.ok && res.error) || 'Could not save.' }
          }}
          topBarLeft={
            <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:border-ink-400">
              <ArrowLeft className="h-4 w-4" /> Back to surfaces
              <span className="ml-1 text-ink-400">· {ed.label}</span>
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[20px] text-ink-900">{data.displayName}</h1>
          <p className="text-[12px] text-ink-500">
            {data.containerCategory ? pretty(data.containerCategory) : 'Uncategorized'} · {pretty(data.topology)} ·{' '}
            {data.has3dModel ? '3D model imported' : 'Parametric'}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved' : 'Save surfaces'}
        </button>
      </div>
      {err && <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">{err}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* Live 3D model + clickable surface markers */}
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
              <Cuboid className="h-3.5 w-3.5" /> 3D model
            </p>
            <button
              onClick={() => setPlaceMode((v) => !v)}
              disabled={!selectedKey}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${placeMode ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 text-ink-600 hover:border-ink-400'}`}
              title="Click the model to position the selected surface's clickable marker"
            >
              <Crosshair className="h-3.5 w-3.5" /> {placeMode ? 'Placing…' : 'Place marker'}
            </button>
          </div>
          <Packaging3DView
            topology={data.topology}
            surfaces={surfaces}
            selectedKey={selectedKey}
            onSelect={(k) => setSelectedKey(k)}
            placeMode={placeMode}
            onPlaceAnchor={(k, a) => {
              setAnchor(k, a)
              setPlaceMode(false)
            }}
          />
          <p className="mt-2 text-[11px] text-ink-500">
            Drag to rotate · scroll to zoom · click a marker to select. {surfaces.filter((s) => s.decorable && s.dielineIds.length > 0).length}/{surfaces.length} surfaces bound.
          </p>
        </div>

        {/* Surface editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Surfaces</p>
            <button onClick={add} className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:border-ink-400">
              <Plus className="h-3.5 w-3.5" /> Add surface
            </button>
          </div>

          {surfaces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12px] text-ink-500">
              No surfaces yet. Add the decorable regions of this package (wrap, lid, panel…).
            </div>
          ) : (
            surfaces.map((s, i) => (
              <div key={s.key} className="rounded-xl border border-ink-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={s.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] font-semibold text-ink-900"
                  />
                  <button onClick={() => remove(i)} className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-ink-50 hover:text-danger-600" aria-label="Remove surface">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="Role">
                    <select value={s.role} onChange={(e) => update(i, { role: e.target.value as SurfaceRole })} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12px]">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{pretty(r)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Purpose">
                    <select value={s.surfacePurpose} onChange={(e) => update(i, { surfacePurpose: e.target.value as SurfacePurpose })} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12px]">
                      {PURPOSES.map((p) => (
                        <option key={p} value={p}>{p.toUpperCase()}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Part">
                    <input value={s.part ?? ''} onChange={(e) => update(i, { part: e.target.value || undefined })} placeholder="body / lid" className="w-full rounded-lg border border-ink-200 px-2 py-1 text-[12px]" />
                  </Field>
                  <Field label="Bleed mm">
                    <input
                      type="number"
                      value={s.defaultBleedMm}
                      onChange={(e) => update(i, { defaultBleedMm: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-ink-200 px-2 py-1 text-[12px]"
                    />
                  </Field>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-700">
                    <input type="checkbox" checked={s.decorable} onChange={(e) => update(i, { decorable: e.target.checked })} className="h-3.5 w-3.5 accent-pink-600" />
                    Decorable
                  </label>
                </div>

                {/* Die-line binding */}
                <div className="mt-2">
                  <p className="mb-1 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">
                    <Link2 className="h-3 w-3" /> Bound die-lines
                  </p>
                  {data.dielines.length === 0 ? (
                    <p className="text-[11px] text-ink-400">No die-lines on this package yet — add them in the Die-line library.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {data.dielines.map((d: BindableDieline) => {
                        const on = s.dielineIds.includes(d.id)
                        return (
                          <button
                            key={d.id}
                            onClick={() => toggleBinding(i, d.id)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
                          >
                            {d.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {/* Open the bound die-line's 2D editor in place */}
                  {s.dielineIds.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.dielineIds.map((id) => (
                        <button
                          key={id}
                          onClick={() => openDieline(id)}
                          disabled={loadingDieline === id}
                          className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                        >
                          {loadingDieline === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <PencilRuler className="h-3 w-3" />} Edit {dielineLabel.get(id) ?? 'die-line'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      {children}
    </label>
  )
}
