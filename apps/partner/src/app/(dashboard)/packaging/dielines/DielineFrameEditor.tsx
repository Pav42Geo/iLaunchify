'use client'

// =============================================================================
// Shared die-line frame editor — the Design-Studio-style canvas that both
// die-line surfaces render (docs/HANDOFF-TO-CODE-dieline-studio-dedupe.md):
//   • DielineStudioShell  — standalone /dielines/[id] studio (packaging library)
//   • PackagingStudioStep — inline Step 4 of the product builder
//
// Controlled-ish: the parent seeds initial geometry + supplies an `onPersist`
// (called debounced) and the surrounding top bar via slots; the editor owns all
// interaction state (tool, selection, zoom, drag) and the autosave debounce, and
// hands the parent the live `issues` + `saveStatus` for its top-bar chrome.
//
// Presentation constants come from ./frame-presentation (single source).
// =============================================================================

import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FileImage,
  LayoutGrid,
  SquareDashedBottom,
  Layers as LayersIcon,
  Shapes,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Plus,
  ChevronLeft,
} from 'lucide-react'
import {
  FRAME_SCOPE,
  validateFrameLayout,
  ElementRail,
  type Frame,
  type FrameKind,
  type FrameLayout,
  type FrameScope,
  type LayoutIssue,
  type NormBox,
} from '@ilaunchify/ui'
import { SCOPE_COLOR, KIND_LABEL, PALETTE } from './frame-presentation'

export type DielineSaveStatus = 'idle' | 'saving' | 'saved'

export interface DielineBackdrop {
  fileUrl: string | null
  isPdf: boolean
}

export interface DielineEditorMeta {
  format?: string | null
  widthMm?: number | null
  heightMm?: number | null
  bleedMm?: number | null
}

export interface PersistResult {
  ok: boolean
  error?: string
}

export interface DielineFrameEditorProps {
  initialLayout: FrameLayout
  initialTrim: NormBox
  initialSafe: NormBox
  backdrop: DielineBackdrop
  meta?: DielineEditorMeta
  /** Called (debounced ~700ms) whenever geometry settles. */
  onPersist: (geom: { layout: FrameLayout; trim: NormBox; safe: NormBox }) => Promise<PersistResult>
  /** Left side of the top bar (exit, title, status). */
  topBarLeft?: React.ReactNode
  /** Right side of the top bar — gets live preflight issues + save status. */
  topBarRight?: (ctx: { issues: LayoutIssue[]; saveStatus: DielineSaveStatus }) => React.ReactNode
}

type Tool = 'dieline' | 'surfaces' | 'guides' | 'frames' | 'layers'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
let _id = 0
const newFrameId = (k: string) => `f_${k}_${Date.now()}_${_id++}`

