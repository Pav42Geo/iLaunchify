'use client'

// =============================================================================
// Admin Packaging Studio v2 (Pavel, 2026-08-03) — built to match
// design/packaging-studio-admin-v2-prototype.html (v2.8):
//   - icon rail with EXACTLY two entries: Library + 2D Mockups
//   - ONE popup creates/edits a container WITH die-lines, ONE 3D model, photos
//   - clean cards (thumb + name), hover ... menu (Edit / Duplicate / Deprecate)
//   - Design Studio category carousel (pinned arrows over fades, wheel scroll)
//   - navigation by DOCKED PREVIEW WINDOWS (die-line <-> 3D), not header buttons
//   - black Save pill
// SurfaceAuthoringClient.tsx stays untouched as the fallback (swap in page.tsx).
// =============================================================================

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check, ArrowLeft, MoreHorizontal, Pencil, Copy, Ban, Boxes, Search, Upload, Save, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X } from 'lucide-react'
import { DielineFrameEditor, DEFAULT_FRAME_LAYOUT, PackagingStudioShell, type StudioRailItem, type PackagingSurface } from '@ilaunchify/ui'
import { savePackagingSurfaces, getDielineEditorData, saveDielineFrames, attachPackagingModel3d, removePackagingModel3d, type DielineEditorData } from './actions'
import {
  createContainerFromStudio, updateContainerFromStudio, duplicateContainerFromStudio, deprecateContainerFromStudio,
  addDielineFromDims, addDielineUpload, listTypeMockups, uploadTypeMockup, setTypeMockupQuad, setTypeMockupStatus, deleteTypeMockup,
  type StudioMockup,
} from './popup-actions'
import type { PackagingAuthoringData, PackagingModelPick } from './loader'
import { Packaging3DView } from './Packaging3DView'

