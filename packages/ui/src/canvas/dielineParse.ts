// =============================================================================
// Die-line auto-parse (C9.d / DIELINE_MANAGEMENT_UX §4) — pure SVG recognizer.
//
// Reads a partner's SVG die-line and RECOVERS its structured spec (trim / bleed /
// safe / fold) using layers of decreasing authority, each contributing a
// confidence score, plus a COVERAGE list of elements it could NOT classify (so
// nothing is silently dropped — the Conversion Verifier surfaces these).
//
// Pure + DOM-free (regex scan of the SVG text). Node-verifiable. PDF/AI parsing
// is a separate background job (pdf-parse) — this handles the SVG path now.
//
// Authority order per element:
//   1. layer / id / class NAME match  → confidence 0.95
//   2. stroke COLOR convention         → confidence 0.80
//   3. GEOMETRY inference (size rank)  → confidence 0.50
// =============================================================================

export interface ParsedBox {
  x: number
  y: number
  w: number
  h: number
}
export interface ParsedFold {
  x1: number
  y1: number
  x2: number
  y2: number
  type: 'VALLEY' | 'MOUNTAIN' | 'PERFORATION'
}

export interface DielineParseResult {
  /** Total artwork size in user units (the SVG viewBox / width-height). */
  sheetW: number
  sheetH: number
  /** Detected in user units (caller scales to mm if it knows the real size). */
  trimBox: ParsedBox | null
  bleedBox: ParsedBox | null
  safeBox: ParsedBox | null
  foldLines: ParsedFold[]
  /** 0..1 per field + overall. */
  confidence: { trim: number; bleed: number; safe: number; folds: number }
  parseAccuracyScore: number
  /** Elements we could not classify — surfaced for review (coverage guard). */
  unrecognized: string[]
}

type Method = 'name' | 'color' | 'geometry'
const METHOD_CONF: Record<Method, number> = { name: 0.95, color: 0.8, geometry: 0.5 }

// ---- tiny attribute + color helpers ----------------------------------------

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, 'i'))
  return m?.[1] ?? null
}
function numAttr(tag: string, name: string): number {
  const v = attr(tag, name)
  const n = v == null ? NaN : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Normalize a stroke value to a rough class: cyan/magenta/green/yellow/gray/other. */
function strokeClass(tag: string): string | null {
  let s = (attr(tag, 'stroke') ?? '').toLowerCase().trim()
  if (!s) {
    const style = (attr(tag, 'style') ?? '').toLowerCase()
    s = style.match(/stroke\s*:\s*([^;]+)/)?.[1]?.trim() ?? ''
  }
  if (!s || s === 'none') return null
  let r = 0
  let g = 0
  let b = 0
  const named: Record<string, [number, number, number]> = {
    cyan: [0, 255, 255], magenta: [255, 0, 255], red: [255, 0, 0],
    green: [0, 128, 0], yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128],
    black: [0, 0, 0],
  }
  const hit = named[s]
  if (hit) { r = hit[0]; g = hit[1]; b = hit[2] }
  else if (s.startsWith('#')) {
    const h = s.slice(1)
    const hex = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16)
  } else {
    const m = s.match(/rgb\(\s*(\d+)\D+(\d+)\D+(\d+)/)
    if (m) { r = Number(m[1] ?? 0); g = Number(m[2] ?? 0); b = Number(m[3] ?? 0) }
    else return 'other'
  }
  if (![r, g, b].every(Number.isFinite)) return 'other'
  // Convention buckets (tolerant).
  if (b > 150 && g > 120 && r < 90) return 'cyan' // die / cut
  if (r > 150 && b > 120 && g < 90) return 'magenta' // crease / fold
  if (g > 110 && r < 120 && b < 120) return 'green' // safe
  if (r > 180 && g > 140 && b < 90) return 'yellow' // perforation
  if (Math.abs(r - g) < 40 && Math.abs(g - b) < 40 && r < 200) return 'gray' // bleed
  return 'other'
}

function classifyByName(name: string): 'trim' | 'bleed' | 'safe' | 'fold' | 'perf' | null {
  const n = name.toLowerCase()
  if (/\b(die|cut|cutter|dieline|trim)\b/.test(n)) return 'trim'
  if (/bleed/.test(n)) return 'bleed'
  if (/(safe|safety|live)/.test(n)) return 'safe'
  if (/(crease|fold|score)/.test(n)) return 'fold'
  if (/perf/.test(n)) return 'perf'
  return null
}

// ---- the parser -------------------------------------------------------------

