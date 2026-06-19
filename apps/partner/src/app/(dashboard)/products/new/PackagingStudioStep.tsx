'use client'

// =============================================================================
// Step 4 — Packaging Studio. Renders INLINE on the builder page (not behind a
// launch button) so the partner immediately sees a Design-Studio-shaped surface
// (docs/DESIGN_STUDIO_REBUILD §3 + docs/prototypes/new-product-flow.html Step 4):
//
//   Top bar · Left tool rail (Library · Frames · Guides · Layers) · slide-out
//   Drawer · Center canvas (3D package  ⇄  inline die-line frame editor) · Bottom
//   zoom toolbar.   An Expand control pops the same shell full-screen.
//
// The die-line frame editor is INLINE (not a link-out): it reuses the shared
// frame model from @ilaunchify/ui and persists through the same die-line actions
// the standalone Die-line Studio uses (loadDieline / saveDielineFrames /
// saveDielineGeometry / confirmDieline). three.js loads from the CDN at runtime
// via ./packaging-3d (no npm dependency).
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Inbox,
  Shapes,
  SquareDashedBottom,
  Layers as LayersIcon,
  Check,
  CircleCheck,
  ZoomIn,
  ZoomOut,
  Maximize,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  Box as BoxIcon,
  PencilRuler,
  Upload,
  Lock,
} from 'lucide-react'
import {
  DEFAULT_FRAME_LAYOUT,
  FRAME_SCOPE,
  validateFrameLayout,
  type Frame,
  type FrameKind,
  type FrameLayout,
  type FrameScope,
  type LayoutIssue,
  type NormBox,
} from '@ilaunchify/ui'
import { PACKAGING_DEFS, createPackagingScene, type TopologyKey, type PackagingSceneHandle, type StudioSurfaceDef } from './packaging-3d'
import { loadPackagingStudio, type PackagingStudioData, type StudioPackaging } from './packaging-studio-actions'
import {
  loadDieline,
  saveDielineFrames,
  saveDielineGeometry,
  confirmDieline,
  type DielineEditorData,
} from '../../packaging/dielines/actions'

type Tool = 'library' | 'frames' | 'guides' | 'layers'

function toStudioTopology(enumValue: string | undefined): TopologyKey {
  if (enumValue === 'CAPSULE_JAR') return 'jar'
  if (enumValue === 'MULTI_CONTAINER_BOX' || enumValue === 'CASE') return 'box'
  return 'can'
}

