'use client'

// =============================================================================
// LivePreview3DDock — a floating, collapsible LIVE 3D preview for the Design
// Studio (Studio 3D+2D architecture, Phase 2). Docks bottom-right; when open it
// wraps the CURRENT design onto a rotatable 3D model and re-snapshots the Fabric
// canvas as you edit (throttled), so the 3D updates live — the Pacdora moment.
//
// It is a VISUALIZATION ONLY — the exact print die-line stays the separate master
// (see docs/STUDIO_ARCHITECTURE_3D_2D.md). Self-contained (own open state + canvas
// subscription) so mounting it costs the shell a single line.
// =============================================================================

import * as React from 'react'
import { Box as BoxIcon, X, Maximize2, Minimize2, Download } from 'lucide-react'
import {
  snapshotCanvasTrimmed,
  Dieline3DViewer,
  shapeKindForCategory,
  type DieCutSpec,
  type DielineShapeKind,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  dieCut: DieCutSpec
  pxPerMm: number
}

const THROTTLE_MS = 450

export function LivePreview3DDock({ canvas, dieCut, pxPerMm }: Props) {
  const [open, setOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const [snapshot, setSnapshot] = React.useState<string | null>(null)
  // null = auto (derive from the product's die-cut category); otherwise a manual override so
  // the creator can preview the same label on a different container shape.
  const [shapeOverride, setShapeOverride] = React.useState<DielineShapeKind | null>(null)
  const autoShape = React.useMemo(() => shapeKindForCategory(dieCut.category), [dieCut.category])
  const shape = shapeOverride ?? autoShape
  const captureRef = React.useRef<(() => string | null) | null>(null)

  function downloadShot() {
    const url = captureRef.current?.() ?? null
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = '3d-preview.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Re-snapshot the live canvas (throttled) while open. Subscribes to Fabric edit
  // events so the 3D reflects edits without a manual refresh.
  React.useEffect(() => {
    if (!open || !canvas) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const take = () => {
      if (disposed) return
      try {
        setSnapshot(snapshotCanvasTrimmed({ canvas, dieCut, pxPerMm, multiplier: 2 }))
      } catch {
        /* cross-origin image can block export — keep the last good snapshot */
      }
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(take, THROTTLE_MS)
    }

    take() // initial

    // Fabric's canvas is an EventEmitter-like; cast to reach on/off generically.
    const c = canvas as unknown as { on: (e: string, h: () => void) => void; off: (e: string, h: () => void) => void }
    const events = ['object:modified', 'object:added', 'object:removed', 'text:changed']
    events.forEach((e) => c.on(e, schedule))
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      events.forEach((e) => c.off(e, schedule))
    }
  }, [open, canvas, dieCut, pxPerMm])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Live 3D preview"
        className="absolute top-4 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-2 text-[12px] font-semibold text-ink-700 shadow-lg transition-colors hover:border-pink-400 hover:text-pink-700"
      >
        <BoxIcon className="h-4 w-4" /> 3D preview
      </button>
    )
  }

  return (
    <div className={`absolute top-4 right-4 z-30 flex max-w-[86vw] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl ${expanded ? 'w-[560px]' : 'w-[320px]'}`}>
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-800">
          <BoxIcon className="h-3.5 w-3.5 text-pink-600" /> Live 3D preview
        </span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Shrink' : 'Expand'} title={expanded ? 'Shrink' : 'Expand'} className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700">
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close 3D preview" className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={`bg-[radial-gradient(120%_120%_at_50%_0%,#fff,#f1f0ec)] ${expanded ? 'h-[480px]' : 'h-[300px]'}`}>
        {snapshot ? (
          <Dieline3DViewer
            shape={shape}
            widthMm={dieCut.widthMm}
            heightMm={dieCut.heightMm}
            textureImageUrl={snapshot}
            baseColor="#f4f2ee"
            className="flex h-full w-full flex-col p-2"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-ink-400">Preparing preview…</div>
        )}
      </div>
      {/* Shape switcher — preview the same label on a different container. */}
      <div className="flex items-center gap-1 border-t border-ink-100 px-2.5 py-1.5">
        <span className="mr-0.5 text-[9.5px] font-bold uppercase tracking-wider text-ink-400">Shape</span>
        <ShapeBtn label="Auto" active={shapeOverride === null} onClick={() => setShapeOverride(null)} />
        <ShapeBtn label="Round" active={shapeOverride === 'CYLINDER'} onClick={() => setShapeOverride('CYLINDER')} />
        <ShapeBtn label="Box" active={shapeOverride === 'BOX'} onClick={() => setShapeOverride('BOX')} />
        <ShapeBtn label="Flat" active={shapeOverride === 'FLAT'} onClick={() => setShapeOverride('FLAT')} />
      </div>
      <p className="px-3 pb-1.5 text-[10px] leading-snug text-ink-400">Updates as you design · preview only, not the print file.</p>
    </div>
  )
}

function ShapeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition ${active ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
    >
      {label}
    </button>
  )
}
