'use client'

import * as React from 'react'
import type { FabricCanvas, FabricObject } from '@ilaunchify/ui'

/**
 * useCanvasObjects — reactive list of objects on a Fabric.Canvas.
 *
 * Subscribes to object:added/removed/modified and selection:* events,
 * re-querying canvas.getObjects() each time so the layers drawer always
 * mirrors what's actually on the canvas. Also tracks the currently-active
 * object so the drawer can highlight the selected row.
 *
 * Returns the objects in REVERSE stacking order (top of canvas = top of
 * list) which is the convention designers expect from Photoshop-style
 * layer panels.
 */
export interface CanvasObjectRow {
  index: number
  object: FabricObject
  type: string
  preview: string
  visible: boolean
  isActive: boolean
}

export function useCanvasObjects(canvas: FabricCanvas | null) {
  const [, force] = React.useReducer((n: number) => n + 1, 0)

  React.useEffect(() => {
    if (!canvas) return
    const handler = () => force()
    canvas.on('object:added', handler)
    canvas.on('object:removed', handler)
    canvas.on('object:modified', handler)
    canvas.on('selection:created', handler)
    canvas.on('selection:updated', handler)
    canvas.on('selection:cleared', handler)
    return () => {
      canvas.off('object:added', handler)
      canvas.off('object:removed', handler)
      canvas.off('object:modified', handler)
      canvas.off('selection:created', handler)
      canvas.off('selection:updated', handler)
      canvas.off('selection:cleared', handler)
    }
  }, [canvas])

  // Recomputed on every render — the event handlers above already force a
  // re-render whenever fabric mutates state, so a memo would just add noise.
  const rows: CanvasObjectRow[] = (() => {
    if (!canvas) return []
    const active = canvas.getActiveObject()
    // Reverse so the top-most (last drawn) sits at the top of the layer list.
    return canvas
      .getObjects()
      .map((object, index) => ({
        index,
        object: object as FabricObject,
        type: (object as { type?: string }).type ?? 'object',
        preview: describeObject(object),
        visible: object.visible !== false,
        isActive: active === object,
      }))
      .reverse()
  })()

  function setVisible(target: FabricObject, visible: boolean) {
    if (!canvas) return
    target.visible = visible
    canvas.requestRenderAll()
    force()
  }

  function remove(target: FabricObject) {
    if (!canvas) return
    canvas.remove(target)
    canvas.discardActiveObject()
    canvas.requestRenderAll()
  }

  function select(target: FabricObject) {
    if (!canvas) return
    canvas.setActiveObject(target)
    canvas.requestRenderAll()
    force()
  }

  function moveUp(target: FabricObject) {
    if (!canvas) return
    canvas.bringObjectForward(target)
    canvas.requestRenderAll()
    force()
  }

  function moveDown(target: FabricObject) {
    if (!canvas) return
    canvas.sendObjectBackwards(target)
    canvas.requestRenderAll()
    force()
  }

  return { rows, setVisible, remove, select, moveUp, moveDown }
}

function describeObject(o: unknown): string {
  const obj = o as { type?: string; text?: string; src?: string }
  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
    const text = (obj.text ?? '').trim()
    if (!text) return 'Text layer'
    return text.length > 28 ? text.slice(0, 28) + '…' : text
  }
  if (obj.type === 'image') {
    const src = obj.src ?? ''
    const file = src.split('/').pop() ?? 'image'
    return `Image · ${file}`
  }
  if (obj.type === 'rect') return 'Rectangle'
  if (obj.type === 'circle') return 'Circle'
  if (obj.type === 'group') return 'Group'
  if (obj.type === 'path') return 'Shape'
  return obj.type ?? 'Object'
}