const SCOPE_COLOR: Record<FrameScope, { stroke: string; fill: string; chip: string }> = {
  RECIPE: { stroke: '#059669', fill: 'rgba(5,150,105,0.08)', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MATERIAL: { stroke: '#0284c7', fill: 'rgba(2,132,199,0.08)', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  PRODUCT: { stroke: '#7c3aed', fill: 'rgba(124,58,237,0.08)', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  IDENTITY: { stroke: '#d97706', fill: 'rgba(217,119,6,0.08)', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  CREATIVE: { stroke: '#52525b', fill: 'rgba(82,82,91,0.06)', chip: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
}

const KIND_LABEL: Record<FrameKind, string> = {
  NUTRITION_FACTS: 'Nutrition Facts',
  INGREDIENTS: 'Ingredients',
  ALLERGENS: 'Allergens',
  STATEMENT_OF_IDENTITY: 'Statement of Identity',
  NET_QUANTITY: 'Net Quantity',
  MANUFACTURER: 'Manufacturer',
  BARCODE: 'Barcode',
  RECYCLING_MARK: 'Recycling Mark',
  COMPOSTABILITY: 'Compostability',
  DISPOSAL: 'Disposal',
  CERTIFICATIONS: 'Certifications',
  PHRASES: 'Mandatory Phrases',
  LABELING_SYMBOL: 'Labeling Symbol',
  LOGO: 'Logo',
  IMAGERY: 'Imagery',
  CUSTOM: 'Custom',
}

const PALETTE: { scope: FrameScope; kinds: FrameKind[] }[] = [
  { scope: 'IDENTITY', kinds: ['STATEMENT_OF_IDENTITY', 'NET_QUANTITY', 'MANUFACTURER', 'BARCODE'] },
  { scope: 'RECIPE', kinds: ['NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS'] },
  { scope: 'MATERIAL', kinds: ['RECYCLING_MARK', 'COMPOSTABILITY', 'DISPOSAL'] },
  { scope: 'PRODUCT', kinds: ['CERTIFICATIONS', 'PHRASES', 'LABELING_SYMBOL'] },
  { scope: 'CREATIVE', kinds: ['LOGO', 'IMAGERY', 'CUSTOM'] },
]

function asBox(v: unknown, fallback: NormBox): NormBox {
  const b = v as Partial<NormBox> | null
  if (b && typeof b.x === 'number' && typeof b.y === 'number' && typeof b.w === 'number' && typeof b.h === 'number') {
    return { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  return fallback
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
let _id = 0
const newFrameId = (k: string) => `f_${k}_${Date.now()}_${_id++}`

export function PackagingStudioStep({ draftId, onNext, nextLabel = 'Next step →' }: { draftId: string | null; onNext?: () => void; nextLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<PackagingSceneHandle | null>(null)

  const [data, setData] = useState<PackagingStudioData | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [view, setView] = useState<'3d' | 'die'>('die')
  const [tool, setTool] = useState<Tool>('frames')
  const [topology, setTopology] = useState<TopologyKey>('can')
  const [activeSystemId, setActiveSystemId] = useState<string | null>(null)
  const [selectedSurfaceKey, setSelectedSurfaceKey] = useState<string | null>(null)
  const [sceneError, setSceneError] = useState<string | null>(null)

  // ---- die-line editor state (inline) ----
  const [ded, setDed] = useState<DielineEditorData | null>(null)
  const [loadingDieline, setLoadingDieline] = useState(false)
  const [layout, setLayout] = useState<FrameLayout>(() => structuredClone(DEFAULT_FRAME_LAYOUT))
  const [trim, setTrim] = useState<NormBox>({ x: 0, y: 0, w: 1, h: 1 })
  const [safe, setSafe] = useState<NormBox>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })
  const [showGuides, setShowGuides] = useState({ trim: true, safe: true })
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('saved')
  const [confirmed, setConfirmed] = useState(false)

  const artRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ kind: 'frame' | 'trim' | 'safe'; id?: string; mode: 'move' | 'resize'; startX: number; startY: number; startBox: NormBox } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load attached packaging + the partner's die-lines (for the library + resolution).
  useEffect(() => {
    if (!draftId) return
    let alive = true
    void loadPackagingStudio(draftId).then((r) => {
      if (!alive) return
      if (r.ok) {
        setData(r.data)
        const firstTyped = r.data.attached.find((a) => a.packagingTypeId) ?? r.data.attached[0]
        if (firstTyped) {
          setActiveSystemId(firstTyped.systemId)
          setTopology(toStudioTopology(firstTyped.topology))
        }
      }
    })
    return () => { alive = false }
  }, [draftId])

  // Resolve the active packaging + its die-line (by PackagingType, the V1 rule).
  const activeSystem = useMemo<StudioPackaging | null>(
    () => data?.attached.find((a) => a.systemId === activeSystemId) ?? data?.attached.find((a) => a.packagingTypeId) ?? data?.attached[0] ?? null,
    [data, activeSystemId],
  )
  const resolvedDieline = useMemo(
    () => (activeSystem?.packagingTypeId ? (data?.dielines ?? []).find((d) => d.packagingTypeId === activeSystem.packagingTypeId) ?? null : null),
    [data, activeSystem],
  )
  const resolvedDielineId = resolvedDieline?.id ?? null

  // Spin up / tear down the three.js scene only while the 3D view is showing.
  // Re-inits when toggling fullscreen (the canvas element remounts).
  useEffect(() => {
    if (view !== '3d') return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setSceneError(null)
    createPackagingScene(canvas, {
      topology,
      onSelect: (key) => { if (!cancelled) setSelectedSurfaceKey(key) },
    })
      .then((h) => { if (cancelled) { h.dispose(); return } handleRef.current = h; h.setFold(true) })
      .catch(() => { if (!cancelled) setSceneError('3D preview could not load. Check your connection and retry.') })
    return () => { cancelled = true; handleRef.current?.dispose(); handleRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, fullscreen])

  useEffect(() => { if (view === '3d') handleRef.current?.setTopology(topology) }, [topology, view])

  // Load the resolved die-line into the inline editor whenever it changes.
  useEffect(() => {
    if (!resolvedDielineId) { setDed(null); return }
    if (ded?.id === resolvedDielineId) return
    let alive = true
    setLoadingDieline(true)
    void loadDieline(resolvedDielineId).then((r) => {
      if (!alive) return
      setLoadingDieline(false)
      if (!r.ok) { toast.error(r.error); return }
      const d = r.data
      setDed(d)
      setLayout((d.frames as FrameLayout) ?? structuredClone(DEFAULT_FRAME_LAYOUT))
      setTrim(asBox(d.trimBox, { x: 0, y: 0, w: 1, h: 1 }))
      setSafe(asBox(d.safeAreaBox, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }))
      setConfirmed(d.status === 'PARTNER_CONFIRMED' || d.status === 'ADMIN_VERIFIED' || d.status === 'ACTIVE')
      setSelectedFrameId(null)
      setSaveStatus('saved')
    })
    return () => { alive = false }
  }, [resolvedDielineId, ded?.id])

  // Esc collapses full-screen; lock body scroll only while full-screen.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [fullscreen])

  // ---- autosave (debounced) ----
  const queueSave = useCallback((nextLayout: FrameLayout, nextTrim: NormBox, nextSafe: NormBox) => {
    if (!resolvedDielineId) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const [a, b] = await Promise.all([
        saveDielineFrames(resolvedDielineId, nextLayout),
        saveDielineGeometry(resolvedDielineId, { trimBox: nextTrim, safeAreaBox: nextSafe }),
      ])
      setSaveStatus(a.ok && b.ok ? 'saved' : 'idle')
      if (!a.ok) toast.error(a.error)
    }, 700)
  }, [resolvedDielineId])

  const commit = useCallback((nextLayout: FrameLayout, nextTrim = trim, nextSafe = safe) => {
    setLayout(nextLayout)
    queueSave(nextLayout, nextTrim, nextSafe)
  }, [queueSave, trim, safe])

  // ---- drag handlers (normalized 0..1 over the artboard) ----
  const onPointerDown = (e: React.PointerEvent, kind: 'frame' | 'trim' | 'safe', mode: 'move' | 'resize', id?: string) => {
    e.stopPropagation()
    const box = kind === 'frame' ? layout.frames.find((f) => f.id === id)?.box : kind === 'trim' ? trim : safe
    if (!box) return
    dragRef.current = { kind, id, mode, startX: e.clientX, startY: e.clientY, startBox: { ...box } }
    if (kind === 'frame' && id) setSelectedFrameId(id)
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
    setSelectedFrameId(f.id)
    setTool('frames')
  }

  const removeFrame = (id: string) => {
    commit({ ...layout, frames: layout.frames.filter((f) => f.id !== id) })
    if (selectedFrameId === id) setSelectedFrameId(null)
  }

  const patchFrame = (id: string, patch: Partial<Frame>) => {
    commit({ ...layout, frames: layout.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }

  const selectedFrame = useMemo(() => layout.frames.find((f) => f.id === selectedFrameId) ?? null, [layout, selectedFrameId])
  const issues = useMemo<LayoutIssue[]>(() => (resolvedDielineId ? validateFrameLayout(layout, { safeArea: safe }) : []), [layout, safe, resolvedDielineId])

  async function onConfirm() {
    if (!resolvedDielineId) return
    if (issues.length > 0) {
      toast.error(`Fix ${issues.length} preflight issue${issues.length === 1 ? '' : 's'} first.`)
      return
    }
    const r = await confirmDieline(resolvedDielineId)
    if (!r.ok) { toast.error(r.error); return }
    setConfirmed(true)
    toast.success('Die-line confirmed')
  }

  const surfaces = PACKAGING_DEFS[topology].surfaces

  // ---------------------------------------------------------------------------
  // The studio shell — rendered once, placed either inline or in the full-screen
  // portal. Same chrome as the creator Design Studio.
  // ---------------------------------------------------------------------------
  const shell = (
    <div className="flex h-full min-h-0 w-full flex-col bg-zinc-100 font-sans text-ink-900">
      {/* ---- Top bar ---- */}
      <header className="flex h-[56px] shrink-0 items-center justify-between gap-3 border-b border-ink-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-pink-500 text-[12px] font-extrabold text-white">iL</span>
          <div className="min-w-0">
            <div className="font-display text-[13.5px] font-bold leading-tight tracking-tight">Packaging Studio</div>
            <div className="truncate text-[11px] leading-tight text-ink-500">{activeSystem ? activeSystem.name : draftId ? 'No packaging attached yet' : 'Save the draft to begin'}{activeSystem?.packagingTypeName ? ` · ${activeSystem.packagingTypeName}` : ''}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle — 3D package ⇄ inline die-line editor */}
          <div className="inline-flex rounded-full border border-ink-200 bg-white p-0.5">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === '3d' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'}`}>
              <BoxIcon className="h-3.5 w-3.5" /> 3D
            </button>
            <button type="button" aria-pressed={view === 'die'} onClick={() => setView('die')} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === 'die' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'}`}>
              <PencilRuler className="h-3.5 w-3.5" /> Die-line
            </button>
          </div>

          {resolvedDielineId && (
            <>
              <span className="ml-1 hidden items-center gap-1 text-[11.5px] text-ink-500 sm:flex">
                {saveStatus === 'saving' ? 'Saving…' : (<><Check className="h-3.5 w-3.5 text-emerald-600" /> Saved</>)}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${issues.length === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
                title={issues.map((i) => i.message).join('\n')}
              >
                {issues.length === 0 ? 'Preflight clear' : `${issues.length} to fix`}
              </span>
              <button type="button" onClick={onConfirm} disabled={confirmed || issues.length > 0} className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50">
                <CircleCheck className="h-4 w-4" /> {confirmed ? 'Confirmed' : 'Confirm die-line'}
              </button>
            </>
          )}

          <button type="button" onClick={() => setFullscreen((v) => !v)} aria-label={fullscreen ? 'Collapse studio' : 'Expand studio full screen'} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 hover:bg-ink-50">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {onNext && (
            <button type="button" className="ml-0.5 inline-flex items-center rounded-full bg-ink-900 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-black" onClick={() => { setFullscreen(false); onNext() }}>{nextLabel}</button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- Left tool rail ---- */}
        <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-ink-200 bg-white py-3" role="toolbar" aria-label="Studio tools">
          <RailButton icon={Inbox} label="Library" active={tool === 'library'} onClick={() => setTool('library')} />
          <RailButton icon={Shapes} label="Frames" active={tool === 'frames'} onClick={() => setTool('frames')} />
          <RailButton icon={SquareDashedBottom} label="Guides" active={tool === 'guides'} onClick={() => setTool('guides')} />
          <RailButton icon={LayersIcon} label="Layers" active={tool === 'layers'} onClick={() => setTool('layers')} />
        </nav>

        {/* ---- Drawer ---- */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-ink-200 bg-white">
          {tool === 'library' && (
            <LibraryDrawer
              attached={data?.attached ?? []}
              dielines={data?.dielines ?? []}
              activeSystemId={activeSystem?.systemId ?? null}
              onPick={(id) => { setActiveSystemId(id); const sys = data?.attached.find((a) => a.systemId === id); if (sys) setTopology(toStudioTopology(sys.topology)) }}
              surfaces={surfaces}
              selectedSurfaceKey={selectedSurfaceKey}
              onSelectSurface={(k) => { setSelectedSurfaceKey(k); handleRef.current?.select(k) }}
              hasDraft={Boolean(draftId)}
            />
          )}
          {tool === 'frames' && (
            resolvedDielineId ? (
              <FramesDrawer layout={layout} selected={selectedFrame} issues={issues} onAdd={addFrame} onRemove={removeFrame} onPatch={patchFrame} onSelect={setSelectedFrameId} />
            ) : (
              <NoDielineDrawer />
            )
          )}
          {tool === 'guides' && <GuidesDrawer show={showGuides} setShow={setShowGuides} trim={trim} safe={safe} disabled={!resolvedDielineId} />}
          {tool === 'layers' && <LayersDrawer layout={layout} selectedId={selectedFrameId} onSelect={setSelectedFrameId} onRemove={removeFrame} />}
        </aside>

        {/* ---- Canvas ---- */}
        <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto">
          {!draftId ? (
            <div className="max-w-sm rounded-2xl border border-dashed border-ink-300 bg-white/70 p-8 text-center">
              <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-50 text-ink-400"><Lock className="h-5 w-5" /></div>
              <div className="text-[13.5px] font-semibold text-ink-800">Save your draft to start designing</div>
              <p className="mx-auto mt-1.5 max-w-[18rem] text-[12px] leading-relaxed text-ink-500">Finish Basics (or hit “Save draft”) and your attached packaging + die-lines load here automatically.</p>
            </div>
          ) : view === '3d' ? (
            <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,#fff,#eceef0_70%,#e2e4e7)]">
              <canvas ref={canvasRef} className="block h-full w-full" />
              {sceneError
                ? <div className="absolute bottom-4 left-4 rounded-lg border border-pink-100 bg-pink-50 px-3 py-1.5 text-[11.5px] text-pink-700">{sceneError}</div>
                : <div className="absolute bottom-4 left-4 rounded-lg border border-ink-200 bg-white/80 px-3 py-1.5 text-[11.5px] text-ink-500">Drag to orbit · scroll to zoom · click a pink surface, then switch to Die-line to lay its frames</div>}
              <div className="absolute right-4 top-4 flex gap-3 rounded-lg border border-ink-200 bg-white/80 px-2.5 py-1.5 text-[11px] text-ink-500">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-pink-500" /> Decorable</span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-ink-400" /> Non-printed</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[radial-gradient(circle,#e4e4e7_1px,transparent_1px)] bg-[length:18px_18px] p-8">
              {loadingDieline ? (
                <div className="text-[12.5px] text-ink-400">Loading die-line…</div>
              ) : !resolvedDielineId ? (
                <div className="max-w-sm rounded-2xl border border-dashed border-ink-300 bg-white/70 p-8 text-center">
                  <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-50 text-ink-400"><PencilRuler className="h-5 w-5" /></div>
                  <div className="text-[13.5px] font-semibold text-ink-800">No die-line for this packaging yet</div>
                  <p className="mx-auto mt-1.5 max-w-[16rem] text-[12px] leading-relaxed text-ink-500">
                    {activeSystem?.packagingTypeName ? `Upload or create a die-line of type "${activeSystem.packagingTypeName}" to lay its mandatory-element frames.` : 'Attach a typed packaging system, then add a die-line to start laying frames.'}
                  </p>
                  <Link href="/packaging/dielines/new" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-pink-700">
                    <Upload className="h-3.5 w-3.5" /> Upload / create a die-line
                  </Link>
                </div>
              ) : (
                <div style={{ transform: `scale(${zoom})` }} className="transition-transform">
                  <div
                    ref={artRef}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerDown={() => setSelectedFrameId(null)}
                    className="relative h-[560px] w-[392px] select-none rounded-sm bg-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] ring-1 ring-ink-200"
                  >
                    {/* backdrop */}
                    {ded?.fileUrl && ded.originalFileFormat === 'PDF' && (
                      <embed src={ded.fileUrl} type="application/pdf" className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
                    )}
                    {ded?.fileUrl && ded.originalFileFormat !== 'PDF' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ded.fileUrl} alt="die-line" className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-90" />
                    )}
                    {!ded?.fileUrl && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-ink-300">No file uploaded — frames still save</div>
                    )}

                    {/* guides */}
                    {showGuides.trim && <GuideBox box={trim} color="#ec4899" label="Trim" onPointerDown={(e, m) => onPointerDown(e, 'trim', m)} />}
                    {showGuides.safe && <GuideBox box={safe} color="#0ea5e9" label="Safe" dashed onPointerDown={(e, m) => onPointerDown(e, 'safe', m)} />}

                    {/* frames */}
                    {layout.frames.map((f) => (
                      <FrameRect key={f.id} frame={f} selected={selectedFrameId === f.id} onPointerDown={(e, m) => onPointerDown(e, 'frame', m, f.id)} />
                    ))}
                  </div>
                </div>
              )}

              {/* bottom zoom toolbar */}
              {resolvedDielineId && !loadingDieline && (
                <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-1 shadow-sm">
                  <IconBtn icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} />
                  <span className="w-12 text-center text-[11.5px] tabular-nums text-ink-600">{Math.round(zoom * 100)}%</span>
                  <IconBtn icon={ZoomIn} onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} />
                  <IconBtn icon={Maximize} onClick={() => setZoom(1)} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )

  return (
    <div>
      <div className="banner">
        ℹ︎ <b>Platform library is the default.</b> Admin curates 3D mockups + normalized die-lines. Custom uploads route to an admin verification queue; the product can&apos;t go LIVE until die-lines are verified.
      </div>

      {/* Inline studio — full Design-Studio chrome embedded in the step. */}
      {!fullscreen && (
        <div className="mt-3.5 h-[78vh] min-h-[520px] overflow-hidden rounded-2xl border border-ink-200">
          {shell}
        </div>
      )}

      {/* Full-screen — same shell, portaled out of the builder layout. */}
      {fullscreen && typeof document !== 'undefined'
        ? createPortal(<div className="fixed inset-0 z-[80]">{shell}</div>, document.body)
        : null}
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
      <div className="font-display text-[14px] font-semibold">{title}</div>
      {sub && <p className="mt-0.5 text-[11.5px] text-ink-500">{sub}</p>}
    </div>
  )
}

function LibraryDrawer({
  attached,
  dielines,
  activeSystemId,
  onPick,
  surfaces,
  selectedSurfaceKey,
  onSelectSurface,
  hasDraft,
}: {
  attached: StudioPackaging[]
  dielines: { id: string; packagingTypeId: string; decorationMethod: string; status: string }[]
  activeSystemId: string | null
  onPick: (systemId: string) => void
  surfaces: StudioSurfaceDef[]
  selectedSurfaceKey: string | null
  onSelectSurface: (key: string) => void
  hasDraft: boolean
}) {
  return (
    <div>
      <DrawerHead title="Library" sub="The packaging attached to this product. Pick one to design its die-line." />
      <div className="space-y-1.5 px-3 py-3">
        {!hasDraft && <p className="px-1 text-[12px] text-ink-500">Save the draft to load your attached packaging.</p>}
        {hasDraft && attached.length === 0 && <p className="px-1 text-[12px] text-ink-500">No packaging attached. Attach one in the Packaging systems card above.</p>}
        {attached.map((a) => {
          const hasDie = a.packagingTypeId ? dielines.some((d) => d.packagingTypeId === a.packagingTypeId) : false
          const on = a.systemId === activeSystemId
          return (
            <button
              key={a.systemId}
              type="button"
              onClick={() => onPick(a.systemId)}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 hover:border-pink-200 hover:bg-pink-50/40'}`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${on ? 'bg-pink-500 text-white' : 'bg-ink-50 text-ink-500'}`}><BoxIcon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-ink-900">{a.name}</span>
                <span className="block truncate text-[11px] text-ink-500">{a.packagingTypeName ?? a.topology}</span>
              </span>
              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${hasDie ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-ink-200 bg-white text-ink-400'}`}>{hasDie ? 'die-line ✓' : 'no die-line'}</span>
            </button>
          )
        })}
      </div>

      <div className="border-t border-ink-100 px-3 py-3">
        <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Surfaces (3D)</p>
        <div className="space-y-1">
          {surfaces.map((s) => {
            const on = s.key === selectedSurfaceKey
            return (
              <button
                key={s.key}
                type="button"
                disabled={!s.decorable}
                onClick={() => s.decorable && onSelectSurface(s.key)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors disabled:opacity-50 ${on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 hover:border-pink-200 hover:bg-pink-50/40'}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.decorable ? '#FF2E63' : '#9A9CA6' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-800">{s.label}</span>
                  <span className="block truncate text-[10.5px] text-ink-500">role: {s.role}{s.defaultBleedMm ? ` · bleed ${s.defaultBleedMm}mm` : ''}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NoDielineDrawer() {
  return (
    <div>
      <DrawerHead title="Frames" sub="Slots for mandatory + packaging elements." />
      <div className="px-4 py-4 text-[12px] leading-relaxed text-ink-500">
        Pick a packaging with a die-line in the <b>Library</b> tab to start placing frames — or upload a die-line from the Die-line view.
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
  return (
    <div>
      <DrawerHead title="Frames" sub="Slots for mandatory + packaging elements. Content fills them per scope." />

      {/* Preflight — must clear before the die-line can be confirmed. */}
      <div className={`border-b px-4 py-2.5 ${issues.length === 0 ? 'border-ink-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/60'}`}>
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Preflight</p>
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
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">On the die-line ({layout.frames.length})</p>
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

      {/* palette */}
      <div className="px-4 py-3">
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Add a frame</p>
        {PALETTE.map((g) => (
          <div key={g.scope} className="mb-2">
            <ScopeChip scope={g.scope} />
            <div className="mt-1 flex flex-wrap gap-1">
              {g.kinds.map((k) => (
                <button key={k} onClick={() => onAdd(k)} className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] hover:border-pink-300 hover:bg-pink-50">
                  <Plus className="h-3 w-3" /> {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GuidesDrawer({ show, setShow, trim, safe, disabled }: { show: { trim: boolean; safe: boolean }; setShow: (s: { trim: boolean; safe: boolean }) => void; trim: NormBox; safe: NormBox; disabled?: boolean }) {
  return (
    <div>
      <DrawerHead title="Guides" sub="Trim + safe area. Drag them on the die-line canvas." />
      {disabled ? (
        <div className="px-4 py-4 text-[12px] text-ink-500">Guides appear once a die-line is loaded.</div>
      ) : (
        <div className="space-y-2.5 px-4 py-3">
          <Toggle label="Trim line" color="#ec4899" on={show.trim} onChange={(v) => setShow({ ...show, trim: v })} />
          <Toggle label="Safe area" color="#0ea5e9" on={show.safe} onChange={(v) => setShow({ ...show, safe: v })} />
          <p className="pt-1 text-[11px] text-ink-500 tabular-nums">
            Trim {(trim.w * 100).toFixed(0)}×{(trim.h * 100).toFixed(0)} · Safe {(safe.w * 100).toFixed(0)}×{(safe.h * 100).toFixed(0)} (% of artboard)
          </p>
        </div>
      )}
    </div>
  )
}

function LayersDrawer({ layout, selectedId, onSelect, onRemove }: { layout: FrameLayout; selectedId: string | null; onSelect: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div>
      <DrawerHead title="Layers" sub="Every frame on the die-line." />
      <ul className="px-2 py-2">
        {layout.frames.length === 0 && <li className="px-2 py-2 text-[12px] text-ink-500">No frames yet.</li>}
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
    <button onClick={onClick} className={`flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors ${active ? 'bg-pink-50 text-pink-700' : 'text-ink-500 hover:bg-ink-50'}`} aria-pressed={active}>
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}

function IconBtn({ icon: Icon, onClick }: { icon: React.ComponentType<{ className?: string }>; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-full p-1.5 text-ink-600 hover:bg-ink-100"><Icon className="h-4 w-4" /></button>
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
