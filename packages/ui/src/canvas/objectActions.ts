'use client'

// Shared canvas-object actions (DS-60b).
//
// One module that owns every "do something to this object" operation, so
// the right-click context menu, the per-object action chrome, the
// keyboard shortcuts, and the bottom toolbar all call the same functions.
// Keeps semantics consistent across UI surfaces.
//
// Note: clone-based ops (duplicate / clipboard paste) are async because
// fabric v6's object.clone() returns a Promise. The caller waits with
// `await`.

import type { FabricCanvas, FabricObject } from './types'

/**
 * Duplicate the active object with a small +offset so it visually appears
 * next to its source. Selects the clone after the add so the user can
 * immediately drag / edit it.
 */
export async function duplicateObject(
  canvas: FabricCanvas,
  obj: FabricObject,
  offset = 20,
): Promise<FabricObject | null> {
  try {
    const clone = await obj.clone()
    clone.set({
      left: (obj.left ?? 0) + offset,
      top: (obj.top ?? 0) + offset,
    })
    canvas.add(clone)
    canvas.setActiveObject(clone)
    canvas.requestRenderAll()
    return clone
  } catch (err) {
    console.warn('[canvas/objectActions] duplicate failed:', err)
    return null
  }
}

/**
 * Remove an object from the canvas. Discards selection so toolbars
 * close cleanly.
 */
export function removeObject(canvas: FabricCanvas, obj: FabricObject): void {
  canvas.remove(obj)
  canvas.discardActiveObject()
  canvas.requestRenderAll()
}

/**
 * Layer-order operations. Fabric's z-order is per-object array position;
 * higher index = drawn on top. We use the helper methods Fabric provides
 * (bringForward / sendBackwards / bringToFront / sendToBack).
 */
export function bringForward(canvas: FabricCanvas, obj: FabricObject): void {
  canvas.bringObjectForward(obj)
  canvas.fire('object:modified', { target: obj })
  canvas.requestRenderAll()
}

export function sendBackwards(canvas: FabricCanvas, obj: FabricObject): void {
  canvas.sendObjectBackwards(obj)
  canvas.fire('object:modified', { target: obj })
  canvas.requestRenderAll()
}

export function bringToFront(canvas: FabricCanvas, obj: FabricObject): void {
  canvas.bringObjectToFront(obj)
  canvas.fire('object:modified', { target: obj })
  canvas.requestRenderAll()
}

export function sendToBack(canvas: FabricCanvas, obj: FabricObject): void {
  canvas.sendObjectToBack(obj)
  canvas.fire('object:modified', { target: obj })
  canvas.requestRenderAll()
}

/**
 * Toggle the object's locked state. A locked object can't be moved,
 * scaled, rotated, or selected via box-select. The lock flips four
 * Fabric flags atomically so partial locks aren't possible.
 */
export function toggleLock(canvas: FabricCanvas, obj: FabricObject): boolean {
  const locked = isLocked(obj)
  const next = !locked
  obj.set({
    lockMovementX: next,
    lockMovementY: next,
    lockScalingX: next,
    lockScalingY: next,
    lockRotation: next,
    hasControls: !next,
    editable: !next, // disables IText keyboard editing too
  } as unknown as Partial<FabricObject>)
  // selectable: when locked, still allow click-to-select so the user can
  // unlock via the action chrome. Box-drag selection skipped via lockMovement.
  canvas.fire('object:modified', { target: obj })
  canvas.requestRenderAll()
  return next
}

/** True if an object is in the locked state. */
export function isLocked(obj: FabricObject): boolean {
  const o = obj as unknown as { lockMovementX?: boolean }
  return !!o.lockMovementX
}
