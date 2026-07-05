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
  previewIntentForCategory,
  type DieCutSpec,
  type DielineShapeKind,
  type FabricCanvas,
  type PbrSurfaceParams,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  dieCut: DieCutSpec
  pxPerMm: number
  /** G1.3 — PBR surface response for the product's substrate/finish (resolve from
   *  `@ilaunchify/packaging-3d` at the shell). Optional: unset renders matte with
   *  studio env + contact shadow (the viewer's realistic defaults). */
  material?: PbrSurfaceParams
  /** G1.4 — signed URL to the packaging type's imported glTF; when set the preview
   *  renders the REAL model with the design on it (parametric fallback otherwise). */
  model3dUrl?: string | null
}

const THROTTLE_MS = 450

export function LivePreview3DDock({ canvas, dieCut, pxPerMm, material, model3dUrl }: Props) {
  const [open, setOpen] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const [snapshot, setSnapshot] = React.useState<string | null>(null)

  // Phase 2b — click a spot on the 3D model → select the matching design element on the 2D
  // canvas. Maps the hit UV (0..1 across the die-cut) to canvas pixels and hit-tests objects
  // top-down, skipping non-selectable ones (die-line, guides, locked truth panels).
  function selectAtUv(uv: { u: number; v: number }) {
    if (!canvas) return
    const c = canvas as unknown as {
      getObjects?: () => Array<{ selectable?: boolean; evented?: boolean; getBoundingRect?: (a?: boolean, b?: boolean) => { left: number; top: number; width: number; height: number } }>
      setActiveObject?: (o: unknown) => void
      requestRenderAll?: () => void
    }
    const px = uv.u * dieCut.widthMm * pxPerMm
    const py = uv.v * dieCut.heightMm * pxPerMm
    const objs = c.getObjects?.() ?? []
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (!o || o.selectable === false || o.evented === false || !o.getBoundingRect) continue
      const r = o.getBoundingRect(true, true)
      if (px >= r.left && px <= r.left + r.width && py >= r.top && py <= r.top + r.height) {
        c.setActiveObject?.(o)
        c.requestRenderAll?.()
        return
      }
    }
  }
  // The 3D shape is derived from THIS packaging piece's die-cut category (the dock
  // previews the current component). Switching between a product's packaging pieces
  // (e.g. wrap + cans) is a separate packaging switcher — see plan.
  const shape = React.useMemo(() => shapeKindForCategory(dieCut.category), [dieCut.category])
  // Smart preview: the die-cut's role decides which surface carries the design and how
  // the model is framed (a lid sticker → design on the lid, opened looking down).
  const intent = React.useMemo(() => previewIntentForCategory(dieCut.category), [dieCut.category])
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
          <button type="button" onClick={downloadShot} aria-label="Download 3D image" title="Download 3D image" className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700">
            <Download className="h-3.5 w-3.5" />
          </button>
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
            material={material}
            modelUrl={model3dUrl}
            designSurface={intent.designSurface}
            initialView={intent.initialView}
            className="flex h-full w-full flex-col p-2"
            captureRef={captureRef}
            onSurfaceClick={selectAtUv}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-ink-400">Preparing preview…</div>
        )}
      </div>
    </div>
  )
}
