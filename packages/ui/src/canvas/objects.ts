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
 * Drop an image at the canvas viewport center.
 *
 * Auto-scales the image so its longest edge is at most 60% of the canvas's
 * shortest edge — keeps newly-added logos from blanketing the whole label
 * by default. Honors viewport zoom so it lands where the user is looking.
 *
 * Uses crossOrigin: 'anonymous' so the image can be exported on toDataURL
 * later (CORS must be permitted by the asset host).
 */
export async function addImageFromUrl(
  canvas: FabricCanvas,
  url: string,
  opts: { maxFraction?: number; centerX?: number; centerY?: number } = {},
): Promise<FabricObject | null> {
  const maxFraction = opts.maxFraction ?? 0.6
  try {
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
    const center = {
      x: opts.centerX ?? getCanvasCenter(canvas).x,
      y: opts.centerY ?? getCanvasCenter(canvas).y,
    }
    const cw = canvas.getWidth()
    const ch = canvas.getHeight()
    const maxEdge = Math.min(cw, ch) * maxFraction
    const iw = img.width ?? 1
    const ih = img.height ?? 1
    const longest = Math.max(iw, ih)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    img.set({
      left: center.x,
      top: center.y,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
    })
    canvas.add(img)
    canvas.setActiveObject(img)
    canvas.requestRenderAll()
    return img
  } catch (err) {
    console.warn('[canvas/objects] addImageFromUrl failed:', err)
    return null
  }
}

/** Set the canvas background color and re-render. */
export function setCanvasBackground(canvas: FabricCanvas, color: string): void {
  canvas.backgroundColor = color
  canvas.requestRenderAll()
}

/** Wrap every object on the canvas in an ActiveSelection so they move/scale together. */
export function selectAllObjects(canvas: FabricCanvas): void {
  const objects = canvas.getObjects()
  if (objects.length === 0) return
  const sel = new fabric.ActiveSelection(objects, { canvas })
  canvas.setActiveObject(sel)
  canvas.requestRenderAll()
}

/** Get the underlying objects of an ActiveSelection (or [obj] for a single selection). */
export function objectsFromSelection(obj: FabricObject): FabricObject[] {
  const sel = obj as unknown as { _objects?: FabricObject[] }
  return sel._objects ?? [obj]
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
