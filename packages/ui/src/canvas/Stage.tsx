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

    // Load initial design state if present
    if (initialDesignJson) {
      canvas.loadFromJSON(initialDesignJson).then(() => {
        canvas.renderAll()
      })
    }

    onReady?.(canvas)

    return () => {
      // Async dispose so React's strict-mode double-mount doesn't blow up
      canvas.dispose().catch(() => {
        // already disposed; safe to ignore
      })
      fabricRef.current = null
    }
    // We deliberately only re-init when the die-cut identity changes — pxPerMm /
    // surfaceColor changes are applied via the canvas API in their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dieCut.id])

  // React to pxPerMm / surfaceColor changes without re-creating the canvas
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    canvas.setDimensions({ width: pixelWidth, height: pixelHeight })
    canvas.backgroundColor = surfaceColor
    canvas.renderAll()
  }, [pixelWidth, pixelHeight, surfaceColor])

  return (
    <div className={className} style={{ width: pixelWidth, height: pixelHeight, position: 'relative' }}>
      <canvas ref={canvasElRef} />
    </div>
  )
}
