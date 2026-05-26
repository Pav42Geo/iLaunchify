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

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  DieCutFrame,
  DieCutLegend,
  type BrandCanvasAssets,
  type DieCutSpec,
  type GuideVisibility,
  DEFAULT_GUIDES,
} from '@ilaunchify/ui'
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
    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-500">
      Loading canvas…
    </div>
  ),
})

interface Props {
  productId: string
  productName: string
  dieCut: DieCutSpec
  brandAssets: BrandCanvasAssets
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
  { key: 'label', label: 'Label', icon: Tag, v1: false },
  { key: 'text', label: 'Text', icon: TypeIcon, v1: false },
  { key: 'images', label: 'Images', icon: ImageIcon, v1: false },
  { key: 'graphics', label: 'Graphics', icon: Sparkles, v1: false },
  { key: 'clipart', label: 'Clipart', icon: Brush, v1: false },
  { key: 'background', label: 'Background', icon: ImageDown, v1: false },
  { key: 'pattern', label: 'Pattern', icon: Grid3x3, v1: false },
  { key: 'qrcode', label: 'QR Code', icon: QrCode, v1: false },
  { key: 'barcode', label: 'Barcode', icon: Barcode, v1: false },
  { key: 'layers', label: 'Layers', icon: Layers, v1: false },
]

export function CanvasLayoutShell({ productId, productName, dieCut, brandAssets }: Props) {
  const [activeTool, setActiveTool] = useState<ToolKey | null>('product')
  const [guides, setGuides] = useState<GuideVisibility>(DEFAULT_GUIDES)
  const [zoom, setZoom] = useState(1) // multiplier on top of pxPerMm
  const basePxPerMm = 3.0
  const pxPerMm = basePxPerMm * zoom

  const drawerWidth = activeTool ? 400 : 0

  function toggleTool(key: ToolKey) {
    setActiveTool((prev) => (prev === key ? null : key))
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-50">
      {/* Top bar */}
      <TopBar productName={productName} brandName={brandAssets.brandName} productId={productId} />

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
            onClose={() => setActiveTool(null)}
          />
        )}

        {/* Canvas viewport */}
        <div className="relative flex-1 overflow-auto bg-zinc-100" style={{ marginLeft: 0 }}>
          <div className="flex min-h-full items-center justify-center p-12">
            <CanvasStageWithFrame
              dieCut={dieCut}
              pxPerMm={pxPerMm}
              guides={guides}
            />
          </div>

          {/* Bottom floating controls */}
          <BottomToolbar zoom={zoom} setZoom={setZoom} />
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
}: {
  productName: string
  brandName: string
  productId: string
}) {
  return (
    <header className="flex h-[73px] items-center justify-between border-b border-zinc-200 bg-white px-4">
      <div className="flex items-center gap-4">
        <Link href={`/products/${productId}`} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-600 text-sm font-bold text-white">
            iL
          </div>
          <span className="text-lg font-bold tracking-tight">iLaunchify</span>
        </Link>
        <div className="ml-2 border-l border-zinc-200 pl-4">
          <div className="text-xs text-zinc-500">{brandName}</div>
          <div className="text-sm font-medium text-zinc-900">{productName}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="mr-2 flex items-center gap-1 text-xs text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Saved
        </span>
        <IconButton ariaLabel="Undo">
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Redo">
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <div className="mx-1 h-6 w-px bg-zinc-200" />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 hover:bg-zinc-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Compliance
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 hover:bg-zinc-50"
        >
          <Eye className="h-3.5 w-3.5" />
          Mockup
        </button>
        <Link
          href={`/products/${productId}`}
          className="ml-1 inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
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
      className="flex w-20 flex-col gap-0.5 border-r border-zinc-200 bg-white py-2"
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
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
            aria-pressed={isActive}
          >
            <Icon className="h-5 w-5" />
            <span className="text-center leading-tight">{label}</span>
            {!v1 && (
              <span
                className="rounded bg-zinc-100 px-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-500"
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
  onClose,
}: {
  tool: ToolKey
  dieCut: DieCutSpec
  guides: GuideVisibility
  setGuides: (g: GuideVisibility) => void
  brandAssets: BrandCanvasAssets
  onClose: () => void
}) {
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
    <aside className="flex w-[400px] flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold text-zinc-900">{titles[tool]}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tool === 'product' && (
          <ProductDrawer dieCut={dieCut} guides={guides} setGuides={setGuides} brandAssets={brandAssets} />
        )}
        {tool !== 'product' && <ComingSoonStub label={titles[tool]} />}
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Product details
        </div>
        <h3 className="mt-1 text-sm font-semibold text-zinc-900">{dieCut.name}</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {dieCut.widthMm.toFixed(1)} × {dieCut.heightMm.toFixed(1)} mm · {dieCut.category.replace('_', ' ')}
          <br />
          Bleed {dieCut.bleedMm}mm · Safe area {dieCut.safeAreaMm}mm
        </p>
      </section>

      <section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
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

      <section className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
          Brand assets loaded
        </div>
        <p className="mt-1 text-xs text-emerald-900">
          {brandAssets.fonts.length} font{brandAssets.fonts.length === 1 ? '' : 's'} ·{' '}
          {[brandAssets.colorPrimary, brandAssets.colorSecondary, brandAssets.colorAccent].filter(Boolean).length +
            brandAssets.extraSwatches.length}{' '}
          color swatch
          {brandAssets.extraSwatches.length === 0 ? '' : 'es'} ·{' '}
          {brandAssets.logos.length} logo variant{brandAssets.logos.length === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-[10px] text-emerald-800">
          These will pin to the top of the Text, color picker, and Images drawers once those
          tools wire up in Phase D.
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
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-emerald-500"
      />
      {label}
    </label>
  )
}

function ComingSoonStub({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-emerald-500" />
      <h3 className="mt-3 text-sm font-semibold text-zinc-900">{label} — coming next</h3>
      <p className="mx-auto mt-2 max-w-xs text-xs text-zinc-500">
        Phase C ships the canvas foundation. Each tool drawer (Text, Label, Images, Layers,
        QR&nbsp;/&nbsp;Barcode, etc.) wires up in Phase D — see
        <code className="mx-1 rounded bg-zinc-200 px-1 py-0.5 text-[10px]">docs/DESIGN_STUDIO_REBUILD.md §5</code>
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
}: {
  dieCut: DieCutSpec
  pxPerMm: number
  guides: GuideVisibility
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
      <Stage dieCut={dieCut} pxPerMm={pxPerMm} surfaceColor="#ffffff" />
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
}: {
  zoom: number
  setZoom: (z: number) => void
}) {
  const display = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom])
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 shadow-md">
        <IconButton
          ariaLabel="Zoom out"
          onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(2)))}
          disabled={zoom <= 0.3}
        >
          <ZoomOut className="h-4 w-4" />
        </IconButton>
        <span className="min-w-[44px] text-center text-xs font-mono text-zinc-600">{display}</span>
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
        <div className="mx-1 h-5 w-px bg-zinc-200" />
        <IconButton ariaLabel="Rotate left">
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Rotate right">
          <RotateCw className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Pan mode">
          <Hand className="h-4 w-4" />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-zinc-200" />
        <IconButton ariaLabel="Undo">
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton ariaLabel="Redo">
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

// ============================================================================
// Shared
// ============================================================================

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
      className="rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
