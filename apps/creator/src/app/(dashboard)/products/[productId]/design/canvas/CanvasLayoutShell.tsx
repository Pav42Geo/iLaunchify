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
  isCodeCustomType,
} from './useSelectedObject'
import { useAutoSave, type SaveStatus } from './useAutoSave'
import {
  useCanvasShortcuts,
  rotateActive,
  resetRotation,
} from './useCanvasShortcuts'
import { usePanMode } from './usePanMode'
import { useLabelMinSize } from './useLabelMinSize'
import { useWheelZoom } from './useWheelZoom'
import { useObjectClipboard } from './useObjectClipboard'
import { ObjectActions } from './ObjectActions'
import { ObjectContextMenu } from './ObjectContextMenu'
import type { FabricObject } from '@ilaunchify/ui'
import { TextFormatToolbar } from './TextFormatToolbar'
import { NutritionFactsToolbar } from './NutritionFactsToolbar'
import { ImageToolbar } from './ImageToolbar'
import { CodeToolbar } from './CodeToolbar'
import { CompliancePanel } from './CompliancePanel'
import { MockupModal } from './MockupModal'
import { ExportModal } from './ExportModal'
import { recordDesignExport } from './actions'
import { TextDrawer } from './drawers/TextDrawer'
import { TextFontDrawer } from './drawers/TextFontDrawer'
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
  Download,
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
  /**
   * Server-derived product context used by the compliance scan + label
   * drawer pre-fill. allergens / bioengineered come from the recipe;
   * netQuantity + netQuantityKind from the bound variant. See
   * page.tsx#deriveProductCtx.
   */
  productCtx: {
    allergens: string[]
    bioengineered: boolean
    netQuantity: string | null
    netQuantityKind: 'solid' | 'liquid' | 'count'
  }
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
  productCtx: serverProductCtx,
}: Props) {
  const [activeTool, setActiveTool] = useState<ToolKey | null>('product')
  const [guides, setGuides] = useState<GuideVisibility>(DEFAULT_GUIDES)
  const [zoom, setZoom] = useState(1) // multiplier on top of pxPerMm
  const [canvas, setCanvas] = useState<FabricCanvas | null>(null)
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [mockupOpen, setMockupOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // DS-66f — Canva-style font drawer. Toggled by clicking the font
  // field in TextFormatToolbar; replaces whichever rail-tool drawer
  // is currently mounted in the drawer slot.
  const [fontDrawerOpen, setFontDrawerOpen] = useState(false)

  function openFontDrawer() {
    clearTimers()
    setActiveTool(null)
    setPinned(false)
    setFontDrawerOpen(true)
  }

  function closeFontDrawer() {
    setFontDrawerOpen(false)
  }
  // Selection-aware auto-close lives below useSelectedObject() — see the
  // useEffect there.

  // DS-60 — refs + state for object actions, context menu, wheel zoom.
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const canvasContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = React.useState<{
    target: FabricObject | null
    x: number | null
    y: number | null
  }>({ target: null, x: null, y: null })
  const clipboard = useObjectClipboard(canvas)
  useWheelZoom(scrollRef.current, zoom, setZoom)

  // Right-click on a canvas object → open ObjectContextMenu at mouse pos.
  // Fabric routes pointer events through its own pipeline, so we hook the
  // upper DOM canvas's contextmenu directly and ask Fabric for the object
  // under the cursor.
  React.useEffect(() => {
    if (!canvas) return
    // Fabric v6 exposes the upper canvas element via .upperCanvasEl.
    const el = (canvas as unknown as { upperCanvasEl?: HTMLCanvasElement })
      .upperCanvasEl
    if (!el) return

    function onCtx(e: MouseEvent) {
      if (!canvas) return
      // Pick the topmost object under the mouse — null if user right-clicked
      // empty canvas.
      const fcanvas = canvas as unknown as {
        findTarget: (e: MouseEvent) => FabricObject | undefined
      }
      const target = fcanvas.findTarget?.(e) ?? null
      if (target) {
        e.preventDefault()
        canvas.setActiveObject(target)
        canvas.requestRenderAll()
        setContextMenu({ target, x: e.clientX, y: e.clientY })
      }
    }
    el.addEventListener('contextmenu', onCtx)
    return () => el.removeEventListener('contextmenu', onCtx)
  }, [canvas])

  // productCtx for the compliance scan + Label drawer pre-fill. productName
  // + brandName come from the shell props; allergens / bioengineered /
  // netQuantity / netQuantityKind are derived server-side in
  // page.tsx#deriveProductCtx and arrive via the productCtx prop
  // (DS-56 + DS-57).
  const productCtx = useMemo(
    () => ({
      productName,
      brandName: brandAssets.brandName,
      allergens: serverProductCtx.allergens,
      bioengineered: serverProductCtx.bioengineered,
      netQuantity: serverProductCtx.netQuantity,
      netQuantityKind: serverProductCtx.netQuantityKind,
    }),
    [
      productName,
      brandAssets.brandName,
      serverProductCtx.allergens,
      serverProductCtx.bioengineered,
      serverProductCtx.netQuantity,
      serverProductCtx.netQuantityKind,
    ],
  )
  const basePxPerMm = 3.0
  const pxPerMm = basePxPerMm * zoom

  const history = useCanvasHistory(canvas)
  const selected = useSelectedObject(canvas)
  const selectedCustomType = getCustomType(selected)
  const showTextToolbar = isTextObject(selected)
  const showNutritionToolbar = selectedCustomType === 'nutrition-panel'
  const showCodeToolbar = isCodeCustomType(selectedCustomType)
  const showImageToolbar = isImageLikeCustomType(selectedCustomType)

  // DS-66f — auto-close the font drawer when selection moves off the text
  // object that opened it (the trigger button is no longer visible, and
  // the user expects the rail tools to come back).
  React.useEffect(() => {
    if (fontDrawerOpen && !showTextToolbar) {
      setFontDrawerOpen(false)
    }
  }, [fontDrawerOpen, showTextToolbar])

  const autosave = useAutoSave(canvas, productId)
  const { panMode, togglePan } = usePanMode(canvas)
  useCanvasShortcuts(canvas)
  useLabelMinSize(canvas) // DS-58d — clamp scale handles to FDA min type sizes

  // DS-61 / DS-62 — hover-to-open left rail with click-to-pin.
  //
  // Two timers manage the hover intent gestalt; a separate `pinned`
  // boolean overrides the close timer when the user has committed to a
  // tool by clicking it.
  //
  //   openTimer  = small delay on mouseenter so quick traverses across
  //                icons don't flicker drawers in and out (60ms).
  //   closeTimer = longer delay on mouseleave so the user can move
  //                from a rail icon INTO the drawer area without
  //                losing it (200ms).
  //   pinned     = true when the user clicked the icon. Pinned drawer
  //                ignores closeTimer; only an explicit menu action
  //                (click same icon, click different icon, click drawer
  //                X) closes it.
  const openTimerRef = React.useRef<number | null>(null)
  const closeTimerRef = React.useRef<number | null>(null)
  const [pinned, setPinned] = useState(false)
  // Mirror pinned into a ref so the timer callbacks always read the
  // latest value without needing pinned in their useCallback deps
  // (which would re-create them and orphan the timers).
  const pinnedRef = React.useRef(pinned)
  React.useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleOpen = React.useCallback((key: ToolKey) => {
    cancelClose()
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
    }
    openTimerRef.current = window.setTimeout(() => {
      setActiveTool(key)
      openTimerRef.current = null
    }, 60)
  }, [cancelClose])

  const scheduleClose = React.useCallback(() => {
    // Pinned drawer doesn't auto-close on mouseleave — only explicit
    // menu actions close a pinned drawer.
    if (pinnedRef.current) return
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    closeTimerRef.current = window.setTimeout(() => {
      setActiveTool(null)
      closeTimerRef.current = null
    }, 200)
  }, [])

  // Cleanup on unmount so no stray setState fires.
  React.useEffect(() => clearTimers, [clearTimers])

  function toggleTool(key: ToolKey) {
    // Click is decisive — cancel any pending hover schedules first.
    clearTimers()
    // Always defer to the rail tool over the font drawer (DS-66f).
    setFontDrawerOpen(false)
    // Click the same icon while pinned → unpin + close.
    if (pinned && activeTool === key) {
      setPinned(false)
      setActiveTool(null)
      return
    }
    // Otherwise: open + pin to this tool. Switching tools via click
    // stays pinned to the new one.
    setPinned(true)
    setActiveTool(key)
  }

  function closeDrawer() {
    clearTimers()
    setPinned(false)
    setActiveTool(null)
    setFontDrawerOpen(false)
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
        complianceOpen={complianceOpen}
        onToggleCompliance={() => setComplianceOpen((v) => !v)}
        mockupOpen={mockupOpen}
        onToggleMockup={() => setMockupOpen((v) => !v)}
        exportOpen={exportOpen}
        onToggleExport={() => setExportOpen((v) => !v)}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Rail + drawer wrap. Cursor moving anywhere inside this group
            cancels the pending close so the drawer doesn't disappear
            while the user reaches for it. Mouseleave schedules the
            close (DS-61). */}
        <div
          className="flex"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {/* Left rail */}
          <LeftRail
            activeTool={activeTool}
            onToggle={toggleTool}
            onHover={scheduleOpen}
          />

          {/* Drawer slot — font drawer (DS-66f) takes precedence over the
              rail tool drawer when open. Only one drawer ever mounts. */}
          {fontDrawerOpen && selected && isTextObject(selected) ? (
            <TextFontDrawer
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
              onClose={closeFontDrawer}
            />
          ) : activeTool ? (
            <ToolDrawer
              tool={activeTool}
              dieCut={dieCut}
              guides={guides}
              setGuides={setGuides}
              brandAssets={brandAssets}
              canvas={canvas}
              productId={productId}
              productName={productName}
              productCtx={productCtx}
              onClose={closeDrawer}
            />
          ) : null}
        </div>

        {/* Canvas viewport — DS-59 fix.
            The outer container is non-scrolling (overflow-hidden). The
            inner abs+inset-0 div is the scroller for the canvas content
            only; all floating UI (toolbars, CompliancePanel, BottomToolbar)
            sits as a SIBLING of that scroller, so its absolute positions
            are relative to the fixed outer box and never move with scroll.
            Drawers in the left rail + CompliancePanel internals already
            scroll internally for tall content. */}
        <div className="relative flex-1 overflow-hidden bg-ink-100">
          {/* Scrolling canvas content layer. Ref captured for the
              ctrl+wheel zoom hook + the ObjectActions screen-space
              translation. */}
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <div className="flex min-h-full items-center justify-center p-12">
              <div ref={canvasContainerRef}>
                <CanvasStageWithFrame
                  dieCut={dieCut}
                  pxPerMm={pxPerMm}
                  guides={guides}
                  initialDesignJson={initialDesignJson}
                  onReady={setCanvas}
                />
              </div>
            </div>
          </div>

          {/* Top floating selection-aware toolbars — exactly one renders
              at a time based on the active object's customType. Drawers
              add new things; these toolbars edit selected things. */}
          {showTextToolbar && selected && (
            <TextFormatToolbar
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
              onOpenFontDrawer={openFontDrawer}
            />
          )}
          {showNutritionToolbar && selected && (
            <NutritionFactsToolbar
              canvas={canvas}
              active={selected}
              brandAssets={brandAssets}
            />
          )}
          {showCodeToolbar && selected && (
            <CodeToolbar canvas={canvas} active={selected} />
          )}
          {showImageToolbar && selected && (
            <ImageToolbar canvas={canvas} active={selected} />
          )}

          {/* Per-object action chrome (DS-60d). Renders for any selected
              object that isn't currently in text-editing mode. Hides during
              drag/scale to avoid lag. */}
          {selected && (
            <ObjectActions
              canvas={canvas}
              active={selected}
              canvasContainer={canvasContainerRef.current}
              onShowMore={(x, y) =>
                setContextMenu({ target: selected, x, y })
              }
            />
          )}

          {/* Right-click + More-button context menu (DS-60c). */}
          <ObjectContextMenu
            canvas={canvas}
            target={contextMenu.target}
            x={contextMenu.x}
            y={contextMenu.y}
            clipboard={clipboard}
            onClose={() => setContextMenu({ target: null, x: null, y: null })}
          />

          {/* Compliance scan panel (DS-55) — fixed to the right edge. */}
          <CompliancePanel
            canvas={canvas}
            open={complianceOpen}
            onClose={() => setComplianceOpen(false)}
            productCtx={productCtx}
          />

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

      {/* Mockup viewer (DS-63) — full-screen overlay opened from the
          MOCKUP top-bar button. */}
      <MockupModal
        canvas={canvas}
        dieCut={dieCut}
        pxPerMm={pxPerMm}
        productName={productName}
        brandName={brandAssets.brandName}
        open={mockupOpen}
        onClose={() => setMockupOpen(false)}
      />

      {/* Export modal (DS-64) — generates print-ready PDF / PNG. */}
      <ExportModal
        canvas={canvas}
        dieCut={dieCut}
        pxPerMm={pxPerMm}
        productName={productName}
        brandName={brandAssets.brandName}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExported={async () => {
          await recordDesignExport(productId)
        }}
      />
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
  complianceOpen,
  onToggleCompliance,
  mockupOpen,
  onToggleMockup,
  exportOpen,
  onToggleExport,
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
  complianceOpen: boolean
  onToggleCompliance: () => void
  mockupOpen: boolean
  onToggleMockup: () => void
  exportOpen: boolean
  onToggleExport: () => void
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
          onClick={onToggleCompliance}
          aria-pressed={complianceOpen}
          aria-label={complianceOpen ? 'Close compliance panel' : 'Open compliance panel'}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (complianceOpen
              ? 'border-pink-500 bg-pink-50 text-pink-700'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50')
          }
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Compliance
        </button>
        <button
          type="button"
          onClick={onToggleMockup}
          aria-pressed={mockupOpen}
          aria-label={mockupOpen ? 'Close mockup' : 'Open mockup'}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (mockupOpen
              ? 'border-pink-500 bg-pink-50 text-pink-700'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50')
          }
        >
          <Eye className="h-3.5 w-3.5" />
          Mockup
        </button>
        <button
          type="button"
          onClick={onToggleExport}
          aria-pressed={exportOpen}
          aria-label={exportOpen ? 'Close export' : 'Open export'}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
            (exportOpen
              ? 'border-pink-500 bg-pink-50 text-pink-700'
              : 'border-ink-900 bg-ink-900 text-white hover:bg-black')
          }
        >
          <Download className="h-3.5 w-3.5" />
          Export
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
  onHover,
}: {
  activeTool: ToolKey | null
  onToggle: (k: ToolKey) => void
  /** Schedule a hover-open with intent delay (DS-61). */
  onHover: (k: ToolKey) => void
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
            onMouseEnter={() => onHover(key)}
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
  productName,
  productCtx,
  onClose,
}: {
  tool: ToolKey
  dieCut: DieCutSpec
  guides: GuideVisibility
  setGuides: (g: GuideVisibility) => void
  brandAssets: BrandCanvasAssets
  canvas: FabricCanvas | null
  productId: string
  productName: string
  productCtx: {
    productName: string
    brandName: string
    allergens: string[]
    bioengineered: boolean
    netQuantity: string | null
    netQuantityKind: 'solid' | 'liquid' | 'count'
  }
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
        {tool === 'label' && (
          <LabelDrawer
            canvas={canvas}
            brandAssets={brandAssets}
            productCtx={{
              productName,
              brandName: brandAssets.brandName,
              netQuantity: productCtx.netQuantity,
              allergens: productCtx.allergens,
            }}
          />
        )}
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
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
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
