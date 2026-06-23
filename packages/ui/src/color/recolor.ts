// Template/design recolor engine (Brand template theming, Phase 3 — docs/BRAND_TEMPLATE_THEMING.md).
//
// Pure string→string transforms over a Fabric `canvas.toJSON()` payload: collect the
// distinct vector colors, and replace them per an old→new hex map. Skips image objects
// (logos/photos/QR bitmaps can't be recolored) and any caller-specified customTypes
// (e.g. regulated label sections). No deps; deterministic; unit-testable.

import { normalizeHex, relativeLuminance, hexToRgb } from './convert'

export interface RecolorOptions {
  /** Fabric object `type`s to skip entirely. Default ['image']. */
  skipTypes?: string[]
  /** Object `customType`s to skip (e.g. regulated label sections). */
  skipCustomTypes?: string[]
}

interface FabricObj {
  type?: string
  customType?: string
  fill?: unknown
  stroke?: unknown
  objects?: FabricObj[]
  [k: string]: unknown
}

function shouldSkip(obj: FabricObj, skipTypes: string[], skipCustom: string[]): boolean {
  if (obj.type && skipTypes.includes(obj.type)) return true
  if (obj.customType && skipCustom.includes(obj.customType)) return true
  return false
}

/** Visit every recolorable object (recursing groups), skipping images + skip-sets. */
function walk(objects: FabricObj[] | undefined, opts: Required<RecolorOptions>, visit: (o: FabricObj) => void): void {
  if (!Array.isArray(objects)) return
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue
    const skip = shouldSkip(obj, opts.skipTypes, opts.skipCustomTypes)
    if (!skip) visit(obj)
    // Recurse into groups even when the group node itself is "skipped" only by type;
    // but if it's a skipped customType (regulated section), leave its children alone too.
    if (obj.customType && opts.skipCustomTypes.includes(obj.customType)) continue
    if (Array.isArray(obj.objects)) walk(obj.objects, opts, visit)
  }
}

function resolveOpts(opts?: RecolorOptions): Required<RecolorOptions> {
  return {
    skipTypes: opts?.skipTypes ?? ['image'],
    skipCustomTypes: opts?.skipCustomTypes ?? [],
  }
}

/** Distinct hex colors used by recolorable vector objects, most-used first. */
export function collectCanvasColors(
  canvasJson: string,
  opts?: RecolorOptions,
): { hex: string; count: number }[] {
  let parsed: { objects?: FabricObj[] }
  try {
    parsed = JSON.parse(canvasJson)
  } catch {
    return []
  }
  const o = resolveOpts(opts)
  const counts = new Map<string, number>()
  const tally = (v: unknown) => {
    if (typeof v !== 'string') return // gradients/patterns are objects → skip
    const hex = normalizeHex(v)
    if (!hex) return // rgb()/named/transparent → skip
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  walk(parsed.objects, o, (obj) => {
    tally(obj.fill)
    tally(obj.stroke)
  })
  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count)
}

/** Replace fill/stroke colors per an old→new hex map. Keys are matched case-insensitively. */
export function recolorCanvasJson(
  canvasJson: string,
  map: Record<string, string>,
  opts?: RecolorOptions,
): string {
  let parsed: { objects?: FabricObj[] }
  try {
    parsed = JSON.parse(canvasJson)
  } catch {
    return canvasJson
  }
  const o = resolveOpts(opts)
  // Normalize the map keys + values to canonical hex.
  const norm = new Map<string, string>()
  for (const [k, v] of Object.entries(map)) {
    const nk = normalizeHex(k)
    const nv = normalizeHex(v)
    if (nk && nv) norm.set(nk, nv)
  }
  const swap = (v: unknown): unknown => {
    if (typeof v !== 'string') return v
    const hex = normalizeHex(v)
    if (!hex) return v
    return norm.get(hex) ?? v
  }
  walk(parsed.objects, o, (obj) => {
    if (obj.fill !== undefined) obj.fill = swap(obj.fill)
    if (obj.stroke !== undefined) obj.stroke = swap(obj.stroke)
  })
  return JSON.stringify(parsed)
}

/**
 * Suggest an old→new mapping from a set of source colors onto a palette, ordered by
 * lightness (darkest source → darkest palette swatch). Extra source colors cycle the
 * palette. Caller can override any row before applying.
 */
export function autoMapColors(colors: string[], palette: string[]): Record<string, string> {
  const src = colors
    .map((c) => normalizeHex(c))
    .filter((c): c is string => c !== null)
  const pal = palette
    .map((c) => normalizeHex(c))
    .filter((c): c is string => c !== null)
  if (src.length === 0 || pal.length === 0) return {}
  const lum = (hex: string) => relativeLuminance(hexToRgb(hex))
  const srcSorted = [...src].sort((a, b) => lum(a) - lum(b))
  const palSorted = [...pal].sort((a, b) => lum(a) - lum(b))
  const out: Record<string, string> = {}
  srcSorted.forEach((hex, i) => {
    out[hex] = palSorted[Math.min(i, palSorted.length - 1)] as string
  })
  return out
}
