'use client'

// MockupModal — full-screen overlay that previews the canvas design
// wrapped on a stylized product shape (DS-63b).
//
// Five product templates, one per die-cut category:
//   BOTTLE_WRAP → cylindrical bottle with the label wrapped around
//                 (CSS curve via radial gradient overlay for shading)
//   TUB_LID     → tub viewed from front with lid + side band
//   POUCH_FRONT → stand-up pouch with the label as front face
//   BOX_PANEL   → carton viewed at slight 3D angle with label as panel
//   STICKER     → sticker on a plain surface (flat)
//
// V1 uses purely CSS/SVG shapes — no product photography. This gives
// creators a quick sense of scale, light/dark balance, and curve
// readability without us shipping a photo asset library.
//
// Real-product photo mockups belong to V1.5+ once we know which
// shapes / colors creators ship most.

import * as React from 'react'
import { X, Download } from 'lucide-react'
import {
  snapshotCanvasTrimmed,
  type DieCutSpec,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  dieCut: DieCutSpec
  pxPerMm: number
  productName: string
  brandName: string
  open: boolean
  onClose: () => void
}

export function MockupModal({
  canvas,
  dieCut,
  pxPerMm,
  productName,
  brandName,
  open,
  onClose,
}: Props) {
  const [snapshot, setSnapshot] = React.useState<string | null>(null)
  const [variant, setVariant] = React.useState<MockupVariant>(() =>
    inferVariant(dieCut.category),
  )

  // Take a fresh snapshot when the modal opens. We re-snapshot rather
  // than caching so edits since the last open show up.
  React.useEffect(() => {
    if (!open || !canvas) return
    try {
      const png = snapshotCanvasTrimmed({
        canvas,
        dieCut,
        pxPerMm,
        multiplier: 2,
      })
      setSnapshot(png)
    } catch (err) {
      console.warn('[MockupModal] snapshot failed:', err)
      setSnapshot(null)
    }
  }, [open, canvas, dieCut, pxPerMm])

  // Reset variant choice when die-cut changes — the inferred default
  // is usually right.
  React.useEffect(() => {
    setVariant(inferVariant(dieCut.category))
  }, [dieCut.category])

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-ink-900/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Mockup preview"
      onClick={onClose}
    >
      <Header
        productName={productName}
        brandName={brandName}
        variant={variant}
        onVariant={setVariant}
        onClose={onClose}
        onDownload={() => snapshot && downloadDataUrl(snapshot, `${productName}-flat.png`)}
        hasSnapshot={!!snapshot}
      />

      {/* Stage — stops propagation so clicks inside don't dismiss. */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {snapshot ? (
          <Mockup variant={variant} snapshot={snapshot} dieCut={dieCut} />
        ) : (
          <div className="text-white/70 text-sm">Preparing preview…</div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Header
// ============================================================================

type MockupVariant = 'bottle' | 'tub' | 'pouch' | 'box' | 'sticker' | 'flat'

const VARIANT_LABELS: Record<MockupVariant, string> = {
  bottle: 'Bottle',
  tub: 'Tub',
  pouch: 'Pouch',
  box: 'Box',
  sticker: 'Sticker',
  flat: 'Flat',
}

function inferVariant(category: DieCutSpec['category']): MockupVariant {
  switch (category) {
    case 'BOTTLE_WRAP':
      return 'bottle'
    case 'TUB_LID':
      return 'tub'
    case 'POUCH_FRONT':
      return 'pouch'
    case 'BOX_PANEL':
      return 'box'
    case 'STICKER':
      return 'sticker'
    default:
      return 'flat'
  }
}

function Header({
  productName,
  brandName,
  variant,
  onVariant,
  onClose,
  onDownload,
  hasSnapshot,
}: {
  productName: string
  brandName: string
  variant: MockupVariant
  onVariant: (v: MockupVariant) => void
  onClose: () => void
  onDownload: () => void
  hasSnapshot: boolean
}) {
  const variants: MockupVariant[] = ['flat', 'bottle', 'tub', 'pouch', 'box', 'sticker']
  return (
    <header
      className="flex items-center justify-between px-6 py-4 bg-white/5"
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Mockup preview
        </div>
        <div className="mt-0.5 text-sm font-medium text-white">
          {brandName} · {productName}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {variants.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onVariant(v)}
            aria-pressed={variant === v}
            className={
              'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ' +
              (variant === v
                ? 'bg-white text-ink-900'
                : 'text-white/70 hover:bg-white/10 hover:text-white')
            }
          >
            {VARIANT_LABELS[v]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDownload}
          disabled={!hasSnapshot}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/30 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close mockup"
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

// ============================================================================
// Mockup variants
// ============================================================================

function Mockup({
  variant,
  snapshot,
  dieCut,
}: {
  variant: MockupVariant
  snapshot: string
  dieCut: DieCutSpec
}) {
  switch (variant) {
    case 'bottle':
      return <BottleMockup snapshot={snapshot} />
    case 'tub':
      return <TubMockup snapshot={snapshot} />
    case 'pouch':
      return <PouchMockup snapshot={snapshot} />
    case 'box':
      return <BoxMockup snapshot={snapshot} />
    case 'sticker':
      return <StickerMockup snapshot={snapshot} />
    case 'flat':
    default:
      return <FlatMockup snapshot={snapshot} dieCut={dieCut} />
  }
}

// ----- Flat: just the trimmed label on a paper-like surface -----

function FlatMockup({
  snapshot,
  dieCut,
}: {
  snapshot: string
  dieCut: DieCutSpec
}) {
  // Preserve label aspect ratio.
  const aspect = dieCut.widthMm / dieCut.heightMm
  const width = 480
  const height = Math.round(width / aspect)
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="bg-white shadow-2xl"
        style={{ width, height }}
      >
        <img
          src={snapshot}
          alt="Label preview"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="text-[10.5px] font-mono text-white/60 tabular-nums">
        {dieCut.widthMm.toFixed(1)} × {dieCut.heightMm.toFixed(1)} mm
      </div>
    </div>
  )
}

// ----- Bottle: cylindrical shading overlay over the label -----

function BottleMockup({ snapshot }: { snapshot: string }) {
  const w = 280
  const h = 480
  return (
    <div className="relative" style={{ width: w + 60, height: h + 60 }}>
      {/* Cap */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-t-md bg-gradient-to-b from-ink-600 to-ink-800 shadow-lg"
        style={{ width: w * 0.55, height: 30, top: 0 }}
      />
      {/* Neck */}
      <div
        className="absolute left-1/2 -translate-x-1/2 bg-gradient-to-b from-white/15 to-white/5"
        style={{ width: w * 0.4, height: 16, top: 30 }}
      />
      {/* Body */}
      <div
        className="absolute left-1/2 -translate-x-1/2 overflow-hidden rounded-md shadow-2xl bg-white"
        style={{ width: w, height: h, top: 46 }}
      >
        <img
          src={snapshot}
          alt="Label on bottle"
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full"
        />
        {/* Cylindrical shading — left + right edges darker for curve illusion. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(255,255,255,0.15) 50%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.35) 100%)',
          }}
        />
      </div>
    </div>
  )
}

// ----- Tub: round container with lid + side band -----

function TubMockup({ snapshot }: { snapshot: string }) {
  const w = 360
  const h = 340
  return (
    <div className="relative" style={{ width: w, height: h }}>
      {/* Lid */}
      <div
        className="absolute left-0 right-0 rounded-t-full bg-gradient-to-b from-ink-700 to-ink-900 shadow-lg"
        style={{ top: 0, height: 56 }}
      />
      {/* Body */}
      <div
        className="absolute left-0 right-0 overflow-hidden bg-white shadow-2xl"
        style={{ top: 44, bottom: 0, borderRadius: '0 0 24px 24px' }}
      >
        <img
          src={snapshot}
          alt="Label on tub"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.2) 100%)',
          }}
        />
      </div>
    </div>
  )
}

// ----- Pouch: stand-up pouch with rounded top + tapered base -----

function PouchMockup({ snapshot }: { snapshot: string }) {
  const w = 320
  const h = 460
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <div
        className="absolute inset-0 overflow-hidden bg-white shadow-2xl"
        style={{
          clipPath:
            'polygon(8% 0%, 92% 0%, 100% 12%, 100% 92%, 88% 100%, 12% 100%, 0% 92%, 0% 12%)',
        }}
      >
        <img
          src={snapshot}
          alt="Label on pouch"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Subtle vertical shading for crease illusion. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 16%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0) 84%, rgba(0,0,0,0.18) 100%)',
          }}
        />
      </div>
    </div>
  )
}

