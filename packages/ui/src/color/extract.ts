// Palette extraction from image pixels (Brand Palette Generator Phase 2).
//
// Pure median-cut quantizer — takes RGBA pixel data (e.g. from a canvas
// getImageData) and returns N dominant hex colors. Deterministic (no RNG), so it's
// unit-testable. The DOM side (loading an image → canvas → getImageData) lives in the
// component; this file is browser-agnostic.

import { rgbToHex } from './convert'

type Rgb3 = [number, number, number]

export interface ExtractOptions {
  count?: number // target colors (2–6), default 5
  /** Drop near-white + fully transparent pixels (good for logos on white). */
  dropBackground?: boolean
  /** Sample every Nth opaque pixel to cap work. Default 1 (caller usually downsizes). */
  sampleStep?: number
}

function collectPixels(rgba: Uint8ClampedArray | number[], opts: Required<ExtractOptions>): Rgb3[] {
  const out: Rgb3[] = []
  const n = rgba.length
  const step = Math.max(1, Math.floor(opts.sampleStep)) * 4
  for (let i = 0; i + 3 < n; i += step) {
    const r = rgba[i] as number
    const g = rgba[i + 1] as number
    const b = rgba[i + 2] as number
    const a = rgba[i + 3] as number
    if (a < 128) continue // transparent
    if (opts.dropBackground) {
      if (r > 244 && g > 244 && b > 244) continue // near-white
      if (r < 10 && g < 10 && b < 10) continue // near-black (logo outlines)
    }
    out.push([r, g, b])
  }
  return out
}

function channelRanges(box: Rgb3[]): Rgb3 {
  let rmin = 255, gmin = 255, bmin = 255
  let rmax = 0, gmax = 0, bmax = 0
  for (const [r, g, b] of box) {
    if (r < rmin) rmin = r
    if (g < gmin) gmin = g
    if (b < bmin) bmin = b
    if (r > rmax) rmax = r
    if (g > gmax) gmax = g
    if (b > bmax) bmax = b
  }
  return [rmax - rmin, gmax - gmin, bmax - bmin]
}

function average(box: Rgb3[]): Rgb3 {
  let r = 0, g = 0, b = 0
  for (const p of box) {
    r += p[0]
    g += p[1]
    b += p[2]
  }
  const n = box.length || 1
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

/** Median-cut: split the largest-range box along its widest channel until `count` boxes. */
function medianCut(pixels: Rgb3[], count: number): Rgb3[] {
  if (pixels.length === 0) return []
  let boxes: Rgb3[][] = [pixels]
  while (boxes.length < count) {
    // Pick the splittable box with the largest single-channel range.
    let bi = -1
    let best = -1
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      const [rr, gr, br] = channelRanges(box)
      const m = Math.max(rr, gr, br)
      if (m > best) {
        best = m
        bi = i
      }
    })
    if (bi < 0) break // nothing left to split
    const box = boxes[bi] as Rgb3[]
    const [rr, gr, br] = channelRanges(box)
    const ch = rr >= gr && rr >= br ? 0 : gr >= br ? 1 : 2
    const sorted = [...box].sort((a, b) => a[ch] - b[ch])
    const mid = Math.floor(sorted.length / 2)
    boxes = [
      ...boxes.slice(0, bi),
      sorted.slice(0, mid),
      sorted.slice(mid),
      ...boxes.slice(bi + 1),
    ]
  }
  // Largest (most representative) boxes first.
  return boxes
    .filter((b) => b.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(average)
}

/** Extract up to `count` dominant hex colors from RGBA pixel data. */
export function extractPalette(rgba: Uint8ClampedArray | number[], opts: ExtractOptions = {}): string[] {
  const o: Required<ExtractOptions> = {
    count: Math.min(6, Math.max(2, opts.count ?? 5)),
    dropBackground: opts.dropBackground ?? false,
    sampleStep: opts.sampleStep ?? 1,
  }
  let pixels = collectPixels(rgba, o)
  // If background-drop removed nearly everything (e.g. a mostly-white logo), retry
  // without dropping so we still return colors.
  if (pixels.length < o.count && o.dropBackground) {
    pixels = collectPixels(rgba, { ...o, dropBackground: false })
  }
  return medianCut(pixels, o.count).map((rgb) => rgbToHex({ r: rgb[0], g: rgb[1], b: rgb[2] }))
}
