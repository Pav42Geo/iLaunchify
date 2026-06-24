// =============================================================================
// PDF / AI die-line reader (DIELINE_MANAGEMENT_UX §4 — auto-parse, PDF path).
//
// Print-production die-lines arrive as PDF or Adobe Illustrator (.ai) files.
// Both are PDF-structured, and they carry the two authoritative die-line signals
// in clear, parseable form even when the page *content* streams are compressed:
//
//   1. Page boxes — /MediaBox /CropBox /TrimBox /BleedBox /ArtBox — the exact
//      trim & bleed rectangles in PDF points. TrimBox = finished cut size,
//      BleedBox = trim + bleed, ArtBox ≈ live/safe area. This is the gold signal.
//   2. Separation / spot-colour names + Illustrator layer (OCG) names —
//      "Dieline", "CutContour", "Crease", "Fold", "Perf", "Bleed", "Safety" —
//      which tell us which line *types* the file declares (even when we can't
//      lift their exact path geometry without rasterising).
//
// This module is PURE: it takes the PDF decoded as a latin1 string and returns a
// structured detection. No DOM, no decompression, no native deps. The admin
// always verifies the result in the Conversion Verifier before it's saved, so a
// best-effort recovery is safe — nothing is written without a human check.
//
// Points → mm: 1pt = 25.4/72 mm.
// =============================================================================

const PT_TO_MM = 25.4 / 72

export interface PdfDielineBox {
  /** lower-left x, in mm (PDF origin is bottom-left). */
  x: number
  y: number
  w: number
  h: number
}

export interface PdfDielineResult {
  mediaBox: PdfDielineBox | null
  cropBox: PdfDielineBox | null
  trimBox: PdfDielineBox | null
  bleedBox: PdfDielineBox | null
  artBox: PdfDielineBox | null
  /** Finished trim size (TrimBox → CropBox → MediaBox fallback). */
  widthMm: number
  heightMm: number
  bleedMm: number
  safeAreaMm: number
  /** Which box the trim dims came from. */
  trimSource: 'trimbox' | 'cropbox' | 'mediabox' | 'none'
  /** Distinct separation / spot-colour / layer names found in the file. */
  separations: string[]
  /** Which die-line line types the file declares (geometry not necessarily lifted). */
  lineTypes: { cut: boolean; crease: boolean; perf: boolean; bleed: boolean; safe: boolean; glue: boolean }
  /** Coverage gaps to surface to the admin — nothing silently dropped. */
  unrecognized: string[]
  confidence: { trim: number; bleed: number; safe: number; folds: number }
  parseAccuracyScore: number
}

const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?'

/** Decode PDF name escapes (#20 → space) and trim. */
function decodeName(raw: string): string {
  return raw.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).trim()
}