export function DielineFrameEditor({
  initialLayout,
  initialTrim,
  initialSafe,
  backdrop,
  meta,
  onPersist,
  topBarLeft,
  topBarRight,
}: DielineFrameEditorProps) {
  const [tool, setTool] = useState<Tool>('frames')
  const [layout, setLayout] = useState<FrameLayout>(initialLayout)
  const [trim, setTrim] = useState<NormBox>(initialTrim)
  const [safe, setSafe] = useState<NormBox>(initialSafe)
  const [showGuides, setShowGuides] = useState({ trim: true, safe: true })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [saveStatus, setSaveStatus] = useState<DielineSaveStatus>('saved')

  const artRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ kind: 'frame' | 'trim' | 'safe'; id?: string; mode: 'move' | 'resize'; startX: number; startY: number; startBox: NormBox } | null>(null)

  // ---- autosave (debounced) ----
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueSave = useCallback(
    (nextLayout: FrameLayout, nextTrim: NormBox, nextSafe: NormBox) => {
      setSaveStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        const r = await onPersist({ layout: nextLayout, trim: nextTrim, safe: nextSafe })
        setSaveStatus(r.ok ? 'saved' : 'idle')
        if (!r.ok && r.error) toast.error(r.error)
      }, 700)
    },
    [onPersist],
  )

  const commit = useCallback(
    (nextLayout: FrameLayout, nextTrim = trim, nextSafe = safe) => {
      setLayout(nextLayout)
      queueSave(nextLayout, nextTrim, nextSafe)
    },
    [queueSave, trim, safe],
  )

  // ---- drag handlers (normalized 0..1 over the artboard) ----
  const onPointerDown = (e: React.PointerEvent, kind: 'frame' | 'trim' | 'safe', mode: 'move' | 'resize', id?: string) => {
    e.stopPropagation()
    const box = kind === 'frame' ? layout.frames.find((f) => f.id === id)?.box : kind === 'trim' ? trim : safe
    if (!box) return
    dragRef.current = { kind, id, mode, startX: e.clientX, startY: e.clientY, startBox: { ...box } }
    if (kind === 'frame' && id) setSelectedId(id)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const art = artRef.current
    if (!d || !art) return
    const rect = art.getBoundingClientRect()
    const dx = (e.clientX - d.startX) / rect.width
    const dy = (e.clientY - d.startY) / rect.height
    let nb: NormBox
    if (d.mode === 'move') {
      nb = { ...d.startBox, x: clamp01(d.startBox.x + dx), y: clamp01(d.startBox.y + dy) }
      nb.x = Math.min(nb.x, 1 - d.startBox.w)
      nb.y = Math.min(nb.y, 1 - d.startBox.h)
    } else {
      nb = { ...d.startBox, w: clamp01(d.startBox.w + dx), h: clamp01(d.startBox.h + dy) }
      nb.w = Math.max(0.04, Math.min(nb.w, 1 - d.startBox.x))
      nb.h = Math.max(0.03, Math.min(nb.h, 1 - d.startBox.y))
    }
    if (d.kind === 'frame' && d.id) {
      setLayout((prev) => ({ ...prev, frames: prev.frames.map((f) => (f.id === d.id ? { ...f, box: nb, source: 'PARTNER' } : f)) }))
    } else if (d.kind === 'trim') setTrim(nb)
    else setSafe(nb)
  }

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null
      queueSave(layout, trim, safe)
    }
  }

  const addFrame = (kind: FrameKind) => {
    const f: Frame = {
      id: newFrameId(kind),
      kind,
      box: { x: 0.3, y: 0.3, w: 0.25, h: 0.15 },
      required: FRAME_SCOPE[kind] === 'RECIPE' || kind === 'STATEMENT_OF_IDENTITY' || kind === 'NET_QUANTITY' || kind === 'MANUFACTURER',
      source: 'PARTNER',
    }
    commit({ ...layout, frames: [...layout.frames, f] })
    setSelectedId(f.id)
    setTool('frames')
  }

  const removeFrame = (id: string) => {
    commit({ ...layout, frames: layout.frames.filter((f) => f.id !== id) })
    if (selectedId === id) setSelectedId(null)
  }

  const patchFrame = (id: string, patch: Partial<Frame>) => {
    commit({ ...layout, frames: layout.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }

  const selected = useMemo(() => layout.frames.find((f) => f.id === selectedId) ?? null, [layout, selectedId])
  const issues = useMemo(() => validateFrameLayout(layout, { safeArea: safe }), [layout, safe])

  return (
    <div className="flex h-full w-full flex-col bg-zinc-100 text-ink-900">
      {/* ---- Top bar (parent-supplied slots) ---- */}
      <header className="flex h-[57px] shrink-0 items-center justify-between border-b border-ink-200 bg-white px-4">
        <div className="flex items-center gap-3">{topBarLeft}</div>
        <div className="flex items-center gap-3">{topBarRight?.({ issues, saveStatus })}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- Left tool rail ---- */}
        <nav className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-ink-200 bg-white py-3">
          <RailButton icon={FileImage} label="Die-line" active={tool === 'dieline'} onClick={() => setTool('dieline')} />
          <RailButton icon={LayoutGrid} label="Surfaces" active={tool === 'surfaces'} onClick={() => setTool('surfaces')} />
          <RailButton icon={SquareDashedBottom} label="Guides" active={tool === 'guides'} onClick={() => setTool('guides')} />
          <RailButton icon={Shapes} label="Frames" active={tool === 'frames'} onClick={() => setTool('frames')} />
          <RailButton icon={LayersIcon} label="Layers" active={tool === 'layers'} onClick={() => setTool('layers')} />
        </nav>

        {/* ---- Drawer ---- */}
        <aside className="w-[340px] shrink-0 overflow-y-auto border-r border-ink-200 bg-white">
          {tool === 'dieline' && <DielineDrawer backdrop={backdrop} meta={meta} />}
          {tool === 'surfaces' && <SurfacesDrawer />}
          {tool === 'guides' && <GuidesDrawer show={showGuides} setShow={setShowGuides} trim={trim} safe={safe} />}
          {tool === 'frames' && (
            <FramesDrawer
              layout={layout}
              selected={selected}
              issues={issues}
              onAdd={addFrame}
              onRemove={removeFrame}
              onPatch={patchFrame}
              onSelect={setSelectedId}
            />
          )}
          {tool === 'layers' && <LayersDrawer layout={layout} selectedId={selectedId} onSelect={setSelectedId} onRemove={removeFrame} />}
        </aside>

        {/* ---- Canvas ---- */}
        <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle,#e4e4e7_1px,transparent_1px)] bg-[length:18px_18px] p-8">
          <div style={{ transform: `scale(${zoom})` }} className="transition-transform">
            <div
              ref={artRef}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerDown={() => setSelectedId(null)}
              className="relative h-[640px] w-[440px] select-none rounded-sm bg-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] ring-1 ring-ink-200"
            >
              {/* backdrop */}
              {backdrop.fileUrl && backdrop.isPdf && (
                <embed src={backdrop.fileUrl} type="application/pdf" className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
              )}
              {backdrop.fileUrl && !backdrop.isPdf && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={backdrop.fileUrl} alt="die-line" className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-90" />
              )}
              {!backdrop.fileUrl && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-ink-300">No file uploaded</div>
              )}

              {/* guides */}
              {showGuides.trim && <GuideBox box={trim} color="#ec4899" label="Trim" onPointerDown={(e, m) => onPointerDown(e, 'trim', m)} />}
              {showGuides.safe && <GuideBox box={safe} color="#0ea5e9" label="Safe" dashed onPointerDown={(e, m) => onPointerDown(e, 'safe', m)} />}

              {/* frames */}
              {layout.frames.map((f) => (
                <FrameRect
                  key={f.id}
                  frame={f}
                  selected={selectedId === f.id}
                  onPointerDown={(e, m) => onPointerDown(e, 'frame', m, f.id)}
                />
              ))}
            </div>
          </div>

          {/* bottom zoom toolbar */}
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-1 shadow-sm">
            <IconBtn icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} />
            <span className="w-12 text-center text-[11.5px] tabular-nums text-ink-600">{Math.round(zoom * 100)}%</span>
            <IconBtn icon={ZoomIn} onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} />
            <IconBtn icon={Maximize} onClick={() => setZoom(1)} />
          </div>
        </main>
      </div>
    </div>
  )
}

