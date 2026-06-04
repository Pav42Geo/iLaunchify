'use client'

// Track D — seamless background patterns for the label canvas.
//
// Each pattern is a tiny SVG tile (white base + a colored motif, so there's no
// transparency to bleed through and the data-URL source round-trips cleanly
// through autosave's toJSON). Applied as the Fabric canvas backgroundColor via
// a repeating fabric.Pattern — mirrors setCanvasBackground's slot, so the
// existing background picker and this one are mutually exclusive (last wins).

import * as fabric from 'fabric'
import type { FabricCanvas } from './types'

export interface PatternTile {
  id: string
  label: string
  /** SVG markup with `{{C}}` where the motif color goes. */
  svg: string
}

const T = (w: number, h: number, body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='${w}' height='${h}' fill='#FFFFFF'/>${body}</svg>`

export const PATTERN_TILES: PatternTile[] = [
  { id: 'dots', label: 'Dots', svg: T(24, 24, `<circle cx='6' cy='6' r='2' fill='{{C}}'/><circle cx='18' cy='18' r='2' fill='{{C}}'/>`) },
  { id: 'grid', label: 'Grid', svg: T(24, 24, `<path d='M24 0V24M0 24H24' stroke='{{C}}' stroke-width='1' fill='none'/>`) },
  { id: 'diagonal', label: 'Diagonal', svg: T(16, 16, `<path d='M-4 4L4 -4M0 16L16 0M12 20L20 12' stroke='{{C}}' stroke-width='1.5'/>`) },
  { id: 'chevron', label: 'Chevron', svg: T(24, 12, `<path d='M0 12L12 2L24 12' stroke='{{C}}' stroke-width='1.5' fill='none'/>`) },
  { id: 'triangles', label: 'Triangles', svg: T(24, 24, `<path d='M6 4l4 6H2z' fill='{{C}}'/><path d='M18 14l4 6h-8z' fill='{{C}}'/>`) },
  { id: 'crosshatch', label: 'Crosshatch', svg: T(16, 16, `<path d='M0 0L16 16M16 0L0 16' stroke='{{C}}' stroke-width='1'/>`) },
  { id: 'plus', label: 'Plus', svg: T(24, 24, `<path d='M12 7v10M7 12h10' stroke='{{C}}' stroke-width='1.5'/>`) },
  { id: 'waves', label: 'Waves', svg: T(40, 12, `<path d='M0 6q5 -6 10 0t10 0t10 0t10 0' stroke='{{C}}' stroke-width='1.5' fill='none'/>`) },
]

function toDataUrl(svg: string): string {
  // base64 keeps the data URL robust against `#` and quotes in the SVG.
  const b64 = typeof btoa !== 'undefined' ? btoa(svg) : Buffer.from(svg).toString('base64')
  return `data:image/svg+xml;base64,${b64}`
}

/** Data URL for a pattern tile recolored to `color` — used for previews + fill. */
export function patternTileDataUrl(tileSvg: string, color: string): string {
  return toDataUrl(tileSvg.replaceAll('{{C}}', color))
}

/** Apply a repeating pattern as the canvas background. */
export async function setCanvasPatternBackground(
  canvas: FabricCanvas,
  tileSvg: string,
  color: string,
): Promise<void> {
  const img = await fabric.util.loadImage(patternTileDataUrl(tileSvg, color), {
    crossOrigin: 'anonymous',
  })
  const pattern = new fabric.Pattern({ source: img, repeat: 'repeat' })
  // Fabric accepts string | Gradient | Pattern for backgroundColor.
  canvas.backgroundColor = pattern as unknown as string
  canvas.fire('object:modified', { target: canvas as unknown as fabric.FabricObject })
  canvas.requestRenderAll()
}

/** Clear any pattern/color background back to a solid color (default white). */
export function clearCanvasPattern(canvas: FabricCanvas, color = '#FFFFFF'): void {
  canvas.backgroundColor = color
  canvas.fire('object:modified', { target: canvas as unknown as fabric.FabricObject })
  canvas.requestRenderAll()
}
