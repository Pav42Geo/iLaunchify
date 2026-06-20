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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  Plus,
  Trash2,
  Box as BoxIcon,
  PencilRuler,
  Upload,
  Lock,
  Undo2,
  Redo2,
  Menu,
  ArrowLeft,
  Search,
  Save,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
} from 'lucide-react'
import {
  DEFAULT_FRAME_LAYOUT,
  FRAME_SCOPE,
  validateFrameLayout,
  SavedIndicator,
  VersionHistoryDrawer,
  type SnapshotItem,
  type Frame,
  type FrameKind,
  type FrameLayout,
  type FrameScope,
  type LayoutIssue,
  type NormBox,
} from '@ilaunchify/ui'
import { PACKAGING_DEFS, createPackagingScene, type TopologyKey, type PackagingSceneHandle, type StudioSurfaceDef } from './packaging-3d'
import { loadPackagingStudio, loadPackagingCatalog, attachCatalogType, submitPackagingForReview, type PackagingStudioData, type StudioPackaging, type CatalogItem } from './packaging-studio-actions'
import { listDraftSnapshots } from './snapshot-actions'
import { loadPackaging } from './build-actions'
import { addPackagingLink, removePackagingLink } from '../[id]/edit/card-actions'
import {
  loadDieline,
  saveDielineFrames,
  saveDielineGeometry,
  confirmDieline,
  type DielineEditorData,
} from '../../packaging/dielines/actions'

export interface StudioPackagingOption { id: string; partnerName: string; topology: string; unitCount: number; moq: number }

type Tool = 'library' | 'frames' | 'guides' | 'layers'

function toStudioTopology(enumValue: string | undefined): TopologyKey {
  if (enumValue === 'CAPSULE_JAR') return 'jar'
  if (enumValue === 'MULTI_CONTAINER_BOX' || enumValue === 'CASE') return 'box'
  return 'can'
}

// Map an admin ContainerCategory → the studio's 3D topology (can/jar/box).
function catalogTopologyKey(category: string): TopologyKey {
  if (category === 'JAR' || category === 'TUBE') return 'jar'
  if (category === 'BOX' || category === 'CARTON' || category === 'CASE') return 'box'
  return 'can'
}

const CATEGORY_LABEL: Record<string, string> = {
  BOTTLE: 'Bottles', JAR: 'Jars', CAN: 'Cans', TUBE: 'Tubes', POUCH: 'Pouches',
  SACHET: 'Sachets', STICK_PACK: 'Stick packs', BOX: 'Boxes', CARTON: 'Cartons',
  CASE: 'Cases', OTHER: 'Other',
}
const CATEGORY_ORDER = ['BOTTLE', 'JAR', 'CAN', 'TUBE', 'POUCH', 'SACHET', 'STICK_PACK', 'BOX', 'CARTON', 'CASE', 'OTHER']
const RECENT_SEARCH_KEY = 'ilf:pkgStudio:recentSearch'

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

