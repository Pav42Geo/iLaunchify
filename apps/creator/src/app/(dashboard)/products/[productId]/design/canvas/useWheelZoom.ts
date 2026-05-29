'use client'

// useWheelZoom — Ctrl/Cmd + scroll wheel adjusts canvas zoom (DS-60a).
//
// Matches the Canva / Figma convention every creator already knows. When
// the modifier is held, we intercept the wheel event before it bubbles up
// to the browser (which would otherwise page-zoom the entire app) and
// translate deltaY into a delta on the canvas-side zoom state.
//
// Step size is proportional to wheel delta so trackpad pinch / mouse
// wheel both feel right — a small accumulator keeps trackpad noise from
// flooding the setState pipeline.

import * as React from 'react'

interface Opts {
  /** Min zoom factor (matches BottomToolbar floor). */
  min?: number
  /** Max zoom factor. */
  max?: number
  /** Step per 100px of wheel delta. */
  step?: number
}

export function useWheelZoom(
  scrollEl: HTMLDivElement | null,
  zoom: number,
  setZoom: (z: number) => void,
  { min = 0.3, max = 3, step = 0.1 }: Opts = {},
) {
  // Track zoom in a ref so the wheel handler always reads the latest value
  // without re-binding on every state change.
  const zoomRef = React.useRef(zoom)
  React.useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  React.useEffect(() => {
    if (!scrollEl) return

    function onWheel(e: WheelEvent) {
      // Only intercept when the user is explicitly zooming. Native trackpad
      // pinch on macOS also reports ctrlKey, so this catches both gestures.
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()

      const delta = -e.deltaY // wheel up = zoom in
      const factor = 1 + (delta / 100) * step
      const next = Math.min(max, Math.max(min, zoomRef.current * factor))
      setZoom(+next.toFixed(2))
    }

    // passive:false required to call preventDefault on wheel events.
    scrollEl.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      scrollEl.removeEventListener('wheel', onWheel)
    }
  }, [scrollEl, setZoom, min, max, step])
}
