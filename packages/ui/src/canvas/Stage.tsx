'use client'

// Stage — the Fabric.js canvas mount point.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 (canvas foundation).
//
// Wraps a <canvas> element and instantiates a Fabric.Canvas on mount.
// Calls onReady(canvas) once the instance is live so the parent shell can
// wire up tool drawers, register event handlers, etc.
//
// Fabric.js cannot SSR — this is a 'use client' component. The host page
// dynamically loads it via next/dynamic with ssr:false (see canvas page.tsx).

import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'
import type { DieCutSpec } from './types'

interface StageProps {
  dieCut: DieCutSpec
  /** Pixels per millimeter. Lets parent control zoom. Default 3.0 = roughly 76 DPI. */
  pxPerMm?: number
  /** Background color INSIDE the bleed area (i.e. the printable surface color). */
  surfaceColor?: string
  /** Called once when the Fabric.Canvas is ready. Parent uses it to add
   *  tools, register handlers, snapshot for history, etc. The canvas
   *  outlives this prop — it lives until Stage unmounts, at which point
   *  it's disposed. Consumers should null out their ref on unmount. */
  onReady?: (canvas: fabric.Canvas) => void
  /** Optional initial design state (Fabric JSON). Loaded after canvas instantiation. */
  initialDesignJson?: object | null
  /** Optional className on the wrapper. */
  className?: string
}

export function Stage({
  dieCut,
  pxPerMm = 3.0,
  surfaceColor = '#ffffff',
  onReady,
  initialDesignJson,
  className,
}: StageProps) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)

  // Canvas pixel dimensions = (trim + 2× bleed) × pxPerMm.
  // The visible printable area extends from (bleed, bleed) to (bleed+trim, bleed+trim).
  const fullWidthMm = dieCut.widthMm + 2 * dieCut.bleedMm
  const fullHeightMm = dieCut.heightMm + 2 * dieCut.bleedMm
  const pixelWidth = Math.round(fullWidthMm * pxPerMm)
  const pixelHeight = Math.round(fullHeightMm * pxPerMm)

  useEffect(() => {
    if (!canvasElRef.current) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: pixelWidth,
      height: pixelHeight,
      backgroundColor: surfaceColor,
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
    })

    fabricRef.current = canvas

    // Strict mode mounts/unmounts/remounts the effect. The async
    // loadFromJSON().then(renderAll) from the FIRST mount can resolve
    // AFTER the strict-mode dispose, at which point renderAll() runs
    // against a disposed canvas and crashes inside fabric's clearRect
    // call. This flag short-circuits the async callback when the
    // cleanup has already fired.
    let cancelled = false

    if (initialDesignJson) {
      canvas
        .loadFromJSON(initialDesignJson)
        .then(() => {
          if (cancelled) return
          canvas.renderAll()
        })
        .catch(() => {
          // Swallow — usually fires when dispose raced ahead of the
          // load promise. Same defensive intent as the cancelled flag.
        })
    }

    onReady?.(canvas)

    return () => {
      cancelled = true
      // Null the ref FIRST so any concurrent effect that reads
      // fabricRef.current sees the disposed state.
      fabricRef.current = null
      // Async dispose so React's strict-mode double-mount doesn't blow up.
      try {
        const result = canvas.dispose() as unknown
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          ;(result as Promise<unknown>).catch(() => {})
        }
      } catch {
        // already disposed; safe to ignore
      }
    }
    // We deliberately only re-init when the die-cut identity changes — pxPerMm /
    // surfaceColor changes are applied via the canvas API in their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dieCut.id])

  // React to pxPerMm / surfaceColor changes without re-creating the canvas.
  // Wrapped in try/catch because canvas.setDimensions + renderAll go
  // through the same clearRect path that crashes on a disposed canvas —
  // we don't want a stale effect run (e.g. one queued before strict-mode
  // dispose) to take down the page.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    // fabric v6 sets a `disposed` flag during cleanup; bail before we
    // touch the canvas context.
    if ((canvas as unknown as { disposed?: boolean }).disposed) return
    try {
      canvas.setDimensions({ width: pixelWidth, height: pixelHeight })
      canvas.backgroundColor = surfaceColor
      canvas.renderAll()
    } catch (err) {
      console.warn('[Stage] resize/render skipped — canvas not ready:', err)
    }
  }, [pixelWidth, pixelHeight, surfaceColor])

  return (
    <div className={className} style={{ width: pixelWidth, height: pixelHeight, position: 'relative' }}>
      <canvas ref={canvasElRef} />
    </div>
  )
}
