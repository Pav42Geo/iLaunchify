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

// -----------------------------------------------------------------------------
// Grouping (DS-73c)
// -----------------------------------------------------------------------------
//
// Fabric v6 represents a multi-selection as an `ActiveSelection` — a
// transient container the user can drag/scale as one but whose children
// are still independently editable. `.toGroup()` converts it to a real
// persistent `Group` (saved into JSON, behaves as one object).
//
// `.toActiveSelection()` reverses the process on a Group, dropping it
// back into an ActiveSelection — the children are added back to the
// canvas as standalone objects, and the user can keep editing them
// individually.

/** True if the active object is a multi-object ActiveSelection. */
export function canGroupSelection(canvas: FabricCanvas): boolean {
  const active = canvas.getActiveObject() as unknown as {
    type?: string
    _objects?: unknown[]
  } | null
  if (!active) return false
  return active.type === 'activeSelection' && (active._objects?.length ?? 0) >= 2
}

/** True if the active object is a Group that can be ungrouped. */
export function canUngroupSelection(canvas: FabricCanvas): boolean {
  const active = canvas.getActiveObject() as unknown as { type?: string } | null
  return !!active && active.type === 'group'
}

/**
 * Convert the current ActiveSelection into a persistent Group. The new
 * group becomes the active object. No-ops if the active object isn't a
 * multi-selection.
 */
export function groupActiveSelection(canvas: FabricCanvas): FabricObject | null {
  const active = canvas.getActiveObject() as unknown as {
    type?: string
    toGroup?: () => FabricObject
  } | null
  if (!active || active.type !== 'activeSelection' || !active.toGroup) return null
  const group = active.toGroup()
  canvas.fire('object:modified', { target: group })
  canvas.requestRenderAll()
  return group
}

/**
 * Expand a Group back into an ActiveSelection of its children. The
 * children become individually editable again.
 */
export function ungroupActiveGroup(canvas: FabricCanvas): FabricObject | null {
  const active = canvas.getActiveObject() as unknown as {
    type?: string
    toActiveSelection?: () => FabricObject
  } | null
  if (!active || active.type !== 'group' || !active.toActiveSelection) return null
  const selection = active.toActiveSelection()
  canvas.fire('object:modified', { target: selection })
  canvas.requestRenderAll()
  return selection
}