// ----- Box: front panel viewed straight on -----

function BoxMockup({ snapshot }: { snapshot: string }) {
  const w = 320
  const h = 420
  return (
    <div className="flex" style={{ width: w + 32, height: h }}>
      {/* Front panel */}
      <div
        className="relative overflow-hidden bg-white shadow-2xl"
        style={{ width: w, height: h }}
      >
        <img
          src={snapshot}
          alt="Label on box"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.08) 100%)',
          }}
        />
      </div>
      {/* Side panel — narrow strip giving 3D depth cue */}
      <div
        className="bg-gradient-to-b from-ink-300 to-ink-500 shadow-2xl"
        style={{
          width: 32,
          height: h,
          transform: 'skewY(-8deg)',
          transformOrigin: 'top left',
        }}
      />
    </div>
  )
}

// ----- Sticker: peel-back effect on a tabletop surface -----

function StickerMockup({ snapshot }: { snapshot: string }) {
  const w = 380
  const h = 380
  return (
    <div
      className="relative bg-ink-100 rounded-lg p-8 shadow-inner"
      style={{ width: w + 80, height: h + 80 }}
    >
      <div
        className="relative bg-white shadow-2xl"
        style={{
          width: w,
          height: h,
          borderRadius: 12,
          transform: 'rotate(-3deg)',
        }}
      >
        <img
          src={snapshot}
          alt="Sticker"
          className="absolute inset-0 w-full h-full object-cover rounded-[12px]"
        />
        {/* Tiny corner peel */}
        <div
          className="absolute -top-1 -left-1 w-10 h-10 bg-white shadow-md"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 0 100%)',
            transform: 'rotate(-12deg)',
          }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Util
// ============================================================================

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