export function PackagingStudioStep({ draftId, systems = [], onNext, onBack, onSaveDraft, nextLabel = 'Next step →', headerRight }: { draftId: string | null; systems?: StudioPackagingOption[]; onNext?: () => void; onBack?: () => void; onSaveDraft?: () => void; nextLabel?: string; headerRight?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<PackagingSceneHandle | null>(null)

  const [data, setData] = useState<PackagingStudioData | null>(null)
  // 3D is the default view (its toggle reads black/active); switching to Die-line
  // loads the Fabric.js-style die-line canvas (existing die-lines) or the
  // add-a-die-line CTA when the attached packaging has none yet.
  const [view, setView] = useState<'3d' | 'die'>('3d')
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

  // ---- chrome: history drawer, version snapshots, undo/redo, menu, library tab ----
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([])
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [past, setPast] = useState<FrameLayout[]>([])
  const [future, setFuture] = useState<FrameLayout[]>([])
  const [libTab, setLibTab] = useState<'library' | 'my'>('library')
  const [librarySearch, setLibrarySearch] = useState('')
  const [attached, setAttached] = useState<string[]>([])
  const [busyAttach, setBusyAttach] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [busyCatalog, setBusyCatalog] = useState<string | null>(null)
  const [busyReview, setBusyReview] = useState<string | null>(null)

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
  }, [view])

  useEffect(() => { if (view === '3d') handleRef.current?.setTopology(topology) }, [topology, view])

  // Load which packaging is already attached (for the Library → My tab toggles).
  const refreshAttached = useCallback(() => { if (draftId) void loadPackaging(draftId).then(setAttached) }, [draftId])
  useEffect(() => { refreshAttached() }, [refreshAttached])

  function toggleAttach(id: string, on: boolean) {
    if (!draftId) return
    setBusyAttach(id)
    void (on
      ? addPackagingLink({ productTemplateId: draftId, packagingSystemId: id, basePriceCents: 0, leadTimeDays: 21 })
      : removePackagingLink({ productTemplateId: draftId, packagingSystemId: id })
    ).then((r) => {
      setBusyAttach(null)
      if (!r.ok) { toast.error(r.error ?? 'Could not update'); return }
      toast.success(on ? 'Packaging attached' : 'Packaging removed')
      refreshAttached()
      if (draftId) void loadPackagingStudio(draftId).then((res) => { if (res.ok) setData(res.data) })
    })
  }

  const loadHistory = useCallback(async () => {
    if (!draftId) return
    const rows = await listDraftSnapshots(draftId)
    setSnapshots(rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, pinned: r.pinned, createdAt: new Date(r.createdAt), thumbnail: r.thumbnail })))
  }, [draftId])

  // Admin packaging catalog (Library tab) — load once.
  useEffect(() => { void loadPackagingCatalog().then(setCatalog) }, [])

  // "Use this packaging" from the catalog → find-or-create a partner system + attach.
  function onUseCatalog(packagingTypeId: string) {
    if (!draftId) { toast.error('Save the draft first.'); return }
    setBusyCatalog(packagingTypeId)
    void attachCatalogType(draftId, packagingTypeId).then((r) => {
      setBusyCatalog(null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Packaging added')
      refreshAttached()
      void loadPackagingStudio(draftId).then((res) => { if (res.ok) { setData(res.data); setActiveSystemId(r.systemId) } })
      setLibTab('my')
    })
  }

  // Submit a custom (non-catalog) packaging for admin catalog review.
  function onSubmitReview(systemId: string) {
    setBusyReview(systemId)
    void submitPackagingForReview(systemId).then((r) => {
      setBusyReview(null)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Submitted for catalog review — admin will prep mockups and publish it.')
      if (draftId) void loadPackagingStudio(draftId).then((res) => { if (res.ok) setData(res.data) })
    })
  }

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

  // Studio is full-screen while mounted (Step 4) — lock body scroll; Esc clears
  // the frame selection.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedFrameId(null) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [])

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
    setPast((p) => [...p.slice(-49), layout])
    setFuture([])
    setLayout(nextLayout)
    setLastSavedAt(new Date())
    queueSave(nextLayout, nextTrim, nextSafe)
  }, [queueSave, trim, safe, layout])

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]!
      setFuture((f) => [layout, ...f])
      setLayout(prev)
      queueSave(prev, trim, safe)
      return p.slice(0, -1)
    })
  }, [layout, queueSave, trim, safe])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const next = f[0]!
      setPast((p) => [...p, layout])
      setLayout(next)
      queueSave(next, trim, safe)
      return f.slice(1)
    })
  }, [layout, queueSave, trim, safe])

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
      {/* ---- Top bar — pixel-matches the standard AppHeader topbar (same brand
           mark, py-3 pl-7 pr-6, gap-5, bell-driven height) so nothing shifts
           when stepping from 3 → 4. Only addition: the 3D⇄Die-line toggle. ---- */}
      <header className="flex shrink-0 items-center gap-5 border-b border-ink-200 bg-white py-3 pl-7 pr-6">
        {/* Brand mark — identical to AppHeaderBrandMark (pink 26px square + iLaunchify wordmark). */}
        <span className="flex flex-shrink-0 items-center gap-[7px]">
          <span aria-hidden="true" className="h-[26px] w-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-[23px] font-extrabold tracking-[-0.04em] text-ink-900">iLaunchify</span>
        </span>

        {/* Center cluster — same as gb-topbar-center: ☰ menu + Saved/History. */}
        <span className="inline-flex items-center gap-2">
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Studio menu" className="grid h-8 w-8 place-items-center rounded-[9px] border border-ink-200 bg-white text-ink-700 transition-colors hover:bg-ink-50">
              <Menu className="h-[18px] w-[18px]" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-10 z-50 w-60 rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg">
                  <div className="px-2.5 py-1.5 text-[11px] leading-snug text-ink-500">
                    <span className="font-semibold text-ink-700">Packaging Studio</span><br />
                    {activeSystem ? activeSystem.name : draftId ? 'No packaging attached yet' : 'Save the draft to begin'}{activeSystem?.packagingTypeName ? ` · ${activeSystem.packagingTypeName}` : ''}
                  </div>
                  {onSaveDraft && (
                    <button type="button" onClick={() => { setMenuOpen(false); onSaveDraft() }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-700 hover:bg-ink-50">
                      <Save className="h-3.5 w-3.5" /> Save draft
                    </button>
                  )}
                  {onBack && (
                    <button type="button" onClick={() => { setMenuOpen(false); onBack() }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink-700 hover:bg-ink-50">
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to recipe step
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <SavedIndicator
            status={saveStatus === 'saving' ? 'saving' : 'saved'}
            savedAt={lastSavedAt}
            onOpenHistory={draftId ? () => { setHistoryOpen(true); void loadHistory() } : undefined}
          />
        </span>

        {/* Right cluster — ml-auto gap-2: [3D⇄Die-line] · Next · bell · account. */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <div className="inline-flex rounded-full border border-ink-200 bg-white p-0.5">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === '3d' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'}`}>
              <BoxIcon className="h-3.5 w-3.5" /> 3D
            </button>
            <button type="button" aria-pressed={view === 'die'} onClick={() => setView('die')} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === 'die' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'}`}>
              <PencilRuler className="h-3.5 w-3.5" /> Die-line
            </button>
          </div>

          {/* Next — matches the builder steps' gb-nextbtn: pink pill, 13px semibold. */}
          {onNext && (
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-pink-500 bg-pink-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:border-pink-600 hover:bg-pink-600" onClick={() => onNext()}>{nextLabel}</button>
          )}

          {/* Bell + account — the real PartnerTopbarRight, same as every other step. */}
          {headerRight}
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
              tab={libTab}
              onTab={setLibTab}
              search={librarySearch}
              onSearch={setLibrarySearch}
              catalog={catalog}
              busyCatalog={busyCatalog}
              onUseCatalog={onUseCatalog}
              onCatalogPreview={(cat) => { setView('3d'); setTopology(catalogTopologyKey(cat)) }}
              onSubmitReview={onSubmitReview}
              busyReview={busyReview}
              systems={systems}
              attachedIds={attached}
              busyAttach={busyAttach}
              onToggleAttach={toggleAttach}
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
              <FramesDrawer layout={layout} selected={selectedFrame} issues={issues} confirmed={confirmed} onConfirm={onConfirm} onAdd={addFrame} onRemove={removeFrame} onPatch={patchFrame} onSelect={setSelectedFrameId} />
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
                  <IconBtn icon={Undo2} onClick={undo} disabled={past.length === 0} title="Undo" />
                  <IconBtn icon={Redo2} onClick={redo} disabled={future.length === 0} title="Redo" />
                  <span className="mx-0.5 h-4 w-px bg-ink-200" />
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

  // Step 4 IS the studio — a full-screen portal (no inline / expand toggle).
  return typeof document !== 'undefined'
    ? createPortal(
      <div className="fixed inset-0 z-[80]">
        {shell}
        <VersionHistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          items={snapshots}
          onRestore={() => undefined}
          allowRestore={false}
          title="Draft version history"
          emptyHint="Versions are saved as you work — and pinned at each step you complete."
          footnote="Your draft autosaves continuously. Restoring a past version is coming soon."
        />
      </div>,
      document.body,
    )
    : null
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
  tab,
  onTab,
  search,
  onSearch,
  catalog,
  busyCatalog,
  onUseCatalog,
  onCatalogPreview,
  onSubmitReview,
  busyReview,
  systems,
  attachedIds,
  busyAttach,
  onToggleAttach,
  attached,
  dielines,
  activeSystemId,
  onPick,
  surfaces,
  selectedSurfaceKey,
  onSelectSurface,
  hasDraft,
}: {
  tab: 'library' | 'my'
  onTab: (t: 'library' | 'my') => void
  search: string
  onSearch: (s: string) => void
  catalog: CatalogItem[]
  busyCatalog: string | null
  onUseCatalog: (packagingTypeId: string) => void
  onCatalogPreview: (category: string) => void
  onSubmitReview: (systemId: string) => void
  busyReview: string | null
  systems: StudioPackagingOption[]
  attachedIds: string[]
  busyAttach: string | null
  onToggleAttach: (id: string, on: boolean) => void
  attached: StudioPackaging[]
  dielines: { id: string; packagingTypeId: string; decorationMethod: string; status: string }[]
  activeSystemId: string | null
  onPick: (systemId: string) => void
  surfaces: StudioSurfaceDef[]
  selectedSurfaceKey: string | null
  onSelectSurface: (key: string) => void
  hasDraft: boolean
}) {
  const q = search.trim().toLowerCase()
  const filtered = q ? systems.filter((s) => s.partnerName.toLowerCase().includes(q) || s.topology.toLowerCase().includes(q)) : systems
  const catFiltered = q ? catalog.filter((c) => c.displayName.toLowerCase().includes(q) || (CATEGORY_LABEL[c.category] ?? c.category).toLowerCase().includes(q)) : catalog
  const catGroups = CATEGORY_ORDER.map((cat) => ({ cat, items: catFiltered.filter((c) => c.category === cat) })).filter((g) => g.items.length > 0)
  const tabCls = (on: boolean) => `flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${on ? 'bg-pink-500 text-white' : 'text-ink-600 hover:bg-ink-100'}`

  // Category navigation (Pacdora-style): a sticky horizontal chip strip + a
  // chevron that expands the full taxonomy as text. `activeCat === null` = All.
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [catOpen, setCatOpen] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const scrollStrip = (dx: number) => stripRef.current?.scrollBy({ left: dx, behavior: 'smooth' })

  // Smart search. The typed `draft` only drives the suggestions dropdown — it
  // does NOT filter the grid (the packaging stays visible while typing). The grid
  // filters by the COMMITTED `search` (parent state), applied only when the user
  // picks a suggestion or presses Enter.
  const [draft, setDraft] = useState(search)
  const dq = draft.trim().toLowerCase()
  const [searchFocused, setSearchFocused] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    try { const raw = localStorage.getItem(RECENT_SEARCH_KEY); if (raw) setRecent(JSON.parse(raw) as string[]) } catch { /* ignore */ }
  }, [])
  const pushRecent = useCallback((term: string) => {
    const t = term.trim()
    if (!t) return
    setRecent((prev) => {
      const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6)
      try { localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])
  // Commit a search term: filters the grid + records it as recent.
  const commitSearch = useCallback((term: string) => {
    setDraft(term)
    onSearch(term)
    pushRecent(term)
    setSearchFocused(false)
  }, [onSearch, pushRecent])
  const clearSearch = useCallback(() => { setDraft(''); onSearch('') }, [onSearch])
  // Searchable vocabulary for the active tab.
  const vocab = useMemo(() => {
    const names = tab === 'library'
      ? [...catalog.map((c) => c.displayName), ...catalog.map((c) => CATEGORY_LABEL[c.category] ?? c.category)]
      : systems.map((s) => s.partnerName)
    return [...new Set(names)]
  }, [tab, catalog, systems])
  const suggestions = useMemo(() => {
    if (!dq) return recent.slice(0, 6)
    return vocab
      .filter((v) => v.toLowerCase().includes(dq))
      .sort((a, b) => (Number(b.toLowerCase().startsWith(dq)) - Number(a.toLowerCase().startsWith(dq))) || a.localeCompare(b))
      .slice(0, 7)
  }, [dq, vocab, recent])
  // Categories that actually have items under the current search.
  const availableCats = CATEGORY_ORDER.filter((cat) => catFiltered.some((c) => c.category === cat))
  // If the active category is filtered away (by search), fall back to All.
  const effectiveCat = activeCat && availableCats.includes(activeCat) ? activeCat : null
  const shownGroups = effectiveCat ? catGroups.filter((g) => g.cat === effectiveCat) : catGroups

  return (
    <div className="flex h-full flex-col">
      {/* Library / My tabs */}
      <div className="flex gap-1 border-b border-ink-100 p-2">
        <button type="button" onClick={() => onTab('library')} className={tabCls(tab === 'library')}>Library</button>
        <button type="button" onClick={() => onTab('my')} className={tabCls(tab === 'my')}>My</button>
      </div>

      {/* Search — smart suggestions (recent + typeahead). Typing only drives the
          dropdown; the grid filters only on commit (Enter / pick a suggestion). */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSearchFocused(true) }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitSearch(draft) }
              else if (e.key === 'Escape') { setSearchFocused(false) }
            }}
            placeholder={tab === 'library' ? 'Try “water bottle”, “tuck-end box”…' : 'Search your packaging…'}
            className="w-full rounded-lg border border-ink-200 py-2 pl-8 pr-8 text-[12px] outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
          />
          {draft && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clearSearch}
              className="absolute right-1.5 top-1/2 z-[1] grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Suggestions dropdown */}
          {searchFocused && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
              {!dq && <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Recent searches</p>}
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); commitSearch(s) }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-ink-700 transition-colors hover:bg-pink-50 hover:text-pink-700"
                >
                  {dq
                    ? <Search className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    : <Clock className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'library' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Sticky category strip — horizontal scroll of category chips + a
              chevron that expands the full taxonomy as text. Stays put while the
              grid below scrolls. */}
          {availableCats.length > 0 && (
            <div className="relative shrink-0 border-b border-ink-100">
              {/* ‹ left scroll — pinned left with a fade. */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex items-center bg-gradient-to-r from-white via-white to-transparent pl-1 pr-4">
                <button type="button" aria-label="Scroll categories left" onClick={() => scrollStrip(-180)} className="pointer-events-auto grid h-7 w-6 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              {/* The scrollable chip rail (wheel → horizontal). */}
              <div
                ref={stripRef}
                onWheel={(e) => { if (stripRef.current && e.deltaY !== 0) stripRef.current.scrollLeft += e.deltaY }}
                className="flex items-center gap-1 overflow-x-auto py-2 pl-8 pr-16 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <CatChip label="All" active={effectiveCat === null} onClick={() => { setActiveCat(null); setCatOpen(false) }} />
                {availableCats.map((cat) => (
                  <CatChip key={cat} label={CATEGORY_LABEL[cat] ?? cat} active={effectiveCat === cat} onClick={() => { setActiveCat(cat); setCatOpen(false) }} />
                ))}
              </div>
              {/* › right scroll + chevron expander, pinned right with a fade so chips scroll under. */}
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] flex items-center gap-0.5 bg-gradient-to-l from-white via-white to-transparent pl-4 pr-1.5">
                <button type="button" aria-label="Scroll categories right" onClick={() => scrollStrip(180)} className="pointer-events-auto grid h-7 w-6 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={catOpen ? 'Hide all categories' : 'Show all categories'}
                  aria-expanded={catOpen}
                  onClick={() => setCatOpen((v) => !v)}
                  className="pointer-events-auto grid h-7 w-7 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 transition-colors hover:bg-ink-50"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${catOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {catOpen ? (
            /* In-drawer taxonomy — replaces the grid (not a floating dropdown).
               Every category as a text link; click selects it + collapses. */
            <div>
              <p className="mb-2 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">All categories</p>
              <div className="flex flex-col">
                <button type="button" onClick={() => { setActiveCat(null); setCatOpen(false) }} className={`rounded-md px-1.5 py-2 text-left text-[13px] transition-colors hover:bg-pink-50 hover:text-pink-700 ${effectiveCat === null ? 'font-semibold text-pink-700' : 'text-ink-700'}`}>All</button>
                {availableCats.map((cat) => (
                  <button key={cat} type="button" onClick={() => { setActiveCat(cat); setCatOpen(false) }} className={`flex items-center justify-between rounded-md px-1.5 py-2 text-left text-[13px] transition-colors hover:bg-pink-50 hover:text-pink-700 ${effectiveCat === cat ? 'font-semibold text-pink-700' : 'text-ink-700'}`}>
                    <span>{CATEGORY_LABEL[cat] ?? cat}</span>
                    <span className="text-[11px] text-ink-400">{catFiltered.filter((c) => c.category === cat).length}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : catalog.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/40 p-4 text-center">
              <BoxIcon className="mx-auto mb-2 h-5 w-5 text-ink-300" />
              <div className="text-[12.5px] font-semibold text-ink-700">Catalog is empty</div>
              <p className="mx-auto mt-1 max-w-[15rem] text-[11.5px] leading-relaxed text-ink-500">No admin-curated packaging types yet. Use the <b>My</b> tab to upload your own.</p>
            </div>
          ) : shownGroups.length === 0 ? (
            <p className="px-1 py-4 text-center text-[12px] text-ink-500">No catalog matches “{search}”.</p>
          ) : (
            shownGroups.map((g) => (
              <div key={g.cat} className="mb-3">
                <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">{CATEGORY_LABEL[g.cat] ?? g.cat}</p>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((c) => (
                    <div key={c.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white transition-colors hover:border-pink-200">
                      <button type="button" onClick={() => onCatalogPreview(c.category)} className="block w-full" title="Preview in 3D">
                        <div className="grid aspect-square place-items-center bg-ink-50">
                          {c.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.thumbUrl} alt={c.displayName} className="h-full w-full object-contain p-1.5" />
                          ) : (
                            <BoxIcon className="h-6 w-6 text-ink-300" />
                          )}
                        </div>
                      </button>
                      <div className="px-2 pb-2 pt-1.5">
                        <div className="truncate text-[11.5px] font-semibold text-ink-900" title={c.displayName}>{c.displayName}</div>
                        <button
                          type="button"
                          onClick={() => onUseCatalog(c.id)}
                          disabled={busyCatalog === c.id || !hasDraft}
                          className="mt-1 w-full rounded-lg bg-pink-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
                        >
                          {busyCatalog === c.id ? '…' : 'Use this'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Upload → admin approval */}
          <div className="px-3 pt-3">
            <Link href="/packaging/new" className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 bg-white px-3 py-2.5 text-[12px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50">
              <Upload className="h-3.5 w-3.5" /> Upload packaging
            </Link>
            <p className="mt-1 px-0.5 text-[10.5px] leading-snug text-ink-400">Custom uploads go to admin for 3D/2D mockup prep; once approved they appear in the Library under their category.</p>
          </div>

          {/* Your packaging — attach + pick to design */}
          <div className="px-3 py-3">
            <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Your packaging</p>
            {!hasDraft && <p className="px-1 text-[12px] text-ink-500">Save the draft to attach packaging.</p>}
            {hasDraft && filtered.length === 0 && <p className="px-1 text-[12px] text-ink-500">{q ? 'No matches.' : 'No packaging yet — upload one above.'}</p>}
            <div className="space-y-1.5">
              {filtered.map((s) => {
                const on = attachedIds.includes(s.id)
                const att = attached.find((a) => a.systemId === s.id)
                const picked = s.id === activeSystemId
                const hasDie = att?.packagingTypeId ? dielines.some((d) => d.packagingTypeId === att.packagingTypeId) : false
                return (
                  <div key={s.id} className={`rounded-xl border px-3 py-2.5 ${picked ? 'border-pink-500 bg-pink-50' : 'border-ink-200'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500"><BoxIcon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-ink-900">{s.partnerName}</span>
                        <span className="block truncate text-[11px] text-ink-500">{s.topology} · MOQ {s.moq.toLocaleString()}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleAttach(s.id, !on)}
                        disabled={busyAttach === s.id || !hasDraft}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${on ? 'border border-pink-200 bg-pink-50 text-pink-700' : 'bg-pink-600 text-white hover:bg-pink-700'}`}
                      >
                        {busyAttach === s.id ? '…' : on ? 'Attached ✓' : '+ Attach'}
                      </button>
                    </div>
                    {on && (
                      <>
                        <div className="mt-2 flex items-center gap-2">
                          <button type="button" onClick={() => onPick(s.id)} className={`flex-1 rounded-lg border px-2 py-1.5 text-[11.5px] font-medium ${picked ? 'border-pink-300 bg-white text-pink-700' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}>{picked ? 'Designing this' : 'Design this'}</button>
                          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${hasDie ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-ink-200 bg-white text-ink-400'}`}>{hasDie ? 'die-line ✓' : 'no die-line'}</span>
                        </div>
                        {/* Custom (non-catalog) packaging: submit to admin to join the Library.
                            Submission STATUS lives on the partner profile, not here. */}
                        {att && !att.packagingTypeId && (
                          att.reviewStatus === 'SUBMITTED' ? (
                            <div className="mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700">
                              <Check className="h-3 w-3" /> Submitted · track on your profile
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSubmitReview(s.id)}
                              disabled={busyReview === s.id}
                              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50"
                              title="Send to admin to prep 3D/2D mockups and publish into the Library catalog"
                            >
                              <Upload className="h-3 w-3" /> {busyReview === s.id ? 'Submitting…' : att.reviewStatus === 'REJECTED' ? 'Resubmit for catalog review' : 'Submit for catalog review'}
                            </button>
                          )
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Surfaces (3D) */}
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
      )}
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

function FramesDrawer({ layout, selected, issues, confirmed, onConfirm, onAdd, onRemove, onPatch, onSelect }: {
  layout: FrameLayout
  selected: Frame | null
  issues: LayoutIssue[]
  confirmed: boolean
  onConfirm: () => void
  onAdd: (k: FrameKind) => void
  onRemove: (id: string) => void
  onPatch: (id: string, p: Partial<Frame>) => void
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <DrawerHead title="Frames" sub="Slots for mandatory + packaging elements. Content fills them per scope." />

      {/* Preflight + Confirm — die-line workflow lives here (out of the top bar). */}
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
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmed || issues.length > 0}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-pink-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
        >
          <CircleCheck className="h-3.5 w-3.5" /> {confirmed ? 'Die-line confirmed' : 'Confirm die-line'}
        </button>
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

// One pill in the Library category strip (Pacdora-style horizontal scroller).
function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${active ? 'bg-pink-500 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'}`}
    >
      {label}
    </button>
  )
}

function IconBtn({ icon: Icon, onClick, disabled, title }: { icon: React.ComponentType<{ className?: string }>; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button onClick={onClick} disabled={disabled} title={title} className="rounded-full p-1.5 text-ink-600 transition-colors hover:bg-ink-100 disabled:opacity-40 disabled:hover:bg-transparent"><Icon className="h-4 w-4" /></button>
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
