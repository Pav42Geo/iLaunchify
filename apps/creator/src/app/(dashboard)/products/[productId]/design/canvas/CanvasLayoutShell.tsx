'use client'

// CanvasLayoutShell — full canvas page layout matching the legacy screenshots
// (Pavel's reference from FOD-reference/frontend/src/app/design-studio/[productId]/canvas).
// Per docs/DESIGN_STUDIO_REBUILD.md §3.
//
// Layout structure:
//   Top bar (~73px): iLaunchify mark / Saved / undo+redo / COMPLIANCE / MOCKUP / Exit Studio
//   Left rail (80px): 11 tool icons (Product, Label, Text, Images, Graphics,
//                     Clipart, Background, Pattern, QR Code, Barcode, Layers)
//   Slide-out drawer (400px): opens to the right of the rail when a tool is selected
//   Center canvas: Fabric.js stage + die-cut frame overlay
//   Bottom floating toolbar: zoom / fit / rotate / pan / undo / redo
//   Top floating text-format toolbar: appears when text object selected
//
// Phase C ships the layout shell + canvas + Product drawer (die-cut guide
// toggles). All other tool drawers are placeholder buttons that just toggle
// state — they get wired in Phase D one at a time per
// docs/DESIGN_STUDIO_REBUILD.md §5 build sequence.

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  DieCutFrame,
  DieCutLegend,
  type BrandCanvasAssets,
  type DieCutSpec,
  type FabricCanvas,
  type GuideVisibility,
  DEFAULT_GUIDES,
} from '@ilaunchify/ui'
import { useCanvasHistory } from './useCanvasHistory'
import {
  useSelectedObject,
  isTextObject,
  getCustomType,
  isImageLikeCustomType,
} from './useSelectedObject'
import { useAutoSave, type SaveStatus } from './useAutoSave'
import {
  useCanvasShortcuts,
  rotateActive,
  resetRotation,
} from './useCanvasShortcuts'
import { usePanMode } from './usePanMode'
import { TextFormatToolbar } from './TextFormatToolbar'
import { NutritionFactsToolbar } from './NutritionFactsToolbar'
import { ImageToolbar } from './ImageToolbar'
import { TextDrawer } from './drawers/TextDrawer'
import { LayersDrawer } from './drawers/LayersDrawer'
import { ImagesDrawer } from './drawers/ImagesDrawer'
import { BackgroundDrawer } from './drawers/BackgroundDrawer'
import { QrCodeDrawer } from './drawers/QrCodeDrawer'
import { BarcodeDrawer } from './drawers/BarcodeDrawer'
import { LabelDrawer } from './drawers/LabelDrawer'
import {
  Inbox,
  Tag,
  Type as TypeIcon,
  Image as ImageIcon,
  Sparkles,
  Brush,
  ImageDown,
  Grid3x3,
  QrCode,
  Barcode,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCw,
  RotateCcw,
  Hand,
  Undo2,
  Redo2,
  ShieldCheck,
  Eye,
  X,
} from 'lucide-react'

// Stage is dynamically imported with ssr:false because Fabric.js needs `window`.
const Stage = dynamic(() => import('@ilaunchify/ui').then((m) => ({ default: m.Stage })), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink-100 text-sm text-ink-500">
      Loading canvas…
    </div>
  ),
})

interface Props {
  productId: string
  productName: string
  dieCut: DieCutSpec
  brandAssets: BrandCanvasAssets
  /** Existing Fabric JSON to hydrate the canvas with on mount. */
  initialDesignJson: object | null
}

type ToolKey =
  | 'product'
  | 'label'
  | 'text'
  | 'images'
  | 'graphics'
  | 'clipart'
  | 'background'
  | 'pattern'
  | 'qrcode'
  | 'barcode'
  | 'layers'

