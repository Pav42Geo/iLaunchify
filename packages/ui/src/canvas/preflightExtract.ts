'use client'

// Canvas → PreflightDesignSummary extractor (C9).
//
// Walks the live Fabric canvas and normalizes it into the pure
// `PreflightDesignSummary` shape that runPreflight (preflight.ts) consumes.
// Keeps the pre-flight engine itself canvas-free + unit-testable: this is the
// only place that touches Fabric, mirroring how compliance.ts isolates its
// canvas walk from the rule logic.
//
// All output measurements are millimeters (px / pxPerMm). Bounding rects use
// getBoundingRect() — in Fabric v6 this returns the absolute on-canvas box
// (including scale + rotation) in canvas pixels relative to the canvas
// top-left, which is the bleed-edge origin in the Studio stage.
//
// V1 limitations (intentional TODOs — the engine handles empty arrays):
//   • spotColors      — the canvas doesn't yet carry declared PMS spot colors.
//   • declaredColorSpace — the canvas is RGB; no per-document color-space stamp.
// Both stay empty/null until the design model carries that metadata.

import type { FabricCanvas, FabricObject } from './types'
import type { PreflightDesignSummary, PreflightBox } from './preflight'

/** Fabric stores natural pixel size in width/height (pre-scale). */
interface RawObj {
  type?: string
  name?: string
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  path?: unknown
}

/**
 * Extract a normalized pre-flight design summary from a Fabric canvas.
 * Pure read — never mutates the canvas.
 */
export function extractPreflightSummary(
  canvas: FabricCanvas,
  pxPerMm: number,
): PreflightDesignSummary {
  const rasterElements: PreflightDesignSummary['rasterElements'] = []
  const textElements: PreflightDesignSummary['textElements'] = []

  // Accumulate the union bounding box (in px) across every object.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let sawAny = false

  const toMm = (px: number) => px / pxPerMm

  for (const obj of canvas.getObjects()) {
    const raw = obj as unknown as RawObj
    const rect = (obj as FabricObject).getBoundingRect()

    // Overall artwork bounds — union of every object's absolute box.
    sawAny = true
    minX = Math.min(minX, rect.left)
    minY = Math.min(minY, rect.top)
    maxX = Math.max(maxX, rect.left + rect.width)
    maxY = Math.max(maxY, rect.top + rect.height)

    const boundsMm: PreflightBox = {
      x: toMm(rect.left),
      y: toMm(rect.top),
      w: toMm(rect.width),
      h: toMm(rect.height),
    }

    const type = raw.type
    if (type === 'image' || type === 'svg') {
      const naturalWidthPx = raw.width ?? 1
      const placedWidthMm = ((raw.scaleX ?? 1) * naturalWidthPx) / pxPerMm
      rasterElements.push({
        label: raw.name,
        naturalWidthPx,
        placedWidthMm,
      })
    } else if (type === 'text' || type === 'i-text' || type === 'textbox') {
      textElements.push({
        label: raw.name,
        // Outlined-to-paths text carries a `path` once converted; live text
        // doesn't. !!path is the load-bearing signal for the font-policy check.
        outlined: !!raw.path,
        bounds: boundsMm,
      })
    }
  }

  const artworkBounds: PreflightBox | null = sawAny
    ? { x: toMm(minX), y: toMm(minY), w: toMm(maxX - minX), h: toMm(maxY - minY) }
    : null

  return {
    artworkBounds,
    rasterElements,
    textElements,
    // V1 TODO — canvas doesn't carry spot colors / a declared color space yet.
    spotColors: [],
    declaredColorSpace: null,
  }
}
