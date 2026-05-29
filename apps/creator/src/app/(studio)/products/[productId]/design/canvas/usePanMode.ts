'use client'

import * as React from 'react'
import type { FabricCanvas } from '@ilaunchify/ui'

/**
 * usePanMode — toggleable hand-tool that translates the canvas viewport on
 * drag. Disables object selection while active so dragging anywhere just
 * pans. Restores selection when toggled off.
 *
 * Returns { panMode, togglePan }; the layout shell wires the toggle to the
 * Hand button in the bottom toolbar and reflects the active state.
 */
export function usePanMode(canvas: FabricCanvas | null) {
  const [panMode, setPanMode] = React.useState(false)
  const isDraggingRef = React.useRef(false)
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null)

  React.useEffect(() => {
    if (!canvas) return

    // Save prior values so we can restore them when leaving pan mode.
    const priorSelection = canvas.selection
    const priorHoverCursor = canvas.hoverCursor
    const priorDefaultCursor = canvas.defaultCursor

    if (!panMode) {
      canvas.selection = priorSelection
      canvas.hoverCursor = priorHoverCursor
      canvas.defaultCursor = priorDefaultCursor
      return
    }

    // Enter pan mode.
    canvas.selection = false
    canvas.discardActiveObject()
    canvas.hoverCursor = 'grab'
    canvas.defaultCursor = 'grab'
    canvas.requestRenderAll()

    function onMouseDown(opt: { e: MouseEvent | TouchEvent }) {
      if (!canvas) return
      isDraggingRef.current = true
      const evt = opt.e as MouseEvent
      lastPointRef.current = { x: evt.clientX, y: evt.clientY }
      canvas.defaultCursor = 'grabbing'
      canvas.hoverCursor = 'grabbing'
    }

    function onMouseMove(opt: { e: MouseEvent | TouchEvent }) {
      if (!canvas || !isDraggingRef.current || !lastPointRef.current) return
      const evt = opt.e as MouseEvent
      const vpt = canvas.viewportTransform
      if (!vpt) return
      vpt[4] += evt.clientX - lastPointRef.current.x
      vpt[5] += evt.clientY - lastPointRef.current.y
      canvas.setViewportTransform(vpt)
      lastPointRef.current = { x: evt.clientX, y: evt.clientY }
    }

    function onMouseUp() {
      isDraggingRef.current = false
      lastPointRef.current = null
      if (canvas) {
        canvas.defaultCursor = 'grab'
        canvas.hoverCursor = 'grab'
      }
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)

    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
      canvas.selection = priorSelection
      canvas.hoverCursor = priorHoverCursor
      canvas.defaultCursor = priorDefaultCursor
    }
  }, [canvas, panMode])

  const togglePan = React.useCallback(() => setPanMode((v) => !v), [])

  return { panMode, togglePan }
}