/** First occurrence of a page box, converted to mm. PDF box = [llx lly urx ury] pt. */
function findBox(pdf: string, key: string): PdfDielineBox | null {
  const re = new RegExp(`/${key}\\s*\\[\\s*(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*\\]`)
  const m = re.exec(pdf)
  if (!m) return null
  const llx = Number(m[1])
  const lly = Number(m[2])
  const urx = Number(m[3])
  const ury = Number(m[4])
  if (![llx, lly, urx, ury].every(Number.isFinite)) return null
  const x = Math.min(llx, urx)
  const y = Math.min(lly, ury)
  const w = Math.abs(urx - llx) * PT_TO_MM
  const h = Math.abs(ury - lly) * PT_TO_MM
  if (w <= 0 || h <= 0) return null
  return { x: round2(x * PT_TO_MM), y: round2(y * PT_TO_MM), w: round2(w), h: round2(h) }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function classify(name: string): Partial<PdfDielineResult['lineTypes']> {
  const s = name.toLowerCase()
  const out: Partial<PdfDielineResult['lineTypes']> = {}
  if (/cut|die.?line|dieline|knife|thru|through|contour/.test(s)) out.cut = true
  if (/crease|fold|score|bend|valley|mountain/.test(s)) out.crease = true
  if (/perf/.test(s)) out.perf = true
  if (/bleed/.test(s)) out.bleed = true
  if (/safe|safety|margin|clear/.test(s)) out.safe = true
  if (/glue|tab/.test(s)) out.glue = true
  return out
}

/**
 * Recover a structured die-line spec from a PDF/AI file (decoded as latin1).
 * Best-effort + always admin-verified; clear coverage notes for what's uncertain.
 */
export function parsePdfDieline(pdf: string): PdfDielineResult {
  const mediaBox = findBox(pdf, 'MediaBox')
  const cropBox = findBox(pdf, 'CropBox')
  const trimBox = findBox(pdf, 'TrimBox')
  const bleedBox = findBox(pdf, 'BleedBox')
  const artBox = findBox(pdf, 'ArtBox')

  // Trim dims: TrimBox is authoritative; fall back to Crop, then Media.
  let trimSource: PdfDielineResult['trimSource'] = 'none'
  let trim: PdfDielineBox | null = null
  if (trimBox) {
    trim = trimBox
    trimSource = 'trimbox'
  } else if (cropBox) {
    trim = cropBox
    trimSource = 'cropbox'
  } else if (mediaBox) {
    trim = mediaBox
    trimSource = 'mediabox'
  }

  const widthMm = trim ? trim.w : 0
  const heightMm = trim ? trim.h : 0

  // Bleed = how far BleedBox extends outside TrimBox (avg of the two visible offsets).
  let bleedMm = 0
  if (trim && bleedBox) {
    const left = trim.x - bleedBox.x
    const bottom = trim.y - bleedBox.y
    bleedMm = Math.max(0, round2((left + bottom) / 2))
  }

  // Safe inset = how far ArtBox sits *inside* TrimBox (only if ArtBox is enclosed).
  let safeAreaMm = 0
  const artInsideTrim =
    !!(trim && artBox && artBox.x >= trim.x - 0.5 && artBox.w <= trim.w + 0.5 && artBox.w < trim.w)
  if (trim && artBox && artInsideTrim) {
    const left = artBox.x - trim.x
    const bottom = artBox.y - trim.y
    safeAreaMm = Math.max(0, round2((left + bottom) / 2))
  }

  // Separation / spot-colour names + Illustrator OCG layer names + titles.
  const names = new Set<string>()
  const sepRe = /\/Separation\s*\/([^\s/[\]()<>]+)/g
  let mm: RegExpExecArray | null
  while ((mm = sepRe.exec(pdf))) {
    const n = decodeName(mm[1] ?? '')
    if (n && n.toLowerCase() !== 'all' && n.toLowerCase() !== 'none') names.add(n)
  }
  // OCG layer + object titles: /Name (Dieline), /Title (Crease)
  const strRe = /\/(?:Name|Title)\s*\(([^)]{1,60})\)/g
  while ((mm = strRe.exec(pdf))) {
    const n = (mm[1] ?? '').trim()
    if (n) names.add(n)
  }

  const lineTypes = { cut: false, crease: false, perf: false, bleed: false, safe: false, glue: false }
  for (const n of names) {
    const c = classify(n)
    for (const k of Object.keys(c) as (keyof typeof lineTypes)[]) if (c[k]) lineTypes[k] = true
  }

  // Confidence — box metadata is authoritative; line geometry from names is weaker.
  const trimConf = trimSource === 'trimbox' ? 0.9 : trimSource === 'cropbox' ? 0.7 : trimSource === 'mediabox' ? 0.6 : 0
  const bleedConf = bleedBox && trim ? 0.9 : 0
  const safeConf = artInsideTrim ? 0.7 : 0
  const foldDeclared = lineTypes.cut || lineTypes.crease || lineTypes.perf
  const foldsConf = foldDeclared ? 0.6 : 0

  // Coverage notes — be explicit about what we couldn't recover.
  const unrecognized: string[] = []
  if (trimSource === 'none') unrecognized.push('No page box found — the PDF may be compressed; set the spec manually or upload an SVG.')
  else if (trimSource !== 'trimbox') unrecognized.push(`No TrimBox — trim read from ${trimSource.toUpperCase()} (verify the finished size).`)
  if (!bleedBox) unrecognized.push('No BleedBox — bleed not detected; using house default until confirmed.')
  if (!artInsideTrim) unrecognized.push('No enclosed ArtBox — safe-area inset not detected; using house default.')
  if (foldDeclared) unrecognized.push('Fold/cut lines are declared (spot colour / layer) but their geometry is not lifted from the PDF — confirm placement in Frames mode.')
  else unrecognized.push('No cut/crease/perf separation or layer detected — confirm the die-line line work manually.')

  const present = [trimConf, bleedConf, safeConf, foldsConf].filter((v) => v > 0)
  const parseAccuracyScore = present.length ? round2(present.reduce((a, b) => a + b, 0) / 4) : 0

  return {
    mediaBox,
    cropBox,
    trimBox,
    bleedBox,
    artBox,
    widthMm,
    heightMm,
    bleedMm,
    safeAreaMm,
    trimSource,
    separations: [...names],
    lineTypes,
    unrecognized,
    confidence: { trim: trimConf, bleed: bleedConf, safe: safeConf, folds: foldsConf },
    parseAccuracyScore,
  }
}
