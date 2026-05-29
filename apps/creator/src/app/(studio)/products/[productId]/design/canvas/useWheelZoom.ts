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
//
// DS-73b — during an active wheel-zoom burst we LOCK every Fabric object
// (selectable/evented off, lockMovement*/Scaling*/Rotation on) and discard
// the active selection so the creator doesn't see handles "swimming" mid-
// zoom. After 200ms of wheel inactivity the previous per-object flags are
// restored from a snapshot. This makes the canvas feel like a fixed-on-
// surface design that the user is moving a magnifying glass across, not
// a sea of independently zooming objects.

import * as React from 'react'
import type { FabricCanvas, FabricObject } from '@ilaunchify/ui'

interface Opts {
  /** Min zoom factor (matches BottomToolbar floor). */
  min?: number
  /** Max zoom factor. */
  max?: number
  /** Step per 100px of wheel delta. */
  step?: number
  /** ms of wheel-idle before object interaction restores. */
  idleMs?: number
}

interface ObjFlagSnapshot {
  selectable: boolean
  evented: boolean
  lockMovementX: boolean
  lockMovementY: boolean
  lockRotation: boolean
  lockScalingX: boolean
  lockScalingY: boolean
}

export function useWheelZoom(
  scrollEl: HTMLDivElement | null,
  zoom: number,
  setZoom: (z: number) => void,
  canvas: FabricCanvas | null,
  { min = 0.3, max = 3, step = 0.1, idleMs = 200 }: Opts = {},
) {
  // Track zoom in a ref so the wheel handler always reads the latest value
  // without re-binding on every state change.
  const zoomRef = React.useRef(zoom)
  React.useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // Latest canvas in a ref so the listener doesn't have to be re-bound on
  // every Fabric remount.
  const canvasRef = React.useRef<FabricCanvas | null>(canvas)
  React.useEffect(() => {
    canvasRef.current = canvas
  }, [canvas])

  React.useEffect(() => {
    if (!scrollEl) return

    // ---- zoom-lock state (per-effect, lives across wheel burst) -------------
    const lockedSnapshots = new WeakMap<FabricObject, ObjFlagSnapshot>()
    let zoomLockActive = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    function freezeObjects() {
      const c = canvasRef.current
      if (!c) return
      // Discard the active selection so no scaling handles render during zoom.
      const active = c.getActiveObject()
      if (active) {
        c.discardActiveObject()
      }
      for (const obj of c.getObjects() as FabricObject[]) {
        // Skip objects we already snapped.
        if (lockedSnapshots.has(obj)) continue
        lockedSnapshots.set(obj, {
          selectable: obj.selectable ?? true,
          evented: obj.evented ?? true,
          lockMovementX: obj.lockMovementX ?? false,
          lockMovementY: obj.lockMovementY ?? false,
          lockRotation: obj.lockRotation ?? false,
          lockScalingX: obj.lockScalingX ?? false,
          lockScalingY: obj.lockScalingY ?? false,
        })
        obj.selectable = false
        obj.evented = false
        obj.lockMovementX = true
        obj.lockMovementY = true
        obj.lockRotation = true
        obj.lockScalingX = true
        obj.lockScalingY = true
      }
      c.requestRenderAll()
    }

    function thawObjects() {
      const c = canvasRef.current
      if (!c) {
        zoomLockActive = false
        return
      }
      for (const obj of c.getObjects() as FabricObject[]) {
        const snap = lockedSnapshots.get(obj)
        if (!snap) continue
        obj.selectable = snap.selectable
        obj.evented = snap.evented
        obj.lockMovementX = snap.lockMovementX
        obj.lockMovementY = snap.lockMovementY
        obj.lockRotation = snap.lockRotation
        obj.lockScalingX = snap.lockScalingX
        obj.lockScalingY = snap.lockScalingY
        lockedSnapshots.delete(obj)
      }
      c.requestRenderAll()
      zoomLockActive = false
    }

    function onWheel(e: WheelEvent) {
      // Only intercept when the user is explicitly zooming. Native trackpad
      // pinch on macOS also reports ctrlKey, so this catches both gestures.
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()

      // Enter zoom-lock on first wheel tick of a burst.
      if (!zoomLockActive) {
        zoomLockActive = true
        freezeObjects()
      }

      const delta = -e.deltaY // wheel up = zoom in
      const factor = 1 + (delta / 100) * step
      const next = Math.min(max, Math.max(min, zoomRef.current * factor))
      setZoom(+next.toFixed(2))

      // Reset the idle timer — when it fires, thaw the objects.
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        thawObjects()
        idleTimer = null
      }, idleMs)
    }

    // passive:false required to call preventDefault on wheel events.
    scrollEl.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      scrollEl.removeEventListener('wheel', onWheel)
      if (idleTimer) clearTimeout(idleTimer)
      // Best-effort restore on unmount so no canvas is left frozen.
      if (zoomLockActive) thawObjects()
    }
  }, [scrollEl, setZoom, min, max, step, idleMs])
}