const TOOLS: Array<{ key: ToolKey; label: string; icon: typeof Inbox; v1: boolean }> = [
  { key: 'product', label: 'Product', icon: Inbox, v1: true },
  { key: 'label', label: 'Label', icon: Tag, v1: true },
  { key: 'text', label: 'Text', icon: TypeIcon, v1: true },
  { key: 'images', label: 'Images', icon: ImageIcon, v1: true },
  { key: 'graphics', label: 'Graphics', icon: Sparkles, v1: false },
  { key: 'clipart', label: 'Clipart', icon: Brush, v1: false },
  { key: 'background', label: 'Background', icon: ImageDown, v1: true },
  { key: 'pattern', label: 'Pattern', icon: Grid3x3, v1: false },
  { key: 'qrcode', label: 'QR Code', icon: QrCode, v1: true },
  { key: 'barcode', label: 'Barcode', icon: Barcode, v1: true },
  { key: 'layers', label: 'Layers', icon: Layers, v1: true },
]

export function CanvasLayoutShell({
  productId,
  productName,
  dieCut,
  brandAssets,
  initialDesignJson,
}: Props) {
  const [activeTool, setActiveTool] = useState<ToolKey | null>('product')
  const [guides, setGuides] = useState<GuideVisibility>(DEFAULT_GUIDES)
  const [zoom, setZoom] = useState(1) // multiplier on top of pxPerMm
  const [canvas, setCanvas] = useState<FabricCanvas | null>(null)
  const basePxPerMm = 3.0
  const pxPerMm = basePxPerMm * zoom

  const history = useCanvasHistory(canvas)
  const selected = useSelectedObject(canvas)
  const selectedCustomType = getCustomType(selected)
  const showTextToolbar = isTextObject(selected)
  const showNutritionToolbar = selectedCustomType === 'nutrition-panel'
  const showImageToolbar = isImageLikeCustomType(selectedCustomType)
  const autosave = useAutoSave(canvas, productId)
  const { panMode, togglePan } = usePanMode(canvas)
  useCanvasShortcuts(canvas)

  function toggleTool(key: ToolKey) {
    setActiveTool((prev) => (prev === key ? null : key))
  }

  // Keyboard shortcuts: Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z (or Y) for redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        history.undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        history.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-50">
      {/* Top bar */}
      <TopBar
        productName={productName}
        brandName={brandAssets.brandName}
        productId={productId}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        saveStatus={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        saveError={autosave.error}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left rail */}
        <LeftRail activeTool={activeTool} onToggle={toggleTool} />

        {/* Drawer slot */}
        {activeTool && (
          <ToolDrawer
            tool={activeTool}
            dieCut={dieCut}
            guides={guides}
            setGuides={setGuides}
            brandAssets={brandAssets}
            canvas={canvas}
            productId={productId}
            onClose={() => setActiveTool(null)}
          />
        )}

        {/* Canvas viewport */}
        <div className="relative flex-1 overflow-auto bg-ink-100">
          <div className="flex min-h-full items-center justify-center p-12">
            <CanvasStageWithFrame
              dieCut={dieCut}
              pxPerMm={pxPerMm}
              guides={guides}
              initialDesignJson={initialDesignJson}
              onReady={setCanvas}
            />
          </div>

          {/* Top floating selection-aware toolbars — exactly one renders
              at a time based on the active object's customType. Drawers
              add new things; these toolbars edit selected things. */}
          {showTextToolbar && selected && (
            <TextFormatToolbar
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
            />
          )}
          {showNutritionToolbar && selected && (
            <NutritionFactsToolbar
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
            />
          )}
          {showImageToolbar && selected && (
            <ImageToolbar canvas={canvas} active={selected} />
          )}

          {/* Bottom floating controls */}
          <BottomToolbar
            zoom={zoom}
            setZoom={setZoom}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            canRotate={selected !== null}
            onRotateLeft={() => canvas && rotateActive(canvas, -15)}
            onRotateRight={() => canvas && rotateActive(canvas, 15)}
            onResetRotation={() => canvas && resetRotation(canvas)}
            panMode={panMode}
            onTogglePan={togglePan}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Top bar
// ============================================================================

function TopBar({
  productName,
  brandName,
  productId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  lastSavedAt,
  saveError,
}: {
  productName: string
  brandName: string
  productId: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  saveStatus: SaveStatus
  lastSavedAt: Date | null
  saveError: string | null
}) {
  return (
    <header className="flex h-[73px] items-center justify-between border-b border-ink-200 bg-white px-4">
      <div className="flex items-center gap-4">
        <Link href={`/products/${productId}`} className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-pink-500 text-[12px] font-extrabold text-white">
            iL
          </div>
          <span className="font-display text-[18px] font-extrabold tracking-[-0.03em] text-ink-900">
            iLaunchify
          </span>
        </Link>
        <div className="ml-2 border-l border-ink-200 pl-4">
          <div className="text-xs text-ink-500">{brandName}</div>
          <div className="text-sm font-medium text-ink-900">{productName}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SaveStatusIndicator
          status={saveStatus}
          lastSavedAt={lastSavedAt}
          error={saveError}
        />
        <IconButton ariaLabel="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Redo (⇧⌘Z)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <div className="mx-1 h-6 w-px bg-ink-200" />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-700 hover:bg-ink-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Compliance
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-700 hover:bg-ink-50"
        >
          <Eye className="h-3.5 w-3.5" />
          Mockup
        </button>
        <Link
          href={`/products/${productId}`}
          className="ml-1 inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          Exit Studio
        </Link>
      </div>
    </header>
  )
}

// ============================================================================
// Left rail
// ============================================================================

function LeftRail({
  activeTool,
  onToggle,
}: {
  activeTool: ToolKey | null
  onToggle: (k: ToolKey) => void
}) {
  return (
    <nav
      className="flex w-20 flex-col gap-0.5 border-r border-ink-200 bg-white py-2"
      role="toolbar"
      aria-label="Design tools"
    >
      {TOOLS.map(({ key, label, icon: Icon, v1 }) => {
        const isActive = activeTool === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
              isActive
                ? 'bg-pink-50 text-pink-700'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
            }`}
            aria-pressed={isActive}
          >
            <Icon className="h-5 w-5" />
            <span className="text-center leading-tight">{label}</span>
            {!v1 && (
              <span
                className="rounded bg-ink-100 px-1 text-[8px] font-semibold uppercase tracking-wider text-ink-500"
                title="Coming next"
              >
                soon
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

// ============================================================================
// Tool drawer
// ============================================================================

function ToolDrawer({
  tool,
  dieCut,
  guides,
  setGuides,
  brandAssets,
  canvas,
  productId,
  onClose,
}: {
  tool: ToolKey
  dieCut: DieCutSpec
  guides: GuideVisibility
  setGuides: (g: GuideVisibility) => void
  brandAssets: BrandCanvasAssets
  canvas: FabricCanvas | null
  productId: string
  onClose: () => void
}) {
  // canvas is the live Fabric instance — drawers that need it (Text /
  // Images / Layers / etc.) receive it through this prop.
  const titles: Record<ToolKey, string> = {
    product: 'Product',
    label: 'Label',
    text: 'Text',
    images: 'Images',
    graphics: 'Graphics',
    clipart: 'Clipart',
    background: 'Background',
    pattern: 'Pattern',
    qrcode: 'QR Code',
    barcode: 'Barcode',
    layers: 'Layers',
  }

  return (
    <aside className="flex w-[400px] flex-col border-r border-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
        <h2 className="text-base font-semibold text-ink-900">{titles[tool]}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="rounded p-1 text-ink-500 hover:bg-ink-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tool === 'product' && (
          <ProductDrawer dieCut={dieCut} guides={guides} setGuides={setGuides} brandAssets={brandAssets} />
        )}
        {tool === 'label' && <LabelDrawer canvas={canvas} brandAssets={brandAssets} />}
        {tool === 'text' && <TextDrawer canvas={canvas} brandAssets={brandAssets} />}
        {tool === 'images' && (
          <ImagesDrawer
            canvas={canvas}
            brandAssets={brandAssets}
            productId={productId}
          />
        )}
        {tool === 'background' && (
          <BackgroundDrawer canvas={canvas} brandAssets={brandAssets} />
        )}
        {tool === 'qrcode' && <QrCodeDrawer canvas={canvas} />}
        {tool === 'barcode' && <BarcodeDrawer canvas={canvas} />}
        {tool === 'layers' && <LayersDrawer canvas={canvas} />}
        {tool !== 'product' &&
          tool !== 'label' &&
          tool !== 'text' &&
          tool !== 'images' &&
          tool !== 'background' &&
          tool !== 'qrcode' &&
          tool !== 'barcode' &&
          tool !== 'layers' && <ComingSoonStub label={titles[tool]} />}
      </div>
    </aside>
  )
}

function ProductDrawer({
  dieCut,
  guides,
  setGuides,
  brandAssets,
}: {
  dieCut: DieCutSpec
  guides: GuideVisibility
  setGuides: (g: GuideVisibility) => void
  brandAssets: BrandCanvasAssets
}) {
  return (
    <div className="space-y-5">
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Product details
        </div>
        <h3 className="mt-1 text-sm font-semibold text-ink-900">{dieCut.name}</h3>
        <p className="mt-1 text-xs text-ink-500">
          {dieCut.widthMm.toFixed(1)} × {dieCut.heightMm.toFixed(1)} mm · {dieCut.category.replace('_', ' ')}
          <br />
          Bleed {dieCut.bleedMm}mm · Safe area {dieCut.safeAreaMm}mm
        </p>
      </section>

      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
          Die-cut guides
        </div>
        <div className="space-y-1.5">
          <GuideToggle
            label="Show bleed line"
            checked={guides.bleed}
            onChange={(v) => setGuides({ ...guides, bleed: v })}
          />
          <GuideToggle
            label="Show trim / cut line"
            checked={guides.trim}
            onChange={(v) => setGuides({ ...guides, trim: v })}
          />
          <GuideToggle
            label="Show safety line"
            checked={guides.safe}
            onChange={(v) => setGuides({ ...guides, safe: v })}
          />
          <GuideToggle
            label="Show placement zones"
            checked={guides.zones}
            onChange={(v) => setGuides({ ...guides, zones: v })}
          />
        </div>
        <div className="mt-3">
          <DieCutLegend guides={guides} />
        </div>
      </section>

      <section className="rounded-md border border-pink-200 bg-pink-50/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700">
          Brand assets loaded
        </div>
        <p className="mt-1 text-xs text-ink-700">
          {brandAssets.fonts.length} font{brandAssets.fonts.length === 1 ? '' : 's'} ·{' '}
          {[brandAssets.colorPrimary, brandAssets.colorSecondary, brandAssets.colorAccent].filter(Boolean).length +
            brandAssets.extraSwatches.length}{' '}
          color swatch
          {brandAssets.extraSwatches.length === 0 ? '' : 'es'} ·{' '}
          {brandAssets.logos.length} logo variant{brandAssets.logos.length === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-[10px] text-ink-600">
          These pin to the top of the Text drawer&apos;s font row when the Text
          tool is open. Images + color pickers wire up next.
        </p>
      </section>
    </div>
  )
}

function GuideToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-pink-500"
      />
      {label}
    </label>
  )
}

function ComingSoonStub({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-8 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-pink-500" />
      <h3 className="mt-3 text-sm font-semibold text-ink-900">{label} — coming next</h3>
      <p className="mx-auto mt-2 max-w-xs text-xs text-ink-500">
        Phase C ships the canvas foundation. Each tool drawer (Text, Label, Images, Layers,
        QR&nbsp;/&nbsp;Barcode, etc.) wires up in Phase D — see
        <code className="mx-1 rounded bg-ink-200 px-1 py-0.5 text-[10px]">docs/DESIGN_STUDIO_REBUILD.md §5</code>
        for the order.
      </p>
    </div>
  )
}

// ============================================================================
// Canvas viewport
// ============================================================================

function CanvasStageWithFrame({
  dieCut,
  pxPerMm,
  guides,
  initialDesignJson,
  onReady,
}: {
  dieCut: DieCutSpec
  pxPerMm: number
  guides: GuideVisibility
  initialDesignJson: object | null
  onReady: (canvas: FabricCanvas) => void
}) {
  const fullWidthMm = dieCut.widthMm + 2 * dieCut.bleedMm
  const fullHeightMm = dieCut.heightMm + 2 * dieCut.bleedMm
  const pixelWidth = fullWidthMm * pxPerMm
  const pixelHeight = fullHeightMm * pxPerMm

  return (
    <div
      className="relative shadow-2xl"
      style={{ width: pixelWidth, height: pixelHeight }}
    >
      <Stage
        dieCut={dieCut}
        pxPerMm={pxPerMm}
        surfaceColor="#ffffff"
        initialDesignJson={initialDesignJson ?? undefined}
        onReady={onReady}
      />
      <DieCutFrame dieCut={dieCut} pxPerMm={pxPerMm} guides={guides} />
    </div>
  )
}

// ============================================================================
// Bottom toolbar
// ============================================================================

function BottomToolbar({
  zoom,
  setZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canRotate,
  onRotateLeft,
  onRotateRight,
  onResetRotation,
  panMode,
  onTogglePan,
}: {
  zoom: number
  setZoom: (z: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  canRotate: boolean
  onRotateLeft: () => void
  onRotateRight: () => void
  onResetRotation: () => void
  panMode: boolean
  onTogglePan: () => void
}) {
  const display = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom])
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 shadow-md">
        <IconButton
          ariaLabel="Zoom out"
          onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(2)))}
          disabled={zoom <= 0.3}
        >
          <ZoomOut className="h-4 w-4" />
        </IconButton>
        <span className="min-w-[44px] text-center text-xs font-mono text-ink-600">{display}</span>
        <IconButton
          ariaLabel="Zoom in"
          onClick={() => setZoom(Math.min(3, +(zoom + 0.1).toFixed(2)))}
          disabled={zoom >= 3}
        >
          <ZoomIn className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Fit to screen" onClick={() => setZoom(1)}>
          <Maximize className="h-4 w-4" />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-ink-200" />
        <IconButton
          ariaLabel="Rotate left 15°"
          onClick={onRotateLeft}
          disabled={!canRotate}
        >
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <IconButton
          ariaLabel="Rotate right 15°"
          onClick={onRotateRight}
          disabled={!canRotate}
        >
          <RotateCw className="h-4 w-4" />
        </IconButton>
        <IconButton
          ariaLabel="Reset rotation"
          onClick={onResetRotation}
          disabled={!canRotate}
        >
          <span className="text-[10px] font-bold">0°</span>
        </IconButton>
        <PanToggleButton active={panMode} onClick={onTogglePan} />
        <div className="mx-1 h-5 w-px bg-ink-200" />
        <IconButton ariaLabel="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Redo (⇧⌘Z)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

// ============================================================================
// Shared
// ============================================================================

function PanToggleButton({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Exit pan mode' : 'Pan mode'}
      title={active ? 'Click to exit pan mode' : 'Drag the canvas to pan'}
      className={
        'rounded p-1.5 transition-colors ' +
        (active
          ? 'bg-ink-900 text-white hover:bg-black'
          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')
      }
    >
      <Hand className="h-4 w-4" />
    </button>
  )
}

function SaveStatusIndicator({
  status,
  lastSavedAt,
  error,
}: {
  status: SaveStatus
  lastSavedAt: Date | null
  error: string | null
}) {
  // Tick every 15s so "Saved 12s ago" stays approximately fresh.
  const [, force] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const id = setInterval(force, 15_000)
    return () => clearInterval(id)
  }, [])

  let dotColor = 'bg-ink-300'
  let label: React.ReactNode = 'Not saved yet'
  let title: string | undefined

  switch (status) {
    case 'saving':
      dotColor = 'bg-pink-500 animate-pulse'
      label = 'Saving…'
      break
    case 'saved':
      dotColor = 'bg-emerald-500'
      label = lastSavedAt
        ? `Saved ${relativeTime(lastSavedAt)}`
        : 'Saved'
      title = lastSavedAt?.toLocaleString()
      break
    case 'dirty':
      dotColor = 'bg-amber-500'
      label = 'Unsaved changes'
      break
    case 'error':
      dotColor = 'bg-red-500'
      label = 'Save failed'
      title = error ?? undefined
      break
    case 'idle':
    default:
      label = lastSavedAt
        ? `Saved ${relativeTime(lastSavedAt)}`
        : 'Ready'
      title = lastSavedAt?.toLocaleString()
      break
  }

  return (
    <span
      className="mr-2 flex items-center gap-1.5 text-xs text-ink-600 tabular-nums"
      title={title}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  )
}

function relativeTime(d: Date): string {
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

function IconButton({
  children,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="rounded p-1.5 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