const TOPOLOGIES = ['SINGLE_CONTAINER', 'MULTI_CONTAINER_BOX', 'STICK_PACK', 'SACHET', 'CASE', 'CAPSULE_JAR', 'POUCH_STAND_UP', 'POUCH_FLAT', 'TUBE', 'OTHER'] as const
const CATEGORIES = ['BOTTLE', 'JAR', 'CAN', 'TUBE', 'POUCH', 'SACHET', 'STICK_PACK', 'BOX', 'CARTON', 'CASE', 'OTHER'] as const
const PLACEMENTS = ['body', 'top', 'bottom', 'front', 'back'] as const
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export function StudioV2Client({ data, models }: { data: PackagingAuthoringData | null; models: PackagingModelPick[] }) {
  const router = useRouter()
  const [tool, setTool] = React.useState<'library' | 'mockups'>('library')
  const [popup, setPopup] = React.useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = React.useState<{ id: string; label: string; data: DielineEditorData } | null>(null)
  const [loadingDieline, setLoadingDieline] = React.useState<string | null>(null)
  const [mockEditing, setMockEditing] = React.useState<StudioMockup | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const surfaces = data?.surfaces ?? []

  const dielineLabel = React.useMemo(() => new Map((data?.dielines ?? []).map((d) => [d.id, d.label])), [data])
  const openModel = (id: string) => router.push(`/studio/packaging?packagingTypeId=${encodeURIComponent(id)}`)

  async function openDieline(dielineId: string) {
    setLoadingDieline(dielineId)
    const d = await getDielineEditorData(dielineId).catch(() => null)
    setLoadingDieline(null)
    if (d) setEditing({ id: dielineId, label: dielineLabel.get(dielineId) ?? 'Die-line', data: d })
    else setErr('Could not open the die-line.')
  }

  async function save() {
    if (!data) return
    setSaving(true); setErr(null)
    const res = await savePackagingSurfaces(data.id, surfaces.map((s, i) => ({ ...s, sortOrder: i }))).catch(() => null)
    setSaving(false)
    if (res && res.ok) setSaved(true)
    else setErr(res && !res.ok ? res.error : 'Could not save.')
  }

  // ---- takeover: flat die-line editor, with the docked 3D preview window ----
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
          topBarLeft={<span className="text-[12.5px] font-semibold text-ink-700">{ed.label}</span>}
        />
        <PreviewWindow label="3D preview" onClick={() => setEditing(null)}>
          {data?.previewUrl
            ? <img src={data.previewUrl} alt="" className="h-full w-full object-contain p-2" />
            : <Boxes className="h-8 w-8 text-ink-300" />}
        </PreviewWindow>
      </div>
    )
  }

  // ---- takeover: 2D mockup print-area editor ----
  if (mockEditing && data) {
    return (
      <MockupPrintAreaEditor
        mockup={mockEditing}
        onClose={(refresh) => { setMockEditing(null); if (refresh) router.refresh() }}
        preview={data.previewUrl}
      />
    )
  }

  const rail: StudioRailItem[] = [
    { key: 'library', label: 'Library', icon: <Boxes className="h-5 w-5" /> },
    { key: 'mockups', label: '2D Mockups', icon: <ImageGlyph />, disabled: !data },
  ]

  const rightSlot = (
    <>
      {err && <span className="max-w-[260px] truncate rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-1 text-[11px] text-warning-800">{err}</span>}
      <button
        onClick={save}
        disabled={saving || !data}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-neon-500" />}
        {saved ? 'Saved' : 'Save'}
      </button>
    </>
  )

  const drawer = tool === 'library'
    ? <LibraryDrawerV2 models={models} currentId={data?.id ?? null} onOpen={openModel} onNew={() => setPopup('create')} onEdit={() => setPopup('edit')} router={router} />
    : data
      ? <MockupsDrawer models={models} data={data} onOpen={openModel} onPick={setMockEditing} onAdd={() => setPopup('edit')} />
      : null

  return (
    <>
      <PackagingStudioShell
        mode="admin"
        studioName="Packaging Studio (Admin)"
        brand={<div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-ink-900 text-white"><Boxes className="h-4 w-4" /></div>}
        centerSlot={
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
            <span className="h-5 w-px bg-ink-200" />
            <span className="max-w-[280px] truncate font-medium text-ink-700">{data ? data.displayName : 'Choose a container'}</span>
            {data && <span className="hidden sm:inline">· {data.containerCategory ? pretty(data.containerCategory) : 'Uncategorized'}</span>}
          </span>
        }
        view="3d"
        onViewChange={() => undefined}
        showViewToggle={false}
        rightSlot={rightSlot}
        rail={rail}
        activeTool={tool}
        onToolChange={(k) => setTool(k as 'library' | 'mockups')}
        drawer={drawer}
      >
        {!data ? (
          <div className="max-w-sm rounded-2xl border border-dashed border-ink-300 bg-white/70 p-8 text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-50 text-ink-400"><Boxes className="h-5 w-5" /></div>
            <div className="text-[13.5px] font-semibold text-ink-800">Pick a container to start</div>
            <p className="mx-auto mt-1.5 max-w-[18rem] text-[12px] leading-relaxed text-ink-500">Choose one from the <b>Library</b>, or create a new container: details, die-lines, 3D model and photos all live in one popup.</p>
          </div>
        ) : (
          <div className="relative h-full w-full">
            <Packaging3DView
              topology={data.topology}
              surfaces={surfaces}
              selectedKey={null}
              onSelect={() => undefined}
              placeMode={false}
              onPlaceAnchor={() => undefined}
              modelUrl={data.model3dUrl}
              material={null}
              dims={data.dims}
            />
            {data.dielines.length > 0 && (
              <PreviewWindow
                label={`Die-line · ${data.dielines[0]!.label}`}
                busy={loadingDieline === data.dielines[0]!.id}
                onClick={() => void openDieline(data.dielines[0]!.id)}
              >
                <DielineGlyph />
              </PreviewWindow>
            )}
          </div>
        )}
      </PackagingStudioShell>
      {popup && (
        <ContainerPopup
          mode={popup}
          data={popup === 'edit' ? data : null}
          onClose={() => setPopup(null)}
          onDone={(id) => { setPopup(null); if (id) openModel(id); else router.refresh() }}
        />
      )}
    </>
  )
}

