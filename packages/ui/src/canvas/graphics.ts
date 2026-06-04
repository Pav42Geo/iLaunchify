'use client'

// Track D / D4 — vector graphics (Iconify icons) on the Fabric canvas.
//
// Loads an SVG by URL (the Iconify CDN, https://api.iconify.design/<prefix>/
// <name>.svg) as a vector group so it stays crisp at any scale + recolors via
// the Iconify ?color= param at fetch time. Mirrors certBadges' loadSVGFromURL
// path (fabric v6).

import * as fabric from 'fabric'
import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType } from './objects'

/** Add an SVG icon (by URL) to the canvas as a centered vector group. */
export async function addIconFromUrl(
  canvas: FabricCanvas,
  url: string,
  opts: { sizePx?: number } = {},
): Promise<FabricObject | null> {
  const sizePx = opts.sizePx ?? 96
  let obj: FabricObject | null = null
  try {
    const parsed = await fabric.loadSVGFromURL(url)
    const objects = (parsed.objects ?? []).filter((o): o is FabricObject => o != null)
    if (objects.length === 0) return null
    const group = fabric.util.groupSVGElements(objects, parsed.options)
    const longest = Math.max(group.width || sizePx, group.height || sizePx)
    if (longest > 0) group.scale(sizePx / longest)
    obj = group as unknown as FabricObject
  } catch {
    return null
  }

  obj.set('customType', 'graphic' satisfies CanvasCustomType)

  // Center in the current viewport.
  const w = canvas.getWidth()
  const h = canvas.getHeight()
  const vpt = canvas.viewportTransform
  let cx = w / 2
  let cy = h / 2
  if (vpt) {
    cx = (w / 2 - vpt[4]) / vpt[0]
    cy = (h / 2 - vpt[5]) / vpt[3]
  }
  obj.set({ left: cx, top: cy, originX: 'center', originY: 'center' })

  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  return obj
}
