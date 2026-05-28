'use client'

// Canvas object factory — thin wrappers around fabric.* constructors so
// consuming apps (apps/creator) can spawn Text / Image / Rect objects on a
// hoisted FabricCanvas without taking a direct `fabric` dependency.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 (canvas tool inventory).

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'

/** Add an editable text object at the canvas viewport center + select it. */
export function addText(
  canvas: FabricCanvas,
  text: string,
  opts: {
    fontFamily?: string
    fontSize?: number
    fill?: string
    fontWeight?: number | string
    width?: number
  } = {},
): FabricObject {
  const center = getCanvasCenter(canvas)
  const obj = new fabric.IText(text, {
    left: center.x,
    top: center.y,
    originX: 'center',
    originY: 'center',
    fontFamily: opts.fontFamily ?? 'Inter, sans-serif',
    fontSize: opts.fontSize ?? 28,
    fill: opts.fill ?? '#0F1116',
    fontWeight: opts.fontWeight ?? 400,
    editable: true,
  })
  if (opts.width) {
    obj.set('width', opts.width)
  }
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  return obj
}

/** Add two stacked text objects — heading + subheading — as a quick combo. */
export function addTextCombo(
  canvas: FabricCanvas,
  heading: string,
  subheading: string,
  opts: {
    headingFont?: string
    bodyFont?: string
    fill?: string
  } = {},
): FabricObject[] {
  const center = getCanvasCenter(canvas)
  const headingObj = new fabric.IText(heading, {
    left: center.x,
    top: center.y - 22,
    originX: 'center',
    originY: 'center',
    fontFamily: opts.headingFont ?? 'Bricolage Grotesque, sans-serif',
    fontSize: 36,
    fontWeight: 700,
    fill: opts.fill ?? '#0F1116',
  })
  const subObj = new fabric.IText(subheading, {
    left: center.x,
    top: center.y + 18,
    originX: 'center',
    originY: 'center',
    fontFamily: opts.bodyFont ?? 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 400,
    fill: opts.fill ?? '#0F1116',
  })
  canvas.add(headingObj, subObj)
  // Group selection so they move together when user drags.
  const sel = new fabric.ActiveSelection([headingObj, subObj], { canvas })
  canvas.setActiveObject(sel)
  canvas.requestRenderAll()
  return [headingObj, subObj]
}

/**
 * Compute the center of the canvas in its current coordinate space.
 * Respects the active viewport zoom + pan transform so newly-added objects
 * always land in the visible area.
 */
function getCanvasCenter(canvas: FabricCanvas): { x: number; y: number } {
  const vpt = canvas.viewportTransform
  const w = canvas.getWidth()
  const h = canvas.getHeight()
  if (!vpt) {
    return { x: w / 2, y: h / 2 }
  }
  // Invert the viewport transform to get the world-space center of the visible area.
  const cx = (w / 2 - vpt[4]) / vpt[0]
  const cy = (h / 2 - vpt[5]) / vpt[3]
  return { x: cx, y: cy }
}
