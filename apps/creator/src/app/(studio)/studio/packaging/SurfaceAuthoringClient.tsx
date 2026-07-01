'use client'

// =============================================================================
// Admin Packaging Studio — surface authoring, now rendered on the SHARED Step-4
// chrome (PackagingStudioShell from @ilaunchify/ui). This makes the admin studio
// look identical to the partner New-Product Step 4: top bar + 3D⇄Die-line toggle,
// left tool rail, slide-out drawer, center canvas.
//
// Admin-only tools live in the drawer (Library = model + die-lines; Surfaces =
// author the clickable borders + bind die-lines). Clicking "Edit" on a bound
// die-line opens the shared DielineFrameEditor full-view "in the same place".
// Nothing here touches the partner hot file.
// =============================================================================

import * as React from 'react'
import { Plus, Trash2, Save, Loader2, Check, Cuboid, Link2, Crosshair, ArrowLeft, PencilRuler, Inbox, Shapes, Boxes } from 'lucide-react'
import {
  PackagingStudioShell,
  DielineFrameEditor,
  DEFAULT_FRAME_LAYOUT,
  type StudioView,
  type StudioRailItem,
  type PackagingSurface,
  type SurfaceRole,
  type SurfacePurpose,
} from '@ilaunchify/ui'
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
  const [view, setView] = React.useState<StudioView>('3d')
  const [tool, setTool] = React.useState<'library' | 'surfaces'>('surfaces')
  // Inline 2D die-line editor (click a bound surface's die-line → opens "in place").
  const [editing, setEditing] = React.useState<{ id: string; label: string; data: DielineEditorData } | null>(null)
  const [loadingDieline, setLoadingDieline] = React.useState<string | null>(null)

  const dielineLabel = React.useMemo(() => new Map(data.dielines.map((d) => [d.id, d.label])), [data.dielines])
  const boundCount = surfaces.filter((s) => s.decorable && s.dielineIds.length > 0).length

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

  // Inline 2D die-line editor — takes over the whole studio "in the same place".
  if (editing) {
    const ed = editing
    return (
      <div className="fixed inset-0 z-[80] flex flex-col bg-white">
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

  const rail: StudioRailItem[] = [
    { key: 'library', label: 'Library', icon: <Inbox className="h-5 w-5" /> },
    { key: 'surfaces', label: 'Surfaces', icon: <Shapes className="h-5 w-5" /> },
  ]

  const rightSlot = (
    <>
      {err && <span className="max-w-[260px] truncate rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-1 text-[11px] text-warning-800">{err}</span>}
      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full border border-pink-500 bg-pink-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:border-pink-600 hover:bg-pink-600 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saved ? 'Saved' : 'Save surfaces'}
      </button>
    </>
  )

  const drawer =
    tool === 'library' ? (
      <LibraryDrawer data={data} boundCount={boundCount} dielineLabel={dielineLabel} onEdit={openDieline} loadingDieline={loadingDieline} />
    ) : (
      <SurfacesDrawer
        surfaces={surfaces}
        dielines={data.dielines}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onAdd={add}
        onRemove={remove}
        onUpdate={update}
        onToggleBinding={toggleBinding}
        onEdit={openDieline}
        loadingDieline={loadingDieline}
        dielineLabel={dielineLabel}
      />
    )

  return (
    <div className="fixed inset-0 z-[70]">
      <PackagingStudioShell
        mode="admin"
        studioName="Packaging Studio (Admin)"
        brand={<div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-ink-900 text-white"><Boxes className="h-4 w-4" /></div>}
        centerSlot={
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
            <span className="h-5 w-px bg-ink-200" />
            <span className="max-w-[280px] truncate font-medium text-ink-700">{data.displayName}</span>
            <span className="hidden sm:inline">· {data.containerCategory ? pretty(data.containerCategory) : 'Uncategorized'} · {pretty(data.topology)}</span>
          </span>
        }
        view={view}
        onViewChange={setView}
        rightSlot={rightSlot}
        rail={rail}
        activeTool={tool}
        onToolChange={(k) => setTool(k as 'library' | 'surfaces')}
        drawer={drawer}
      >
        {view === '3d' ? (
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,#fff,#eceef0_70%,#e2e4e7)]">
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
            {/* Place-marker control */}
            <div className="absolute right-4 top-4">
              <button
                onClick={() => setPlaceMode((v) => !v)}
                disabled={!selectedKey}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold shadow-sm transition disabled:opacity-40 ${placeMode ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
                title="Click the model to position the selected surface's clickable marker"
              >
                <Crosshair className="h-3.5 w-3.5" /> {placeMode ? 'Placing…' : 'Place marker'}
              </button>
            </div>
            <div className="absolute bottom-4 left-4 rounded-lg border border-ink-200 bg-white/85 px-3 py-1.5 text-[11.5px] text-ink-500">
              Drag to orbit · scroll to zoom · click a marker to select · {boundCount}/{surfaces.length} bound
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[radial-gradient(circle,#e4e4e7_1px,transparent_1px)] bg-[length:18px_18px] p-8">
            <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-5">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                <PencilRuler className="h-3.5 w-3.5" /> Die-lines on this package
              </p>
              {data.dielines.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-ink-500">No die-lines yet. Add them to this package, then bind them to surfaces.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {data.dielines.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-2">
                      <span className="min-w-0 truncate text-[13px] font-medium text-ink-800">{d.label}</span>
                      <button
                        onClick={() => openDieline(d.id)}
                        disabled={loadingDieline === d.id}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                      >
                        {loadingDieline === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PencilRuler className="h-3.5 w-3.5" />} Lay frames
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-ink-400">Tip: bind a die-line to a surface in the Surfaces tab, then click a 3D marker to jump straight to its frames.</p>
            </div>
          </div>
        )}
      </PackagingStudioShell>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Drawers
// -----------------------------------------------------------------------------

function LibraryDrawer({
  data,
  boundCount,
  dielineLabel,
  onEdit,
  loadingDieline,
}: {
  data: PackagingAuthoringData
  boundCount: number
  dielineLabel: Map<string, string>
  onEdit: (id: string) => void
  loadingDieline: string | null
}) {
  return (
    <div className="p-3">
      <DrawerHead title="Model" sub="Package + its die-lines." icon={Cuboid} />
      <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
        <div className="mb-2 flex aspect-[16/9] items-center justify-center rounded-lg bg-white"><Boxes className="h-8 w-8 text-ink-300" /></div>
        <p className="truncate text-[13px] font-semibold text-ink-900">{data.displayName}</p>
        <p className="text-[11px] text-ink-500">
          {data.containerCategory ? pretty(data.containerCategory) : 'Uncategorized'} · {pretty(data.topology)} · {data.has3dModel ? '3D model' : 'Parametric'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-ink-500">
          <span className="rounded-full bg-ink-100 px-2 py-0.5">{data.surfaces.length} surface{data.surfaces.length === 1 ? '' : 's'}</span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5">{boundCount} bound</span>
          <span className="rounded-full bg-ink-100 px-2 py-0.5">{data.dielines.length} die-line{data.dielines.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <p className="mb-1.5 mt-4 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-500">
        <PencilRuler className="h-3 w-3" /> Die-lines
      </p>
      {data.dielines.length === 0 ? (
        <p className="text-[11px] text-ink-400">No die-lines on this package yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.dielines.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5">
              <span className="min-w-0 truncate text-[12px] font-medium text-ink-800">{dielineLabel.get(d.id) ?? d.label}</span>
              <button
                onClick={() => onEdit(d.id)}
                disabled={loadingDieline === d.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-200 px-2 py-1 text-[10.5px] font-semibold text-ink-700 hover:border-ink-400 disabled:opacity-50"
              >
                {loadingDieline === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <PencilRuler className="h-3 w-3" />} Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SurfacesDrawer({
  surfaces,
  dielines,
  selectedKey,
  onSelect,
  onAdd,
  onRemove,
  onUpdate,
  onToggleBinding,
  onEdit,
  loadingDieline,
  dielineLabel,
}: {
  surfaces: PackagingSurface[]
  dielines: BindableDieline[]
  selectedKey: string | null
  onSelect: (k: string) => void
  onAdd: () => void
  onRemove: (i: number) => void
  onUpdate: (i: number, patch: Partial<PackagingSurface>) => void
  onToggleBinding: (i: number, id: string) => void
  onEdit: (id: string) => void
  loadingDieline: string | null
  dielineLabel: Map<string, string>
}) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <DrawerHead title="Surfaces" sub="Clickable decorable regions." icon={Shapes} />
        <button onClick={onAdd} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[12px] font-semibold text-ink-700 hover:border-ink-400">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {surfaces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12px] text-ink-500">
          No surfaces yet. Add the decorable regions of this package (wrap, lid, panel…).
        </div>
      ) : (
        <div className="space-y-2.5">
          {surfaces.map((s, i) => {
            const active = s.key === selectedKey
            return (
              <div key={s.key} className={`rounded-xl border bg-white p-2.5 ${active ? 'border-pink-400 ring-1 ring-pink-200' : 'border-ink-200'}`} onClick={() => onSelect(s.key)}>
                <div className="flex items-center gap-2">
                  <input
                    value={s.label}
                    onChange={(e) => onUpdate(i, { label: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 rounded-lg border border-ink-200 px-2 py-1 text-[12.5px] font-semibold text-ink-900"
                  />
                  <button onClick={(e) => { e.stopPropagation(); onRemove(i) }} className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-ink-50 hover:text-danger-600" aria-label="Remove surface">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Field label="Role">
                    <select value={s.role} onChange={(e) => onUpdate(i, { role: e.target.value as SurfaceRole })} onClick={(e) => e.stopPropagation()} className="w-full rounded-lg border border-ink-200 bg-white px-1.5 py-1 text-[11.5px]">
                      {ROLES.map((r) => (<option key={r} value={r}>{pretty(r)}</option>))}
                    </select>
                  </Field>
                  <Field label="Purpose">
                    <select value={s.surfacePurpose} onChange={(e) => onUpdate(i, { surfacePurpose: e.target.value as SurfacePurpose })} onClick={(e) => e.stopPropagation()} className="w-full rounded-lg border border-ink-200 bg-white px-1.5 py-1 text-[11.5px]">
                      {PURPOSES.map((p) => (<option key={p} value={p}>{p.toUpperCase()}</option>))}
                    </select>
                  </Field>
                  <Field label="Part">
                    <input value={s.part ?? ''} onChange={(e) => onUpdate(i, { part: e.target.value || undefined })} onClick={(e) => e.stopPropagation()} placeholder="body / lid" className="w-full rounded-lg border border-ink-200 px-1.5 py-1 text-[11.5px]" />
                  </Field>
                  <Field label="Bleed mm">
                    <input type="number" value={s.defaultBleedMm} onChange={(e) => onUpdate(i, { defaultBleedMm: Number(e.target.value) || 0 })} onClick={(e) => e.stopPropagation()} className="w-full rounded-lg border border-ink-200 px-1.5 py-1 text-[11.5px]" />
                  </Field>
                </div>

                <label className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink-700" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={s.decorable} onChange={(e) => onUpdate(i, { decorable: e.target.checked })} className="h-3.5 w-3.5 accent-pink-600" />
                  Decorable
                </label>

                {/* Die-line binding */}
                <div className="mt-2">
                  <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    <Link2 className="h-3 w-3" /> Bound die-lines
                  </p>
                  {dielines.length === 0 ? (
                    <p className="text-[11px] text-ink-400">No die-lines on this package yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {dielines.map((d) => {
                        const on = s.dielineIds.includes(d.id)
                        return (
                          <button
                            key={d.id}
                            onClick={() => onToggleBinding(i, d.id)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
                          >
                            {d.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {s.dielineIds.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {s.dielineIds.map((id) => (
                        <button
                          key={id}
                          onClick={() => onEdit(id)}
                          disabled={loadingDieline === id}
                          className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2 py-0.5 text-[10.5px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                        >
                          {loadingDieline === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <PencilRuler className="h-3 w-3" />} Edit {dielineLabel.get(id) ?? 'die-line'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DrawerHead({ title, sub, icon: Icon }: { title: string; sub?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mb-2">
      <p className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink-900">{Icon && <Icon className="h-4 w-4 text-ink-500" />}{title}</p>
      {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
      {children}
    </label>
  )
}
