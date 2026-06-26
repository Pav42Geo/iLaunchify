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
  BrandMark,
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
import { PACKAGING_DEFS, createPackagingScene, CAMERA_PRESETS, type CameraPreset, type TopologyKey, type PackagingSceneHandle, type StudioSurfaceDef } from './packaging-3d'
import { loadPackagingStudio, loadPackagingCatalog, attachCatalogType, submitPackagingForReview, createCustomPackaging, loadPackagingFiles, addPackagingFilesToSystem, removePackagingFile, loadCustomDieline, saveCustomDieline, type PackagingStudioData, type StudioPackaging, type CatalogItem, type StudioFile } from './packaging-studio-actions'
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
// PackagingTopology options for the in-studio "Upload packaging" modal.
const TOPOLOGY_OPTIONS: { value: string; label: string }[] = [
  { value: 'SINGLE_CONTAINER', label: 'Single container (bottle / jar / can / box)' },
  { value: 'MULTI_CONTAINER_BOX', label: 'Outer carton (variety pack / sampler)' },
  { value: 'POUCH_STAND_UP', label: 'Stand-up pouch' },
  { value: 'POUCH_FLAT', label: 'Flat pouch' },
  { value: 'SACHET', label: 'Sachet' },
  { value: 'STICK_PACK', label: 'Stick pack' },
  { value: 'TUBE', label: 'Squeeze tube' },
  { value: 'CAPSULE_JAR', label: 'Capsule / tablet bottle' },
  { value: 'CASE', label: 'Shipper case' },
  { value: 'OTHER', label: 'Other' },
]
// Bottom 3D-view camera presets (Pacdora-style view bar).
const VIEW_PRESETS: [CameraPreset, string][] = [
  ['frontRight', 'Front Right'],
  ['frontLeft', 'Front Left'],
  ['front', 'Front'],
  ['topLeft', 'Top Left'],
  ['topRight', 'Top Right'],
  ['top', 'Top'],
]

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
  // 3D Open/Close fold — continuous 0 (open/flat net) … 1 (assembled/solid). Only
  // meaningful for foldable cartons (box topology); rigid containers stay solid.
  const [foldAmt, setFoldAmt] = useState(1)
  const setFold3d = (t: number) => { setFoldAmt(t); handleRef.current?.setFoldAmount(t) }
  // Custom saved camera angles ("Save view" — Pacdora-style).
  const [savedViews, setSavedViews] = useState<{ theta: number; phi: number; radius: number }[]>([])
  const saveCurrentView = () => { const c = handleRef.current?.getCamera(); if (c) setSavedViews((v) => [...v, c]) }
  const removeSavedView = (i: number) => setSavedViews((v) => v.filter((_, idx) => idx !== i))
  // In-studio "Upload packaging" (My tab) — creates a custom packaging without
  // leaving the fullscreen studio. Newly created systems are kept locally so they
  // appear in My immediately (the page prop only carries ACTIVE ones).
  const [uploadOpen, setUploadOpen] = useState(false)
  const [localSystems, setLocalSystems] = useState<StudioPackagingOption[]>([])
  const [manageFilesFor, setManageFilesFor] = useState<{ id: string; name: string } | null>(null)
  const [tool, setTool] = useState<Tool>('library')
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
  // Custom (type-less) packaging has no PackagingType → no resolvable die-line.
  // The partner instead lays mandatory frames on a blank/uploaded board that saves
  // on the system (customDielineLayout). Active in the Die-line view for such systems.
  const customMode = Boolean(activeSystem) && !activeSystem?.packagingTypeId && !resolvedDielineId
  const [customBackdrop, setCustomBackdrop] = useState<string | null>(null)

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

  // Only foldable cartons (boxes) expose the Open/Close slider; rigid containers
  // (cans/jars/bottles) snap back to solid so a left-over open state can't linger.
  const foldable = topology === 'box'
  useEffect(() => {
    if (!foldable) { setFoldAmt(1); handleRef.current?.setFoldAmount(1) }
  }, [foldable])

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
      toast.success('Submitted for admin approval', {
        description: 'Admin must approve this custom packaging + die-line before it goes live — and any product using it needs admin review too. Track status on your Packaging page.',
        duration: 7000,
      })
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

  // Custom (type-less) die-line: load the saved mandatory-frame layout + a backdrop
  // (the partner's first uploaded die-line image) when a custom system is active.
  useEffect(() => {
    if (!customMode || !activeSystemId) { setCustomBackdrop(null); return }
    let alive = true
    setDed(null)
    setLoadingDieline(true)
    void loadCustomDieline(activeSystemId).then((r) => {
      if (!alive) return
      setLoadingDieline(false)
      setCustomBackdrop(r?.backdropUrl ?? null)
      setLayout((r?.layout as FrameLayout) ?? structuredClone(DEFAULT_FRAME_LAYOUT))
      setTrim(asBox(r?.trim, { x: 0, y: 0, w: 1, h: 1 }))
      setSafe(asBox(r?.safe, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }))
      setPast([]); setFuture([]); setSelectedFrameId(null); setSaveStatus('saved')
    })
    return () => { alive = false }
  }, [customMode, activeSystemId])

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
    // Typed packaging → its PackagingDieline; custom (type-less) → the system's
    // customDielineLayout. Otherwise nothing to persist.
    if (!resolvedDielineId && !(customMode && activeSystemId)) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (resolvedDielineId) {
        const [a, b] = await Promise.all([
          saveDielineFrames(resolvedDielineId, nextLayout),
          saveDielineGeometry(resolvedDielineId, { trimBox: nextTrim, safeAreaBox: nextSafe }),
        ])
        setSaveStatus(a.ok && b.ok ? 'saved' : 'idle')
        if (!a.ok) toast.error(a.error)
      } else if (activeSystemId) {
        const r = await saveCustomDieline(activeSystemId, { layout: nextLayout, trim: nextTrim, safe: nextSafe })
        setSaveStatus(r.ok ? 'saved' : 'idle')
      }
    }, 700)
  }, [resolvedDielineId, customMode, activeSystemId])

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
  const issues = useMemo<LayoutIssue[]>(() => ((resolvedDielineId || customMode) ? validateFrameLayout(layout, { safeArea: safe }) : []), [layout, safe, resolvedDielineId, customMode])

  async function onConfirm() {
    if (issues.length > 0) {
      toast.error(`Fix ${issues.length} preflight issue${issues.length === 1 ? '' : 's'} first.`)
      return
    }
    // Custom (type-less) packaging has no PackagingDieline to confirm yet — the
    // frames autosave with the packaging; admin finalizes the die-line on approval.
    if (!resolvedDielineId) {
      if (customMode) toast.success('Mandatory frames saved with your packaging — admin finalizes the die-line on approval.')
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
        {/* Compact mark only (no wordmark) — reads the uploaded mark via --brand-mark-url. */}
        <BrandMark size={26} className="flex-shrink-0" />

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
              systems={[...localSystems, ...systems]}
              onUpload={() => setUploadOpen(true)}
              onManageFiles={(id, name) => setManageFilesFor({ id, name })}
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
            (resolvedDielineId || customMode) ? (
              <FramesDrawer layout={layout} selected={selectedFrame} issues={issues} confirmed={confirmed} onConfirm={onConfirm} onAdd={addFrame} onRemove={removeFrame} onPatch={patchFrame} onSelect={setSelectedFrameId} />
            ) : (
              <NoDielineDrawer />
            )
          )}
          {tool === 'guides' && <GuidesDrawer show={showGuides} setShow={setShowGuides} trim={trim} safe={safe} disabled={!resolvedDielineId && !customMode} />}
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

              {/* Preset camera views — floats above the main control bar (Pacdora-style). */}
              <div className="absolute bottom-[70px] left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl border border-ink-200 bg-white/95 p-1 shadow-sm backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {VIEW_PRESETS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleRef.current?.setCameraView(CAMERA_PRESETS[key].theta, CAMERA_PRESETS[key].phi)}
                    className="grid shrink-0 place-items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10.5px] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    <BoxIcon className="h-4 w-4" />
                    {label}
                  </button>
                ))}

                {/* Custom saved views */}
                {savedViews.map((v, i) => (
                  <div key={i} className="group relative shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRef.current?.setCameraView(v.theta, v.phi, v.radius)}
                      className="grid place-items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10.5px] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
                    >
                      <BoxIcon className="h-4 w-4" />
                      View {i + 1}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove saved view ${i + 1}`}
                      onClick={() => removeSavedView(i)}
                      className="absolute right-0.5 top-0.5 hidden h-4 w-4 place-items-center rounded-full bg-ink-200 text-ink-600 hover:bg-ink-300 group-hover:grid"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}

                <span className="mx-0.5 h-7 w-px shrink-0 bg-ink-200" />
                {/* Save view — captures the current camera angle. */}
                <button
                  type="button"
                  onClick={saveCurrentView}
                  title="Save current view"
                  className="grid shrink-0 place-items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10.5px] font-semibold text-pink-700 transition-colors hover:bg-pink-50"
                >
                  <span className="grid h-4 w-4 place-items-center rounded bg-pink-500 text-white"><Plus className="h-3 w-3" /></span>
                  Save view
                </button>
              </div>

              {/* Main 3D controls — zoom + Open/Close (fold). */}
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-ink-200 bg-white px-2 py-1 shadow-sm">
                <IconBtn icon={ZoomOut} onClick={() => handleRef.current?.zoomBy(1.18)} title="Zoom out" />
                <IconBtn icon={Maximize} onClick={() => handleRef.current?.setCameraView(CAMERA_PRESETS.frontRight.theta, CAMERA_PRESETS.frontRight.phi)} title="Reset view" />
                <IconBtn icon={ZoomIn} onClick={() => handleRef.current?.zoomBy(0.85)} title="Zoom in" />
                {/* Open ⇄ Close fold slider — foldable cartons only. */}
                {foldable && (
                  <>
                    <span className="mx-0.5 h-4 w-px bg-ink-200" />
                    <div className="flex items-center gap-2 pl-1 pr-1.5">
                      <span className="text-[11px] font-medium text-ink-500">Open</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={foldAmt}
                        onChange={(e) => setFold3d(Number(e.target.value))}
                        aria-label="Open / close package"
                        className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-ink-200 accent-pink-500"
                      />
                      <span className="text-[11px] font-medium text-ink-500">Close</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[radial-gradient(circle,#e4e4e7_1px,transparent_1px)] bg-[length:18px_18px] p-8">
              {loadingDieline ? (
                <div className="text-[12.5px] text-ink-400">Loading die-line…</div>
              ) : (!resolvedDielineId && !customMode) ? (
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
                    {/* Custom packaging: back the board with the partner's first uploaded die-line, if any. */}
                    {!ded?.fileUrl && customBackdrop && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={customBackdrop} alt="die-line" className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-90" />
                    )}
                    {!ded?.fileUrl && !customBackdrop && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[12px] text-ink-300">{customMode ? 'Blank board — lay the mandatory frames; upload a die-line in the Library “My” tab to trace over it.' : 'No file uploaded — frames still save'}</div>
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
              {(resolvedDielineId || customMode) && !loadingDieline && (
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
        <UploadPackagingModal
          open={uploadOpen}
          draftId={draftId}
          onClose={() => setUploadOpen(false)}
          onCreated={(systemId, name, topology) => {
            setLocalSystems((p) => [{ id: systemId, partnerName: name, topology, unitCount: 1, moq: 1 }, ...p])
            setLibTab('my')
            setActiveSystemId(systemId)
            setTopology(toStudioTopology(topology))
            refreshAttached()
            setUploadOpen(false)
            toast.success('Packaging added to your list')
          }}
        />
        <ManageFilesModal
          system={manageFilesFor}
          onClose={() => setManageFilesFor(null)}
        />
      </div>,
      document.body,
    )
    : null
}

// Manage a custom packaging's uploaded mockups + die-lines after creation.
function ManageFilesModal({ system, onClose }: { system: { id: string; name: string } | null; onClose: () => void }) {
  const [files, setFiles] = useState<StudioFile[]>([])
  const [loading, setLoading] = useState(false)
  const [mockups, setMockups] = useState<{ file: File; label: string }[]>([])
  const [dielines, setDielines] = useState<{ file: File; panel: string; label: string }[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback((id: string) => { setLoading(true); void loadPackagingFiles(id).then((f) => { setFiles(f); setLoading(false) }) }, [])
  useEffect(() => {
    if (system) { setMockups([]); setDielines([]); refresh(system.id) }
  }, [system, refresh])
  if (!system) return null

  const addMockups = (fl: FileList | null) => { if (fl) setMockups((p) => [...p, ...Array.from(fl).map((file) => ({ file, label: '' }))]) }
  const addDielines = (fl: FileList | null) => { if (fl) setDielines((p) => [...p, ...Array.from(fl).map((file) => ({ file, panel: 'FRONT', label: '' }))]) }
  const hasNew = mockups.length + dielines.length > 0

  async function saveNew() {
    if (!system || !hasNew) return
    const fd = new FormData()
    fd.set('systemId', system.id)
    mockups.forEach((m) => { fd.append('mockup', m.file); fd.append('mockupLabel', m.label) })
    dielines.forEach((d) => { fd.append('dieline', d.file); fd.append('dielinePanel', d.panel); fd.append('dielineLabel', d.label) })
    setBusy(true)
    const r = await addPackagingFilesToSystem(fd)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    setMockups([]); setDielines([])
    toast.success('Files added')
    refresh(system.id)
  }

  async function remove(id: string) {
    setFiles((p) => p.filter((f) => f.id !== id))
    const r = await removePackagingFile(id)
    if (!r.ok) { toast.error(r.error); if (system) refresh(system.id) }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-ink-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink-900">Manage files — {system.name}</h3>
            <p className="text-[11.5px] text-ink-500">Mockups, photos &amp; panel-tagged die-lines for admin review.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Existing files */}
          <div>
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">Uploaded ({files.length})</p>
            {loading ? (
              <p className="text-[12px] text-ink-400">Loading…</p>
            ) : files.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-3 text-center text-[11.5px] text-ink-400">No files yet — add some below.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {files.map((f) => (
                  <div key={f.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                    <div className="relative grid aspect-square place-items-center bg-ink-50">
                      {f.url && /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.url} alt={f.name} className="h-full w-full object-contain p-1" />
                        : <span className="text-[10px] font-semibold uppercase text-ink-400">{f.name.split('.').pop() ?? 'file'}</span>}
                      <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase ${f.role === 'DIELINE' ? 'bg-sky-100 text-sky-700' : 'bg-pink-100 text-pink-700'}`}>{f.role === 'DIELINE' ? (f.panel ?? 'Die') : (f.label || 'Mockup')}</span>
                      <button type="button" aria-label="Remove" onClick={() => void remove(f.id)} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-ink-500 hover:bg-white hover:text-pink-600"><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <div className="truncate px-1.5 py-1 text-[10px] text-ink-600" title={f.name}>{f.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new */}
          <FileGroup title="Add mockups" hint="JPG, PNG, GLB, GLTF, OBJ" accept="image/*,.glb,.gltf,.obj,.usdz" addLabel="Add mockup(s)" count={mockups.length} onAdd={addMockups}>
            {mockups.map((m, i) => (
              <FileRow key={i} file={m.file} onRemove={() => setMockups((p) => p.filter((_, idx) => idx !== i))} meta={<input value={m.label} onChange={(e) => setMockups((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} placeholder="Label" className="w-24 rounded-md border border-ink-200 px-2 py-1 text-[11px] outline-none focus:border-pink-300" />} />
            ))}
          </FileGroup>
          <FileGroup title="Add die-lines" hint="PDF, AI, SVG, DXF" accept=".pdf,.ai,.svg,.dxf,image/*" addLabel="Add die-line(s)" count={dielines.length} onAdd={addDielines}>
            {dielines.map((d, i) => (
              <FileRow key={i} file={d.file} onRemove={() => setDielines((p) => p.filter((_, idx) => idx !== i))} meta={
                <select value={d.panel} onChange={(e) => setDielines((p) => p.map((x, idx) => idx === i ? { ...x, panel: e.target.value } : x))} className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-pink-300">
                  {DIELINE_PANELS.map((pn) => <option key={pn} value={pn}>{pn[0] + pn.slice(1).toLowerCase()}</option>)}
                </select>
              } />
            ))}
          </FileGroup>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-100">Done</button>
          <button type="button" onClick={() => void saveNew()} disabled={busy || !hasNew} className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50">{busy ? 'Uploading…' : 'Add files'}</button>
        </div>
      </div>
    </div>
  )
}

// Common substrates for the material datalist (free-text still allowed).
const MATERIAL_SUGGESTIONS = ['PET', 'HDPE', 'PP', 'Glass', 'Aluminium', 'Tinplate', 'SBS folding carton', 'Kraft board', 'Corrugated', 'PE film', 'Foil laminate', 'Compostable PLA']

// In-studio "Upload packaging" modal — creates a custom PackagingSystem (with
// parameters, material, a packaging photo / 3D mockup, and a die-line file) and
// attaches it to the draft, all without leaving the fullscreen studio.
function UploadPackagingModal({ open, draftId, onClose, onCreated }: {
  open: boolean
  draftId: string | null
  onClose: () => void
  onCreated: (systemId: string, name: string, topology: string) => void
}) {
  const [name, setName] = useState('')
  const [topology, setTopology] = useState(TOPOLOGY_OPTIONS[0]!.value)
  const [material, setMaterial] = useState('')
  const [lengthMm, setLengthMm] = useState('')
  const [widthMm, setWidthMm] = useState('')
  const [heightMm, setHeightMm] = useState('')
  const [maxWeightG, setMaxWeightG] = useState('')
  const [unitCount, setUnitCount] = useState('1')
  const [moq, setMoq] = useState('1')
  // Multiple files: a bottle + outer box may need several mockups + die-lines.
  const [mockups, setMockups] = useState<{ file: File; label: string }[]>([])
  const [dielines, setDielines] = useState<{ file: File; panel: string; label: string }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(''); setTopology(TOPOLOGY_OPTIONS[0]!.value); setMaterial('')
      setLengthMm(''); setWidthMm(''); setHeightMm(''); setMaxWeightG(''); setUnitCount('1'); setMoq('1')
      setMockups([]); setDielines([]); setBusy(false)
    }
  }, [open])
  if (!open) return null

  const addMockups = (files: FileList | null) => { if (files) setMockups((p) => [...p, ...Array.from(files).map((file) => ({ file, label: '' }))]) }
  const addDielines = (files: FileList | null) => { if (files) setDielines((p) => [...p, ...Array.from(files).map((file) => ({ file, panel: 'FRONT', label: '' }))]) }

  async function submit() {
    if (!draftId) { toast.error('Save the draft first.'); return }
    if (name.trim().length < 2) { toast.error('Give the packaging a name.'); return }
    const fd = new FormData()
    fd.set('draftId', draftId)
    fd.set('name', name)
    fd.set('topology', topology)
    fd.set('material', material)
    fd.set('lengthMm', lengthMm); fd.set('widthMm', widthMm); fd.set('heightMm', heightMm)
    fd.set('maxWeightG', maxWeightG); fd.set('unitCount', unitCount); fd.set('moq', moq)
    mockups.forEach((m) => { fd.append('mockup', m.file); fd.append('mockupLabel', m.label) })
    dielines.forEach((d) => { fd.append('dieline', d.file); fd.append('dielinePanel', d.panel); fd.append('dielineLabel', d.label) })
    setBusy(true)
    const r = await createCustomPackaging(fd)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    onCreated(r.systemId, name.trim(), topology)
  }

  const numInput = 'w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100'
  const labelCls = 'mb-1 block text-[11px] font-semibold text-ink-600'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-ink-200 bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-pink-50 text-pink-600"><Upload className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink-900">Upload custom packaging</h3>
            <p className="truncate text-[11.5px] text-ink-500">Parameters + artwork go to admin to prep the 3D/2D mockups.</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!draftId && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-800">
              Save your product draft first — finish Basics or hit <b>Save draft</b> (☰ menu). Custom packaging attaches to a saved product.
            </div>
          )}
          {/* Identity */}
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. 500 ml matte HDPE bottle" className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={topology} onChange={(e) => setTopology(e.target.value)} className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100">
                {TOPOLOGY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Material</label>
              <input list="pkg-materials" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. PET, kraft board" className={numInput} />
              <datalist id="pkg-materials">{MATERIAL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          </div>

          {/* Parameters */}
          <div>
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">Parameters</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className={labelCls}>Length (mm)</label><input type="number" min={0} value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} className={numInput} /></div>
              <div><label className={labelCls}>Width (mm)</label><input type="number" min={0} value={widthMm} onChange={(e) => setWidthMm(e.target.value)} className={numInput} /></div>
              <div><label className={labelCls}>Height (mm)</label><input type="number" min={0} value={heightMm} onChange={(e) => setHeightMm(e.target.value)} className={numInput} /></div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div><label className={labelCls}>Max weight (g)</label><input type="number" min={0} value={maxWeightG} onChange={(e) => setMaxWeightG(e.target.value)} className={numInput} /></div>
              <div><label className={labelCls}>Units</label><input type="number" min={1} value={unitCount} onChange={(e) => setUnitCount(e.target.value)} className={numInput} /></div>
              <div><label className={labelCls}>MOQ</label><input type="number" min={1} value={moq} onChange={(e) => setMoq(e.target.value)} className={numInput} /></div>
            </div>
          </div>

          {/* Mockups — multiple photos / 3D files (bottle + outer box, etc.). */}
          <FileGroup
            title="Mockups & photos"
            hint="JPG, PNG, GLB, GLTF, OBJ — add one per component"
            accept="image/*,.glb,.gltf,.obj,.usdz"
            addLabel="Add mockup(s)"
            count={mockups.length}
            onAdd={addMockups}
          >
            {mockups.map((m, i) => (
              <FileRow
                key={i}
                file={m.file}
                onRemove={() => setMockups((p) => p.filter((_, idx) => idx !== i))}
                meta={
                  <input value={m.label} onChange={(e) => setMockups((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} placeholder="Label (e.g. Bottle)" className="w-28 rounded-md border border-ink-200 px-2 py-1 text-[11px] outline-none focus:border-pink-300" />
                }
              />
            ))}
          </FileGroup>

          {/* Die-lines — multiple files, each tagged with a panel. */}
          <FileGroup
            title="Die-lines"
            hint="PDF, AI, SVG, DXF — tag each with its panel"
            accept=".pdf,.ai,.svg,.dxf,image/*"
            addLabel="Add die-line(s)"
            count={dielines.length}
            onAdd={addDielines}
          >
            {dielines.map((d, i) => (
              <FileRow
                key={i}
                file={d.file}
                onRemove={() => setDielines((p) => p.filter((_, idx) => idx !== i))}
                meta={
                  <div className="flex items-center gap-1.5">
                    <select value={d.panel} onChange={(e) => setDielines((p) => p.map((x, idx) => idx === i ? { ...x, panel: e.target.value } : x))} className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-pink-300">
                      {DIELINE_PANELS.map((pn) => <option key={pn} value={pn}>{pn[0] + pn.slice(1).toLowerCase()}</option>)}
                    </select>
                    <input value={d.label} onChange={(e) => setDielines((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} placeholder="Label" className="w-20 rounded-md border border-ink-200 px-2 py-1 text-[11px] outline-none focus:border-pink-300" />
                  </div>
                }
              />
            ))}
          </FileGroup>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-3.5">
          <span className="text-[11px] text-ink-400">{!draftId ? 'Save your product draft first.' : name.trim().length < 2 ? 'Enter a name to continue.' : ''}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[12.5px] font-semibold text-ink-600 hover:bg-ink-100">Cancel</button>
            <button type="button" onClick={() => void submit()} disabled={busy || !draftId || name.trim().length < 2} className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50">
              {busy ? 'Uploading…' : 'Add packaging'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const DIELINE_PANELS = ['FRONT', 'BACK', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT', 'OTHER']

// A labelled group: header + "add files" (multiple) + the list of picked rows.
function FileGroup({ title, hint, accept, addLabel, count, onAdd, children }: { title: string; hint: string; accept: string; addLabel: string; count: number; onAdd: (files: FileList | null) => void; children: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-wider text-ink-700">{title}</p>
        <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50">
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
        <input ref={ref} type="file" accept={accept} multiple className="hidden" onChange={(e) => { onAdd(e.target.files); if (ref.current) ref.current.value = '' }} />
      </div>
      <div className="space-y-1.5">
        {children}
        {count === 0 && (
          <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 bg-white px-2.5 py-2 text-[11.5px] text-ink-500 transition-colors hover:border-pink-300 hover:bg-pink-50">
            <Upload className="h-3.5 w-3.5" /> {hint}
          </button>
        )}
      </div>
    </div>
  )
}

// One picked file with its metadata controls + remove.
function FileRow({ file, meta, onRemove }: { file: File; meta: ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5">
      <Upload className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-medium text-ink-800">{file.name}</span>
        <span className="block text-[10px] text-ink-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
      </span>
      {meta}
      <button type="button" aria-label="Remove file" onClick={onRemove} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X className="h-3.5 w-3.5" /></button>
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
  onUpload,
  onManageFiles,
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
  onUpload: () => void
  onManageFiles: (id: string, name: string) => void
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
              {!dq && <p className="px-2.5 pb-0.5 pt-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">Recent searches</p>}
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
              <p className="mb-2 px-0.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">All categories</p>
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
                <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">{CATEGORY_LABEL[g.cat] ?? g.cat}</p>
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
            <button type="button" onClick={onUpload} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 bg-white px-3 py-2.5 text-[12px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50">
              <Upload className="h-3.5 w-3.5" /> Upload packaging
            </button>
            <p className="mt-1 px-0.5 text-[10.5px] leading-snug text-ink-400">Custom uploads go to admin for 3D/2D mockup prep; once approved they appear in the Library under their category.</p>
          </div>

          {/* Your packaging — attach + pick to design */}
          <div className="px-3 py-3">
            <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">Your packaging</p>
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
                            <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800"><Check className="h-3 w-3" /> Awaiting admin approval</div>
                              <p className="mt-0.5 text-[10px] leading-snug text-amber-700">This packaging + die-line need admin sign-off, and the product itself goes through admin review before it can go live. Track status on your Packaging page.</p>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onSubmitReview(s.id)}
                                disabled={busyReview === s.id}
                                className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50"
                                title="Optional — send to admin now. Submitting your product also sends this for review automatically."
                              >
                                <Upload className="h-3 w-3" /> {busyReview === s.id ? 'Submitting…' : att.reviewStatus === 'REJECTED' ? 'Resubmit for catalog review' : 'Submit for catalog review (optional)'}
                              </button>
                              <p className="mt-1 px-0.5 text-[10px] leading-snug text-ink-400">Optional — keep building. When you submit your product, this packaging is sent for review with it and admin approves both together.</p>
                            </>
                          )
                        )}
                        {att && !att.packagingTypeId && (
                          <button type="button" onClick={() => onManageFiles(s.id, s.partnerName)} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800">
                            <Inbox className="h-3 w-3" /> Manage mockups & die-lines
                          </button>
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
            <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-700">Surfaces (3D)</p>
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

      {/* palette */}
      <div className="px-4 py-3">
        <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">Add a frame</p>
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