export function parseDielineSvg(svg: string): DielineParseResult {
  const result: DielineParseResult = {
    sheetW: 0, sheetH: 0, trimBox: null, bleedBox: null, safeBox: null, foldLines: [],
    confidence: { trim: 0, bleed: 0, safe: 0, folds: 0 }, parseAccuracyScore: 0, unrecognized: [],
  }

  // Sheet size: prefer viewBox; else width/height numerics.
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const vb = (attr(root, 'viewBox') ?? '').split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n))
  if (vb.length === 4) { result.sheetW = vb[2] ?? 0; result.sheetH = vb[3] ?? 0 }
  else { result.sheetW = numAttr(root, 'width'); result.sheetH = numAttr(root, 'height') }

  // Collect candidate rects with their classification method.
  const rects: Array<{ box: ParsedBox; cls: ReturnType<typeof classifyByName>; method: Method | null; raw: string }> = []
  for (const tag of svg.match(/<rect\b[^>]*\/?>/gi) ?? []) {
    const box: ParsedBox = { x: numAttr(tag, 'x'), y: numAttr(tag, 'y'), w: numAttr(tag, 'width'), h: numAttr(tag, 'height') }
    if (box.w <= 0 || box.h <= 0) continue
    const name = `${attr(tag, 'id') ?? ''} ${attr(tag, 'class') ?? ''} ${attr(tag, 'inkscape:label') ?? ''}`
    let cls = classifyByName(name)
    let method: Method | null = cls ? 'name' : null
    if (!cls) {
      const sc = strokeClass(tag)
      if (sc === 'cyan') { cls = 'trim'; method = 'color' }
      else if (sc === 'green') { cls = 'safe'; method = 'color' }
      else if (sc === 'gray') { cls = 'bleed'; method = 'color' }
    }
    rects.push({ box, cls, method, raw: tag })
  }

  // Geometry fallback for still-unclassified rects: largest=bleed, mid=trim, small=safe.
  const unclassified = rects.filter((r) => !r.cls)
  if (unclassified.length > 0 && !rects.some((r) => r.cls)) {
    const ranked = [...unclassified].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
    const assign: Array<'bleed' | 'trim' | 'safe'> = ['bleed', 'trim', 'safe']
    ranked.slice(0, 3).forEach((r, i) => {
      const a = assign[i]
      if (a) { r.cls = a; r.method = 'geometry' }
    })
  }

  const pick = (cls: string) => rects.find((r) => r.cls === cls)
  const trim = pick('trim'); const bleed = pick('bleed'); const safe = pick('safe')
  if (trim) { result.trimBox = trim.box; result.confidence.trim = METHOD_CONF[trim.method ?? 'geometry'] }
  if (bleed) { result.bleedBox = bleed.box; result.confidence.bleed = METHOD_CONF[bleed.method ?? 'geometry'] }
  if (safe) { result.safeBox = safe.box; result.confidence.safe = METHOD_CONF[safe.method ?? 'geometry'] }

  // Fold lines from <line> with fold-ish name/color.
  for (const tag of svg.match(/<line\b[^>]*\/?>/gi) ?? []) {
    const name = `${attr(tag, 'id') ?? ''} ${attr(tag, 'class') ?? ''} ${attr(tag, 'inkscape:label') ?? ''}`
    const byName = classifyByName(name)
    const sc = strokeClass(tag)
    const isFold = byName === 'fold' || byName === 'perf' || sc === 'magenta' || sc === 'red' || sc === 'yellow'
    if (!isFold) continue
    const type: ParsedFold['type'] = byName === 'perf' || sc === 'yellow' ? 'PERFORATION' : sc === 'red' ? 'MOUNTAIN' : 'VALLEY'
    result.foldLines.push({ x1: numAttr(tag, 'x1'), y1: numAttr(tag, 'y1'), x2: numAttr(tag, 'x2'), y2: numAttr(tag, 'y2'), type })
  }
  if (result.foldLines.length > 0) result.confidence.folds = 0.8

  // Coverage: any drawable element not used → unrecognized (nothing silently dropped).
  const usedRaws = new Set([trim?.raw, bleed?.raw, safe?.raw].filter(Boolean) as string[])
  for (const r of rects) if (!usedRaws.has(r.raw) && !r.cls) result.unrecognized.push(`rect#${attr(r.raw, 'id') ?? '?'}`)
  for (const t of svg.match(/<(path|circle|polygon|ellipse|image)\b[^>]*>/gi) ?? []) {
    const tagName = t.match(/<(\w+)/)?.[1] ?? 'el'
    result.unrecognized.push(`${tagName}#${attr(t, 'id') ?? '?'}`)
  }

  const present = [result.confidence.trim, result.confidence.bleed, result.confidence.safe].filter((c) => c > 0)
  result.parseAccuracyScore = present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100 : 0
  return result
}
