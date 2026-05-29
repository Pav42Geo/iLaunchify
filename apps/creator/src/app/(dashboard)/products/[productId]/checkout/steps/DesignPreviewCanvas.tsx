'use client'

// Read-only design preview (G2). Mounts a tiny Fabric.js canvas, loads
// the saved DesignVersion JSON into it, locks every object, and disables
// selection so the creator can't accidentally edit through the preview.
//
// We deliberately don't reuse Stage from packages/ui because:
//   - Stage sets selection:true by default for the design tool.
//   - The wizard wants a fixed-size scaled-down view, not a 1:1 canvas.
// A tiny dedicated component is simpler than wiring three more props.

import { useEffect, useRef } from 'react'
import * as fabric from 'fabric'

interface Props {
  fabricJson: object
  dieCut: {
    widthMm: number
    heightMm: number
    bleedMm: number
  }
}

// Preview is rendered at a fixed CSS width; canvas pixel dimensions
// match the die-cut. Scaling happens via CSS transform so the canvas
// element keeps the right aspect ratio without us calculating scale
// per-frame.
const PREVIEW_PX_PER_MM = 3.0
const MAX_PREVIEW_WIDTH_PX = 480
const MAX_PREVIEW_HEIGHT_PX = 360

export function DesignPreviewCanvas({ fabricJson, dieCut }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)

  const fullWidthMm = dieCut.widthMm + 2 * dieCut.bleedMm
  const fullHeightMm = dieCut.heightMm + 2 * dieCut.bleedMm
  const pixelWidth = Math.round(fullWidthMm * PREVIEW_PX_PER_MM)
  const pixelHeight = Math.round(fullHeightMm * PREVIEW_PX_PER_MM)

  // CSS scale to fit the preview box.
  const scale = Math.min(
    MAX_PREVIEW_WIDTH_PX / pixelWidth,
    MAX_PREVIEW_HEIGHT_PX / pixelHeight,
    1,
  )
  const cssWidth = Math.round(pixelWidth * scale)
  const cssHeight = Math.round(pixelHeight * scale)

  useEffect(() => {
    if (!canvasElRef.current) return
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: pixelWidth,
      height: pixelHeight,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: false,
      interactive: false,
      hoverCursor: 'default',
    })
    fabricRef.current = canvas

    let cancelled = false
    canvas
      .loadFromJSON(fabricJson)
      .then(() => {
        if (cancelled) return
        // Lock every object so accidental clicks can't move anything.
        canvas.forEachObject((o: fabric.FabricObject) => {
          o.selectable = false
          o.evented = false
        })
        canvas.renderAll()
      })
      .catch(() => {
        // Same defensive intent as Stage — strict-mode dispose can race.
      })

    return () => {
      cancelled = true
      fabricRef.current = null
      try {
        const result = canvas.dispose() as unknown
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          ;(result as Promise<unknown>).catch(() => {})
        }
      } catch {
        // already disposed
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="mx-auto overflow-hidden rounded-md border border-ink-200 bg-ink-50"
      style={{ width: cssWidth, height: cssHeight }}
    >
      <div
        style={{
          width: pixelWidth,
          height: pixelHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <canvas ref={canvasElRef} />
      </div>
    </div>
  )
}