// =============================================================================
// Library drawer: New container + search + category carousel + clean cards.
// =============================================================================
function LibraryDrawerV2({ models, currentId, onOpen, onNew, onEdit, router }: {
  models: PackagingModelPick[]
  currentId: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onEdit: () => void
  router: ReturnType<typeof useRouter>
}) {
  const [q, setQ] = React.useState('')
  const [cat, setCat] = React.useState<string | null>(null)
  const [catOpen, setCatOpen] = React.useState(false)
  const [menuFor, setMenuFor] = React.useState<string | null>(null)
  const [busyMenu, setBusyMenu] = React.useState(false)
  const stripRef = React.useRef<HTMLDivElement>(null)
  const scrollStrip = (dx: number) => stripRef.current?.scrollBy({ left: dx, behavior: 'smooth' })

  const cats = React.useMemo(() => {
    const present = new Set(models.map((m) => m.containerCategory).filter(Boolean) as string[])
    return [...CATEGORIES.filter((c) => present.has(c)), ...[...present].filter((c) => !(CATEGORIES as readonly string[]).includes(c))]
  }, [models])
  const dq = q.trim().toLowerCase()
  const list = models.filter((m) => (!cat || m.containerCategory === cat) && (!dq || m.displayName.toLowerCase().includes(dq)))

  async function duplicate(id: string) {
    setBusyMenu(true)
    const res = await duplicateContainerFromStudio(id).catch(() => null)
    setBusyMenu(false); setMenuFor(null)
    if (res && res.ok && res.id) onOpen(res.id)
  }
  async function deprecate(id: string) {
    setBusyMenu(true)
    const res = await deprecateContainerFromStudio(id).catch(() => null)
    setBusyMenu(false); setMenuFor(null)
    if (res && res.ok) router.refresh()
  }

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} className={`flex-none whitespace-nowrap rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-pink-300'}`}>{label}</button>
  )

  return (
    <div className="flex h-full flex-col" onClick={() => setMenuFor(null)}>
      <div className="border-b border-ink-100 px-3.5 pb-3 pt-3.5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-900">Library</h2>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-600">{models.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3.5 pb-8 pt-3">
        <button onClick={onNew} className="mb-1 flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-ink-300 bg-white px-3 py-2.5 text-[12.5px] font-bold text-ink-700 transition-colors hover:border-pink-400 hover:bg-pink-50 hover:text-pink-600">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-pink-500 text-white"><Plus className="h-3.5 w-3.5" /></span> New container
        </button>
        <p className="mb-2.5 px-0.5 text-[10.5px] leading-snug text-ink-400">One popup: details, die-lines, 3D model, 2D mockups. Hover a card for its menu.</p>
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search containers..." className="w-full bg-transparent text-[13px] outline-none" />
        </div>
        {/* category carousel: chips scroll UNDER pinned arrows on white fades */}
        <div className="relative mb-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center bg-gradient-to-r from-white via-white to-transparent pr-3">
            <button type="button" onClick={() => scrollStrip(-180)} className="pointer-events-auto grid h-7 w-6 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"><ChevronLeft className="h-4 w-4" /></button>
          </div>
          <div ref={stripRef} onWheel={(e) => { if (stripRef.current && e.deltaY !== 0) stripRef.current.scrollLeft += e.deltaY }} className="flex items-center gap-1 overflow-x-auto py-2 pl-8 pr-16 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chip('All', cat === null, () => { setCat(null); setCatOpen(false) })}
            {cats.map((c) => chip(pretty(c), cat === c, () => { setCat(c); setCatOpen(false) }))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] flex items-center gap-0.5 bg-gradient-to-l from-white via-white to-transparent pl-4 pr-1">
            <button type="button" onClick={() => scrollStrip(180)} className="pointer-events-auto grid h-7 w-6 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"><ChevronRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCatOpen((v) => !v)} className="pointer-events-auto grid h-7 w-6 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800">{catOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
          </div>
        </div>
        {catOpen && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chip('All', cat === null, () => { setCat(null); setCatOpen(false) })}
            {cats.map((c) => chip(pretty(c), cat === c, () => { setCat(c); setCatOpen(false) }))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {list.map((m) => (
            <div key={m.id} className={`relative overflow-hidden rounded-2xl border bg-white text-left transition-all hover:-translate-y-px hover:border-pink-300 hover:shadow-md ${m.id === currentId ? 'border-pink-500 ring-[3px] ring-pink-50' : 'border-ink-200'}`}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === m.id ? null : m.id) }} className="absolute right-1.5 top-1.5 z-[3] hidden h-6 w-6 place-items-center rounded-full bg-white/95 text-ink-600 shadow-sm hover:text-ink-900 [div:hover>&]:grid">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuFor === m.id && (
                <div className="absolute right-1.5 top-8 z-[20] min-w-[130px] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
                  <button disabled={busyMenu} onClick={() => { setMenuFor(null); if (m.id !== currentId) onOpen(m.id); onEdit() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-ink-700 hover:bg-pink-50 hover:text-pink-700"><Pencil className="h-3 w-3" /> Edit</button>
                  <button disabled={busyMenu} onClick={() => void duplicate(m.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-ink-700 hover:bg-pink-50 hover:text-pink-700"><Copy className="h-3 w-3" /> Duplicate</button>
                  <button disabled={busyMenu} onClick={() => void deprecate(m.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-ink-700 hover:bg-danger-50 hover:text-danger-500"><Ban className="h-3 w-3" /> Deprecate</button>
                </div>
              )}
              <button type="button" onClick={() => onOpen(m.id)} className="block w-full text-left">
                <span className="relative grid aspect-square place-items-center bg-gradient-to-br from-ink-50 to-ink-100">
                  {m.has3dModel && <span className="absolute right-1.5 top-1.5 rounded-full bg-ink-900 px-1.5 py-0.5 text-[8.5px] font-extrabold text-neon-500">3D</span>}
                  {m.previewUrl
                    ? <img src={m.previewUrl} alt="" className="h-full w-full object-contain p-2" />
                    : <Boxes className="h-7 w-7 text-ink-300" />}
                </span>
                <span className="block truncate px-2.5 py-2 text-[11.5px] font-semibold text-ink-900">{m.displayName}</span>
              </button>
            </div>
          ))}
        </div>
        {list.length === 0 && <p className="mt-3 px-1 text-[12px] text-ink-500">No containers match.</p>}
      </div>
    </div>
  )
}

// =============================================================================
// 2D Mockups drawer: PER CONTAINER (picker on top), photos below.
// =============================================================================
function MockupsDrawer({ models, data, onOpen, onPick, onAdd }: {
  models: PackagingModelPick[]
  data: PackagingAuthoringData
  onOpen: (id: string) => void
  onPick: (m: StudioMockup) => void
  onAdd: () => void
}) {
  const [rows, setRows] = React.useState<StudioMockup[] | null>(null)
  React.useEffect(() => {
    let alive = true
    setRows(null)
    void listTypeMockups(data.id).then((r) => { if (alive) setRows(r) }).catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [data.id])
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-100 px-3.5 pb-3 pt-3.5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-900">2D Mockups</h2>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-bold text-ink-600">{rows?.length ?? '…'}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3.5 pb-8 pt-3">
        <label className="mb-1 block text-[11px] font-bold text-ink-600">Container</label>
        <select value={data.id} onChange={(e) => onOpen(e.target.value)} className="mb-3 w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-pink-400">
          {models.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
        </select>
        {rows === null ? (
          <p className="px-1 text-[12px] text-ink-500">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {rows.map((m) => (
                <button key={m.id} onClick={() => onPick(m)} className="overflow-hidden rounded-2xl border border-ink-200 bg-white text-left transition-all hover:-translate-y-px hover:border-pink-300 hover:shadow-md">
                  <span className="relative grid aspect-square place-items-center bg-gradient-to-br from-ink-50 to-ink-100">
                    {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] font-extrabold text-ink-400">PHOTO</span>}
                    <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase ${m.status === 'ACTIVE' ? 'bg-success-50 text-success-600' : 'bg-ink-100 text-ink-500'}`}>{m.status === 'ACTIVE' ? 'Active' : 'Draft'}</span>
                  </span>
                  <span className="block truncate px-2.5 py-2 text-[11px] font-semibold text-ink-900">{m.label}</span>
                </button>
              ))}
            </div>
            {rows.length === 0 && <p className="px-1 text-[12px] text-ink-500">No 2D mockups for this container yet.</p>}
            <button onClick={onAdd} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-ink-300 bg-white px-3 py-2.5 text-[12px] font-semibold text-ink-600 transition-colors hover:border-pink-400 hover:bg-pink-50 hover:text-pink-600">
              <Plus className="h-3.5 w-3.5" /> Add photos (opens the container popup)
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Mockup print-area editor takeover: photo + draggable/resizable print area.
// =============================================================================
function MockupPrintAreaEditor({ mockup, onClose, preview }: { mockup: StudioMockup; onClose: (refresh: boolean) => void; preview: string | null }) {
  const q = mockup.quad
  const x0 = Math.min(...q.map((p) => p.x)), y0 = Math.min(...q.map((p) => p.y))
  const x1 = Math.max(...q.map((p) => p.x)), y1 = Math.max(...q.map((p) => p.y))
  const [rect, setRect] = React.useState({ x: x0, y: y0, w: Math.max(0.05, x1 - x0), h: Math.max(0.05, y1 - y0) })
  const [status, setStatus] = React.useState(mockup.status)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; r: typeof rect } | null>(null)

  function onPointerDown(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, sx: e.clientX, sy: e.clientY, r: rect }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current; const box = boxRef.current
    if (!d || !box) return
    const dx = (e.clientX - d.sx) / box.clientWidth
    const dy = (e.clientY - d.sy) / box.clientHeight
    if (d.mode === 'move') {
      setRect({ ...d.r, x: Math.min(Math.max(0, d.r.x + dx), 1 - d.r.w), y: Math.min(Math.max(0, d.r.y + dy), 1 - d.r.h) })
    } else {
      setRect({ ...d.r, w: Math.min(Math.max(0.05, d.r.w + dx), 1 - d.r.x), h: Math.min(Math.max(0.05, d.r.h + dy), 1 - d.r.y) })
    }
  }
  async function saveQuad() {
    setBusy(true); setMsg(null)
    const quad = [
      { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
    ]
    const res = await setTypeMockupQuad(mockup.id, quad).catch(() => null)
    setBusy(false)
    if (res && res.ok) setMsg('Print area saved')
    else setMsg(res && !res.ok ? res.error : 'Could not save.')
  }
  async function toggle() {
    const next = status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE'
    const res = await setTypeMockupStatus(mockup.id, next).catch(() => null)
    if (res && res.ok) setStatus(next)
  }
  async function remove() {
    setBusy(true)
    const res = await deleteTypeMockup(mockup.id).catch(() => null)
    setBusy(false)
    if (res && res.ok) onClose(true)
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5">
        <button onClick={() => onClose(true)} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 hover:border-ink-400"><ArrowLeft className="h-4 w-4" /> Back</button>
        <span className="font-display text-[13.5px] font-bold text-ink-900">{mockup.label}</span>
        <button onClick={() => void toggle()} className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase ${status === 'ACTIVE' ? 'bg-success-50 text-success-600' : 'bg-ink-100 text-ink-500'}`}>{status === 'ACTIVE' ? 'Active · click for draft' : 'Draft · click to activate'}</button>
        <div className="flex-1" />
        {msg && <span className="text-[11.5px] text-ink-500">{msg}</span>}
        <button onClick={() => void remove()} disabled={busy} className="rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-600 hover:border-danger-500 hover:text-danger-500 disabled:opacity-50">Delete</button>
        <button onClick={() => void saveQuad()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save print area</button>
      </div>
      <div className="grid flex-1 place-items-center overflow-auto bg-ink-100 p-8">
        <div ref={boxRef} className="relative max-h-[78vh] w-[min(720px,90vw)] overflow-hidden rounded-lg bg-white shadow-xl" onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)}>
          {mockup.imageUrl
            ? <img src={mockup.imageUrl} alt="" className="block w-full select-none" draggable={false} />
            : <div className="grid aspect-square w-full place-items-center text-[12px] font-bold text-ink-400">PHOTO</div>}
          <div
            className="absolute cursor-move rounded border-2 border-pink-500 bg-pink-500/10"
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            onPointerDown={(e) => onPointerDown(e, 'move')}
          >
            <span className="absolute left-0 top-0 rounded-br bg-pink-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">Print area</span>
            <span className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-pink-500 bg-white" onPointerDown={(e) => onPointerDown(e, 'resize')} />
          </div>
        </div>
      </div>
      <PreviewWindow label="3D preview" onClick={() => onClose(true)}>
        {preview ? <img src={preview} alt="" className="h-full w-full object-contain p-2" /> : <Boxes className="h-8 w-8 text-ink-300" />}
      </PreviewWindow>
    </div>
  )
}

// =============================================================================
// THE popup: container details + die-lines + 3D model + 2D photos, one place.
// =============================================================================
type PendDie = { kind: 'dims'; label: string; placement: string; widthMm: number; heightMm: number } | { kind: 'file'; label: string; placement: string; file: File }
function ContainerPopup({ mode, data, onClose, onDone }: {
  mode: 'create' | 'edit'
  data: PackagingAuthoringData | null
  onClose: () => void
  onDone: (id: string | null) => void
}) {
  const editId = mode === 'edit' ? data?.id ?? null : null
  const [name, setName] = React.useState(data?.displayName ?? '')
  const [category, setCategory] = React.useState(data?.containerCategory ?? 'CAN')
  const [topology, setTopology] = React.useState(data?.topology ?? 'SINGLE_CONTAINER')
  const [len, setLen] = React.useState(''); const [wid, setWid] = React.useState(''); const [hei, setHei] = React.useState('')
  const [dieLabel, setDieLabel] = React.useState('Body wrap')
  const [diePlace, setDiePlace] = React.useState<string>('body')
  const [dieW, setDieW] = React.useState('158'); const [dieH, setDieH] = React.useState('110')
  const [pendDies, setPendDies] = React.useState<PendDie[]>([])
  const [glbFile, setGlbFile] = React.useState<File | null>(null)
  const [photos, setPhotos] = React.useState<File[]>([])
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const glbRef = React.useRef<HTMLInputElement>(null)
  const dieFileRef = React.useRef<HTMLInputElement>(null)
  const photoRef = React.useRef<HTMLInputElement>(null)

  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : null }

  async function applyAssets(id: string): Promise<string | null> {
    for (const d of pendDies) {
      if (d.kind === 'dims') {
        const r = await addDielineFromDims(id, { label: d.label, placement: d.placement as never, widthMm: d.widthMm, heightMm: d.heightMm }).catch(() => null)
        if (!r || !r.ok) return (r && !r.ok && r.error) || 'Could not add a die-line.'
      } else {
        const fd = new FormData(); fd.set('file', d.file); fd.set('label', d.label); fd.set('placement', d.placement)
        const r = await addDielineUpload(id, fd).catch(() => null)
        if (!r || !r.ok) return (r && !r.ok && r.error) || 'Could not upload a die-line.'
      }
    }
    if (glbFile) {
      const fd = new FormData(); fd.set('file', glbFile)
      const r = await attachPackagingModel3d(id, fd).catch(() => null)
      if (!r || !r.ok) return (r && !r.ok && r.error) || 'Could not import the 3D model.'
    }
    for (const p of photos) {
      const fd = new FormData(); fd.set('packagingTypeId', id); fd.set('file', p); fd.set('label', p.name.replace(/\.[^.]+$/, ''))
      const r = await uploadTypeMockup(fd).catch(() => null)
      if (!r || !r.ok) return (r && !r.ok && r.error) || 'Could not upload a photo.'
    }
    return null
  }

  async function submit() {
    setBusy(true); setErr(null)
    const input = {
      displayName: name, topology, containerCategory: category,
      dims: { lengthMm: num(len), widthMm: num(wid), heightMm: num(hei) },
    }
    const res = editId
      ? await updateContainerFromStudio(editId, input).catch(() => null)
      : await createContainerFromStudio(input).catch(() => null)
    if (!res || !res.ok) { setBusy(false); setErr((res && !res.ok && res.error) || 'Could not save the container.'); return }
    const id = editId ?? res.id!
    const assetErr = await applyAssets(id)
    setBusy(false)
    if (assetErr) { setErr(`${assetErr} The container itself was saved.`); return }
    onDone(id)
  }

  const sect = 'mb-3 rounded-2xl border border-ink-200 p-3.5'
  const fieldCls = 'w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-pink-400'
  const n = (i: number) => <span className="grid h-5 w-5 place-items-center rounded-full bg-ink-900 text-[10.5px] font-extrabold text-neon-500">{i}</span>

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-ink-900/45 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="max-h-[90vh] w-[min(760px,94vw)] overflow-auto rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-[5] flex items-center gap-3 border-b border-ink-100 bg-white px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-pink-50 text-pink-600"><Boxes className="h-4.5 w-4.5" /></span>
          <div>
            <h3 className="font-display text-[16px] font-extrabold text-ink-900">{editId ? 'Edit container' : 'New container'}</h3>
            <p className="text-[11.5px] text-ink-500">Details, die-lines, 3D model and photos: one place.</p>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 pb-2 pt-4">
          <div className={sect}>
            <h4 className="mb-2.5 flex items-center gap-2 font-display text-[13.5px] font-extrabold text-ink-900">{n(1)} Container</h4>
            <div className="mb-2.5 grid grid-cols-2 gap-2.5">
              <div><label className="mb-1 block text-[11px] font-bold text-ink-600">Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aluminum can · 330 ml sleek" className={fieldCls} /></div>
              <div><label className="mb-1 block text-[11px] font-bold text-ink-600">Group (category)</label>
                <select value={category ?? 'CAN'} onChange={(e) => setCategory(e.target.value)} className={fieldCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div><label className="mb-1 block text-[11px] font-bold text-ink-600">Shape</label>
                <select value={topology} onChange={(e) => setTopology(e.target.value)} className={fieldCls}>{TOPOLOGIES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</select></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="mb-1 block text-[11px] font-bold text-ink-600">L mm</label><input value={len} onChange={(e) => setLen(e.target.value)} className={fieldCls} /></div>
                <div><label className="mb-1 block text-[11px] font-bold text-ink-600">W mm</label><input value={wid} onChange={(e) => setWid(e.target.value)} className={fieldCls} /></div>
                <div><label className="mb-1 block text-[11px] font-bold text-ink-600">H mm</label><input value={hei} onChange={(e) => setHei(e.target.value)} className={fieldCls} /></div>
              </div>
            </div>
          </div>

          <div className={sect}>
            <h4 className="mb-2.5 flex items-center gap-2 font-display text-[13.5px] font-extrabold text-ink-900">{n(2)} Die-lines
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600">{(data?.dielines.length ?? 0) + pendDies.length || 'none yet'}</span></h4>
            {(data?.dielines ?? []).map((d) => (
              <div key={d.id} className="mb-1.5 flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[12px]"><b className="flex-1 truncate font-semibold">{d.label}</b><span className="text-[10px] text-ink-500">existing</span></div>
            ))}
            {pendDies.map((d, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[12px]">
                <b className="flex-1 truncate font-semibold">{d.label}</b>
                <span className="text-[10px] text-ink-500">{d.placement} · {d.kind === 'dims' ? `${d.widthMm}×${d.heightMm} mm · generated` : 'file'}</span>
                <button onClick={() => setPendDies((p) => p.filter((_, idx) => idx !== i))} className="grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-danger-50 hover:text-danger-500"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-2">
              <div><label className="mb-1 block text-[11px] font-bold text-ink-600">Label</label><input value={dieLabel} onChange={(e) => setDieLabel(e.target.value)} className={fieldCls} /></div>
              <div><label className="mb-1 block text-[11px] font-bold text-ink-600">Placement</label>
                <select value={diePlace} onChange={(e) => setDiePlace(e.target.value)} className={fieldCls}>{PLACEMENTS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-1.5">
                <div><label className="mb-1 block text-[11px] font-bold text-ink-600">W mm</label><input value={dieW} onChange={(e) => setDieW(e.target.value)} className={fieldCls} /></div>
                <div><label className="mb-1 block text-[11px] font-bold text-ink-600">H mm</label><input value={dieH} onChange={(e) => setDieH(e.target.value)} className={fieldCls} /></div>
              </div>
              <div className="flex gap-1.5 pb-0.5">
                <button onClick={() => dieFileRef.current?.click()} className="rounded-full border border-ink-200 px-3 py-1.5 text-[11.5px] font-semibold text-ink-700 hover:border-pink-300 hover:bg-pink-50">Upload</button>
                <button onClick={() => { const w = num(dieW), h = num(dieH); if (w && h) { setPendDies((p) => [...p, { kind: 'dims', label: dieLabel.trim() || 'Die-line', placement: diePlace, widthMm: w, heightMm: h }]) } }} className="rounded-full bg-pink-500 px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-pink-600">Generate</button>
              </div>
            </div>
            <input ref={dieFileRef} type="file" accept=".pdf,.ai,.svg,.dxf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendDies((p) => [...p, { kind: 'file', label: dieLabel.trim() || f.name, placement: diePlace, file: f }]); e.target.value = '' }} />
            <p className="mt-1.5 text-[10.5px] leading-snug text-ink-400">Each die-line appears as a region on the 3D object. Upload takes PDF, AI, SVG, DXF; Generate builds trim + bleed + safe boxes from the size.</p>
          </div>

          <div className={sect}>
            <h4 className="mb-2.5 flex items-center gap-2 font-display text-[13.5px] font-extrabold text-ink-900">{n(3)} 3D model <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600">one per container</span></h4>
            {data?.has3dModel && !glbFile ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[12px]">
                <b className="flex-1 font-semibold">Model imported</b>
                <button onClick={() => glbRef.current?.click()} className="rounded-full border border-ink-200 px-3 py-1 text-[11px] font-semibold text-ink-700 hover:border-pink-300">Replace</button>
                <button onClick={() => { if (editId) void removePackagingModel3d(editId).then(() => onDone(editId)) }} className="rounded-full border border-ink-200 px-3 py-1 text-[11px] font-semibold text-ink-600 hover:border-danger-500 hover:text-danger-500">Remove</button>
              </div>
            ) : glbFile ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[12px]">
                <b className="flex-1 truncate font-semibold">{glbFile.name}</b>
                <button onClick={() => setGlbFile(null)} className="grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-danger-50 hover:text-danger-500"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button onClick={() => glbRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-ink-300 bg-ink-50 px-3 py-3 text-[11.5px] font-semibold text-ink-500 hover:border-pink-400 hover:bg-pink-50 hover:text-pink-700"><Upload className="h-3.5 w-3.5" /> Drop a GLB or GLTF here, or click to pick</button>
            )}
            <input ref={glbRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setGlbFile(f); e.target.value = '' }} />
            <p className="mt-1.5 text-[10.5px] leading-snug text-ink-400">Powers the rotatable model on the canvas. 40 MB max. Falls back to the parametric shape when absent.</p>
          </div>

          <div className={sect}>
            <h4 className="mb-2.5 flex items-center gap-2 font-display text-[13.5px] font-extrabold text-ink-900">{n(4)} 2D photo mockups
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600">{photos.length || 'none yet'}</span>
              <button onClick={() => photoRef.current?.click()} className="ml-auto rounded-full border border-ink-200 px-3 py-1 text-[11px] font-semibold text-ink-700 hover:border-pink-300 hover:bg-pink-50">+ Add photos</button></h4>
            {photos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {photos.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-700">
                    {p.name}
                    <button onClick={() => setPhotos((x) => x.filter((_, idx) => idx !== i))} className="text-ink-400 hover:text-danger-500"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <button onClick={() => photoRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-ink-300 bg-white px-3 py-2.5 text-[11.5px] font-medium text-ink-500 hover:border-pink-400 hover:bg-pink-50 hover:text-pink-700">Drop photos (JPG, PNG, WEBP) · each becomes a mockup template with a print area</button>
            <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) setPhotos((p) => [...p, ...Array.from(e.target.files!)]); e.target.value = '' }} />
          </div>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-ink-100 bg-white px-5 py-3.5">
          <span className="text-[11px] text-ink-400">{err ?? (editId ? 'Changes apply to the container and its assets.' : 'Creates the container with everything in one go.')}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full border border-ink-200 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-800 hover:border-ink-400">Cancel</button>
            <button onClick={() => void submit()} disabled={busy || name.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-pink-600 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {editId ? 'Save changes' : 'Create container'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Shared bits
// =============================================================================
function PreviewWindow({ label, onClick, busy, children }: { label: string; onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-5 right-5 z-[40] w-[158px] overflow-hidden rounded-2xl border border-ink-200 bg-white text-left shadow-lg transition-all hover:-translate-y-0.5 hover:border-pink-400 hover:shadow-xl"
      style={{ position: 'fixed' }}
    >
      <span className="grid h-[104px] place-items-center bg-gradient-to-br from-ink-50 to-ink-100">{busy ? <Loader2 className="h-5 w-5 animate-spin text-ink-400" /> : children}</span>
      <span className="flex items-center gap-1.5 border-t border-ink-100 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-600">
        <span className="truncate">{label}</span><span className="ml-auto text-pink-500">→</span>
      </span>
    </button>
  )
}
function DielineGlyph() {
  return (
    <svg width="120" height="82" viewBox="0 0 120 82">
      <rect x="4" y="4" width="112" height="74" fill="none" stroke="#FF7FA8" strokeWidth="1" strokeDasharray="4 3" />
      <rect x="10" y="10" width="100" height="62" fill="none" stroke="#18181A" strokeWidth="1.4" />
      <rect x="17" y="17" width="86" height="48" fill="none" stroke="#1E7C4A" strokeWidth="0.8" strokeDasharray="3 3" />
      <line x1="60" y1="10" x2="60" y2="72" stroke="#CBCCD3" strokeWidth="0.8" strokeDasharray="5 4" />
    </svg>
  )
}
function ImageGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
    </svg>
  )
}