// =============================================================================
// Canvas primitives
// =============================================================================

function FrameRect({ frame, selected, onPointerDown }: { frame: Frame; selected: boolean; onPointerDown: (e: React.PointerEvent, mode: 'move' | 'resize') => void }) {
  const scope = FRAME_SCOPE[frame.kind]
  const c = SCOPE_COLOR[scope]
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, 'move')}
      style={{ left: `${frame.box.x * 100}%`, top: `${frame.box.y * 100}%`, width: `${frame.box.w * 100}%`, height: `${frame.box.h * 100}%`, borderColor: c.stroke, background: c.fill }}
      className={`absolute cursor-move rounded-[3px] border-2 ${selected ? 'ring-2 ring-offset-1' : ''}`}
    >
      <span style={{ color: c.stroke }} className="pointer-events-none absolute left-1 top-0.5 text-[8.5px] font-semibold uppercase leading-tight tracking-wide">
        {KIND_LABEL[frame.kind]}{!frame.required && ' ·opt'}
      </span>
      {selected && (
        <span
          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, 'resize') }}
          style={{ background: c.stroke }}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full border-2 border-white"
        />
      )}
    </div>
  )
}

function GuideBox({ box, color, label, dashed, onPointerDown }: { box: NormBox; color: string; label: string; dashed?: boolean; onPointerDown: (e: React.PointerEvent, mode: 'move' | 'resize') => void }) {
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, 'move')}
      style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}
      className="absolute cursor-move border"
    >
      <span style={{ color }} className="pointer-events-none absolute right-0.5 top-0.5 text-[8px] font-semibold uppercase">{label}</span>
      <span
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, 'resize') }}
        style={{ background: color }}
        className="absolute -bottom-1 -right-1 h-2.5 w-2.5 cursor-se-resize rounded-full"
      />
    </div>
  )
}

// =============================================================================
// Drawers
// =============================================================================

function DrawerHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="border-b border-ink-100 px-4 py-3">
      <h2 className="font-display text-[14px] font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-[11.5px] text-ink-500">{sub}</p>}
    </div>
  )
}

function DielineDrawer({ backdrop, meta }: { backdrop: DielineBackdrop; meta?: DielineEditorMeta }) {
  return (
    <div>
      <DrawerHead title="Die-line" sub="The uploaded prepress file behind your boxes." />
      <div className="space-y-2 px-4 py-3 text-[12.5px]">
        <Row label="File">{backdrop.fileUrl ? (meta?.format ?? 'file') : '— none —'}</Row>
        <Row label="Width">{meta?.widthMm != null ? `${meta.widthMm} mm` : '—'}</Row>
        <Row label="Height">{meta?.heightMm != null ? `${meta.heightMm} mm` : '—'}</Row>
        <Row label="Bleed">{meta?.bleedMm != null ? `${meta.bleedMm} mm` : '—'}</Row>
        <p className="pt-2 text-[11px] text-ink-500">Replace the file or set dimensions from the Packaging → Die-lines page.</p>
      </div>
    </div>
  )
}

function SurfacesDrawer() {
  return (
    <div>
      <DrawerHead title="Surfaces" sub="Panels on the die-line (front / back / neck)." />
      <div className="px-4 py-3 text-[12px] text-ink-500">
        V1 uses a single primary display panel. Multi-surface support is coming — frames already carry a <code className="font-mono text-[11px]">surfaceId</code>.
      </div>
    </div>
  )
}

function GuidesDrawer({ show, setShow, trim, safe }: { show: { trim: boolean; safe: boolean }; setShow: (s: { trim: boolean; safe: boolean }) => void; trim: NormBox; safe: NormBox }) {
  return (
    <div>
      <DrawerHead title="Guides" sub="Trim + safe area. Drag them on the canvas." />
      <div className="space-y-2.5 px-4 py-3">
        <Toggle label="Trim line" color="#ec4899" on={show.trim} onChange={(v) => setShow({ ...show, trim: v })} />
        <Toggle label="Safe area" color="#0ea5e9" on={show.safe} onChange={(v) => setShow({ ...show, safe: v })} />
        <p className="pt-1 text-[11px] text-ink-500 tabular-nums">
          Trim {(trim.w * 100).toFixed(0)}×{(trim.h * 100).toFixed(0)} · Safe {(safe.w * 100).toFixed(0)}×{(safe.h * 100).toFixed(0)} (% of artboard)
        </p>
      </div>
    </div>
  )
}

