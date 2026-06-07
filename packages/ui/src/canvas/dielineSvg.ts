// Normalized dieline SVG generator (C9).
//
// Turns a PackagingDieline's confirmed STRUCTURED SPEC (mm dimensions + bleed +
// optional trim/safe/fold geometry) into a clean, conventional prepress SVG
// string. This is the "normalized" representation the platform stores
// (PackagingDieline.normalizedSvgKey) and renders as a uniform overlay — it is
// NOT the partner's original artwork file (that stays immutable in R2).
//
// Distinct from DieCutFrame.tsx, which draws a live overlay on the Fabric
// canvas; this produces a standalone SVG document (export bundle + thumbnails).
//
// Stroke conventions (industry standard):
//   • trim line      → solid cyan
//   • bleed boundary → dashed gray
//   • safe area      → dashed green
//   • valley fold    → solid magenta
//   • mountain fold  → solid red
//   • perforation    → dashed orange
//
// Pure function — no DOM, no I/O, no React. Unit-verifiable.

export interface DielineBox {
  x: number
  y: number
  w: number
  h: number
}

export interface DielineFold {
  x1: number
  y1: number
  x2: number
  y2: number
  type?: 'VALLEY' | 'MOUNTAIN' | 'PERFORATION'
}

export interface DielineSurface {
  name: string
  trimBox?: DielineBox | null
}

export interface DielineSpecInput {
  /** Trim width in mm (the finished cut size). */
  widthMm: number
  /** Trim height in mm. */
  heightMm: number
  /** Bleed on every side in mm. Default 3. */
  bleedMm?: number | null
  /** Safe-area inset from trim in mm (ignored when safeAreaBox is given). Default 3. */
  safeAreaMm?: number | null
  /** Explicit trim box (mm, origin = top-left of the full bleed area). Overrides the derived trim. */
  trimBox?: DielineBox | null
  /** Explicit safe-area box (mm). Overrides the derived safe area. */
  safeAreaBox?: DielineBox | null
  /** Fold / score / perforation lines (mm). */
  foldLines?: DielineFold[] | null
  /** Multi-surface dielines: per-surface trim boxes (mm). */
  surfaces?: DielineSurface[] | null
}

const STROKE = {
  trim: '#00AEEF', // cyan
  bleed: '#9AA0A6', // gray
  safe: '#34A853', // green
  valley: '#D6219B', // magenta
  mountain: '#EA4335', // red
  perf: '#F29900', // orange
} as const

function n(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '0'
}

function rect(b: DielineBox, stroke: string, dash?: string): string {
  const d = dash ? ` stroke-dasharray="${dash}"` : ''
  return `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="none" stroke="${stroke}" stroke-width="0.25"${d}/>`
}

function foldStroke(type: DielineFold['type']): { color: string; dash?: string } {
  switch (type) {
    case 'MOUNTAIN':
      return { color: STROKE.mountain }
    case 'PERFORATION':
      return { color: STROKE.perf, dash: '1.5 1' }
    case 'VALLEY':
    default:
      return { color: STROKE.valley }
  }
}

/**
 * Generate a normalized dieline SVG (mm units) from a structured spec.
 * Returns a complete, standalone `<svg>` document string.
 */
export function dielineSvgFromSpec(spec: DielineSpecInput): string {
  const bleed = Math.max(0, spec.bleedMm ?? 3)
  const trimW = Math.max(0, spec.widthMm)
  const trimH = Math.max(0, spec.heightMm)

  // Degenerate input → minimal valid SVG (don't throw in a render path).
  if (trimW <= 0 || trimH <= 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"></svg>'
  }

  const totalW = trimW + 2 * bleed
  const totalH = trimH + 2 * bleed

  const trim: DielineBox = spec.trimBox ?? { x: bleed, y: bleed, w: trimW, h: trimH }

  const safeInset = Math.max(0, spec.safeAreaMm ?? 3)
  const safe: DielineBox =
    spec.safeAreaBox ??
    {
      x: trim.x + safeInset,
      y: trim.y + safeInset,
      w: Math.max(0, trim.w - 2 * safeInset),
      h: Math.max(0, trim.h - 2 * safeInset),
    }

  const parts: string[] = []
  // White substrate background covering the full bleed area.
  parts.push(`<rect x="0" y="0" width="${n(totalW)}" height="${n(totalH)}" fill="#FFFFFF"/>`)
  // Bleed boundary (outermost).
  parts.push(rect({ x: 0, y: 0, w: totalW, h: totalH }, STROKE.bleed, '2 1.5'))

  // Trim — either the single derived/explicit trim, or each surface's trim.
  if (spec.surfaces && spec.surfaces.length > 0) {
    for (const s of spec.surfaces) {
      const box = s.trimBox ?? trim
      parts.push(rect(box, STROKE.trim))
      parts.push(
        `<text x="${n(box.x + 1)}" y="${n(box.y + 3)}" font-family="sans-serif" font-size="2.5" fill="${STROKE.trim}">${escapeXml(s.name)}</text>`,
      )
    }
  } else {
    parts.push(rect(trim, STROKE.trim))
  }

  // Safe area.
  if (safe.w > 0 && safe.h > 0) parts.push(rect(safe, STROKE.safe, '1 1'))

  // Fold / score / perforation lines.
  for (const f of spec.foldLines ?? []) {
    const { color, dash } = foldStroke(f.type)
    const d = dash ? ` stroke-dasharray="${dash}"` : ''
    parts.push(
      `<line x1="${n(f.x1)}" y1="${n(f.y1)}" x2="${n(f.x2)}" y2="${n(f.y2)}" stroke="${color}" stroke-width="0.25"${d}/>`,
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(totalW)}mm" height="${n(totalH)}mm" ` +
    `viewBox="0 0 ${n(totalW)} ${n(totalH)}">` +
    parts.join('') +
    `</svg>`
  )
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;',
  )
}
