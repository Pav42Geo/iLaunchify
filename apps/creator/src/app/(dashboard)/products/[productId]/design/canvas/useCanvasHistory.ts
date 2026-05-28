'use client'

import * as React from 'react'
import {
  CANVAS_PROPERTIES_TO_INCLUDE,
  type FabricCanvas,
} from '@ilaunchify/ui'

// Fabric v6 toJSON accepts an array of extra props at runtime; the types
// ship as () so we cast through a helper.
function toJsonWithProps(canvas: FabricCanvas): object {
  const fn = canvas.toJSON as (propertiesToInclude?: string[]) => object
  return fn.call(canvas, Array.from(CANVAS_PROPERTIES_TO_INCLUDE))
}

/**
 * useCanvasHistory — simple undo / redo stack for a Fabric.Canvas.
 *
 * Listens for object:added / object:modified / object:removed and snapshots
 * the canvas's full JSON state after each change. Undo pops a state off the
 * past stack and rehydrates it; redo replays.
 *
 * V1 keeps it dead simple — no debouncing, no diff compression, no per-prop
 * tracking. Works for typical packaging-design object counts (≤200 objects).
 * Can swap for fabric.Canvas history extension later if perf becomes a
 * concern.
 */
export function useCanvasHistory(canvas: FabricCanvas | null, opts?: { max?: number }) {
  const max = opts?.max ?? 50
  const pastRef = React.useRef<unknown[]>([])
  const futureRef = React.useRef<unknown[]>([])
  const suppressRef = React.useRef(false)
  const [, force] = React.useReducer((n: number) => n + 1, 0)

  React.useEffect(() => {
    if (!canvas) return

    // Snapshot the initial empty state so the first undo doesn't break.
    pastRef.current = [toJsonWithProps(canvas)]
    futureRef.current = []
    force()

    const snapshot = () => {
      if (suppressRef.current) return
      const json = toJsonWithProps(canvas)
      pastRef.current = [...pastRef.current.slice(-max + 1), json]
      futureRef.current = []
      force()
    }

    canvas.on('object:added', snapshot)
    canvas.on('object:modified', snapshot)
    canvas.on('object:removed', snapshot)

    return () => {
      canvas.off('object:added', snapshot)
      canvas.off('object:modified', snapshot)
      canvas.off('object:removed', snapshot)
    }
  }, [canvas, max])

  async function load(json: unknown) {
    if (!canvas) return
    suppressRef.current = true
    try {
      await canvas.loadFromJSON(json as object)
      canvas.renderAll()
    } finally {
      // Allow events again next tick; loadFromJSON fires object:added.
      setTimeout(() => {
        suppressRef.current = false
      }, 0)
    }
  }

  const canUndo = pastRef.current.length > 1
  const canRedo = futureRef.current.length > 0

  async function undo() {
    if (!canUndo) return
    const past = pastRef.current
    const current = past[past.length - 1]
    const target = past[past.length - 2]
    pastRef.current = past.slice(0, -1)
    futureRef.current = [...futureRef.current, current]
    await load(target)
    force()
  }

  async function redo() {
    if (!canRedo) return
    const future = futureRef.current
    const target = future[future.length - 1]
    futureRef.current = future.slice(0, -1)
    pastRef.current = [...pastRef.current, target]
    await load(target)
    force()
  }

  return { undo, redo, canUndo, canRedo }
}