function FramesDrawer({ layout, selected, issues, onAdd, onRemove, onPatch, onSelect }: {
  layout: FrameLayout
  selected: Frame | null
  issues: LayoutIssue[]
  onAdd: (k: FrameKind) => void
  onRemove: (id: string) => void
  onPatch: (id: string, p: Partial<Frame>) => void
  onSelect: (id: string) => void
}) {
  const [seeAllScope, setSeeAllScope] = useState<FrameScope | null>(null)
  return (
    <div>
      <DrawerHead title="Frames" sub="Slots for mandatory + packaging elements. Content fills them per scope." />

      {/* Preflight — must clear before the die-line can be confirmed. */}
      <div className={`border-b px-4 py-2.5 ${issues.length === 0 ? 'border-ink-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/60'}`}>
        <p className="text-[12px] font-bold uppercase tracking-wider text-ink-700">Preflight</p>
        {issues.length === 0 ? (
          <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> All required slots placed + in safe area.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {issues.map((iss, i) => (
              <li key={i} className="text-[11.5px] text-amber-800">⚠️ {iss.message}</li>
            ))}
          </ul>
        )}
      </div>

      {/* selected frame editor */}
      {selected && (
        <div className="border-b border-ink-100 bg-zinc-50/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">{KIND_LABEL[selected.kind]}</span>
            <button onClick={() => onRemove(selected.id)} className="text-ink-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <ScopeChip scope={FRAME_SCOPE[selected.kind]} />
          <label className="mt-2 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={selected.required} onChange={(e) => onPatch(selected.id, { required: e.target.checked })} className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600" />
            Required (blocks submit if missing)
          </label>
          {FRAME_SCOPE[selected.kind] === 'MATERIAL' && (
            <input
              defaultValue={(selected.appliesTo?.materials ?? []).join(', ')}
              onBlur={(e) => onPatch(selected.id, { appliesTo: { ...selected.appliesTo, materials: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })}
              placeholder="materials: pet, glass (blank = all)"
              className="mt-2 w-full rounded border border-ink-200 px-2 py-1 text-[11.5px]"
            />
          )}
          {selected.kind === 'CERTIFICATIONS' && (
            <label className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-600">
              <input type="checkbox" checked={Boolean(selected.appliesTo?.requiresCerts)} onChange={(e) => onPatch(selected.id, { appliesTo: { ...selected.appliesTo, requiresCerts: e.target.checked } })} className="h-3.5 w-3.5" />
              only when product has certs
            </label>
          )}
        </div>
      )}

      {/* placed list */}
      <div className="border-b border-ink-100 px-4 py-2">
        <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">On the die-line ({layout.frames.length})</p>
        <ul className="space-y-0.5">
          {layout.frames.map((f) => (
            <li key={f.id}>
              <button onClick={() => onSelect(f.id)} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-ink-50 ${selected?.id === f.id ? 'bg-pink-50' : ''}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: SCOPE_COLOR[FRAME_SCOPE[f.kind]].stroke }} />
                <span className="flex-1 truncate">{KIND_LABEL[f.kind]}</span>
                {f.required && <span className="text-[9px] font-semibold uppercase text-ink-400">req</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* palette — Canva-style slide rails per scope, "See all" drills into the
          full scope grid (Pavel 2026-06-23). */}
      <div className="overflow-x-clip px-4 py-3">
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">Add a frame</p>
        {seeAllScope ? (
          <div>
            <button
              type="button"
              onClick={() => setSeeAllScope(null)}
              className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600 hover:text-ink-900"
            >
              <ChevronLeft className="h-4 w-4" /> All frames
            </button>
            <div className="mb-2"><ScopeChip scope={seeAllScope} /></div>
            <div className="flex flex-wrap gap-1">
              {(PALETTE.find((g) => g.scope === seeAllScope)?.kinds ?? []).map((k) => (
                <FrameChip key={k} kind={k} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ) : (
          PALETTE.map((g) => (
            <ElementRail key={g.scope} label={g.scope} onSeeAll={() => setSeeAllScope(g.scope)}>
              {g.kinds.map((k) => (
                <FrameChip key={k} kind={k} onAdd={onAdd} rail />
              ))}
            </ElementRail>
          ))
        )}
      </div>
    </div>
  )
}

function LayersDrawer({ layout, selectedId, onSelect, onRemove }: { layout: FrameLayout; selectedId: string | null; onSelect: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div>
      <DrawerHead title="Layers" sub="Every frame on the die-line." />
      <ul className="px-2 py-2">
        {layout.frames.map((f) => (
          <li key={f.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-[12px] ${selectedId === f.id ? 'bg-pink-50' : 'hover:bg-ink-50'}`}>
            <button onClick={() => onSelect(f.id)} className="flex flex-1 items-center gap-2 text-left">
              <span className="h-2 w-2 rounded-full" style={{ background: SCOPE_COLOR[FRAME_SCOPE[f.kind]].stroke }} />
              <span className="flex-1 truncate">{KIND_LABEL[f.kind]}</span>
            </button>
            <button onClick={() => onRemove(f.id)} className="text-ink-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// =============================================================================
// Small bits
// =============================================================================

function RailButton({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors ${active ? 'bg-pink-50 text-pink-700' : 'text-ink-500 hover:bg-ink-50'}`}>
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}

function IconBtn({ icon: Icon, onClick }: { icon: React.ComponentType<{ className?: string }>; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-full p-1.5 text-ink-600 hover:bg-ink-100"><Icon className="h-4 w-4" /></button>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] uppercase tracking-wider text-ink-700">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

function Toggle({ label, color, on, onChange }: { label: string; color: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px]">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 rounded border-ink-300" />
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </label>
  )
}

function ScopeChip({ scope }: { scope: FrameScope }) {
  return <span className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider ${SCOPE_COLOR[scope].chip}`}>{scope}</span>
}

function FrameChip({ kind, onAdd, rail }: { kind: FrameKind; onAdd: (k: FrameKind) => void; rail?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(kind)}
      className={
        'inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] hover:border-pink-300 hover:bg-pink-50 ' +
        (rail ? 'shrink-0 snap-start whitespace-nowrap' : '')
      }
    >
      <Plus className="h-3 w-3" /> {KIND_LABEL[kind]}
    </button>
  )
}
