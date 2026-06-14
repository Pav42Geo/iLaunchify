// Pure layout core for the FDA aggregate ("multi-column") Nutrition Facts panel
// used on variety / assorted multi-unit packages — 21 CFR 101.9(d)(13).
//
// This module computes a flat list of positioned draw-ops (text + rect) from an
// array of STANDARD PanelData (one per flavor). It contains NO React and NO CSS,
// so the regulated geometry (column positions, Calories-per-column, bold rules,
// rule placement, overall dimensions) is deterministic and node-verifiable
// without a renderer (see variety-layout.selftest.ts). VarietyFactsSvg.tsx is a
// thin presentational wrapper that maps these ops to <text>/<rect>.

import type { PanelData, NutrientRow } from '@ilaunchify/types'

export const FONT = 'Helvetica, Arial, sans-serif'

// Layout constants (SVG user units ≈ pt at viewBox scale).
const PAD = 6
export const BORDER = 1.5
const TITLE_PX = 26
const TITLE_RULE = 0.75
const SERVINGS_PX = 11
const SERVING_LABEL_PX = 13
const HEAVY_BAR = 7
const COL_HEADER_PX = 11
const CAL_LABEL_PX = 18
const CAL_NUM_PX = 30
const CALORIES_RULE = 4
const ROW_PX = 11
const ROW_RULE = 0.5
const VITAMIN_RULE = 2.5
const FOOTER_BAR = 4
const FOOTER_PX = 9
const ROW_LINE_GAP = 2
const COL_GAP = 8
const DV_SUBCOL_GAP = 10 // breathing room between the amount and its %DV
const NUM_COL_PAD = 5
const NAME_COL_W = 150
const MIN_COL_W = 54

const BOLD_IDS = new Set(['calories', 'totalFat', 'cholesterol', 'sodium', 'totalCarbohydrate', 'protein'])
const VITAMIN_IDS = new Set(['vitaminD', 'calcium', 'iron', 'potassium'])
const INDENT_PX = [0, 10, 20] as const

function indentFor(indent: number | undefined): number {
  if (indent === 1) return INDENT_PX[1]
  if (indent === 2) return INDENT_PX[2]
  return INDENT_PX[0]
}

export function amountText(row: NutrientRow | undefined): string {
  if (!row) return ''
  if (typeof row.amount === 'string') return row.unit ? `${row.amount}${row.unit}` : row.amount
  const num = Number.isInteger(row.amount) ? String(row.amount) : row.amount.toFixed(1)
  return row.unit ? `${num}${row.unit}` : num
}

export function dvText(row: NutrientRow | undefined): string {
  if (!row) return ''
  if (row.dvText !== undefined) return row.dvText
  if (row.percentDailyValue !== undefined) return `${row.percentDailyValue}%`
  return ''
}

export function caloriesNum(row: NutrientRow | undefined): string {
  if (!row) return '0'
  if (typeof row.amount === 'string') return row.amount
  return String(Math.round(row.amount))
}

// Lightweight monospace-ish advance estimate (no DOM). Mirrors SupplementFactsSvg's
// estimateTextWidth heuristic so column sizing is consistent across renderers.
export function estimateWidth(text: string, fontPx: number): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ') units += 0.28
    else if ('iIl.,:;\'!|'.includes(ch)) units += 0.3
    else if ('fjtr()[]'.includes(ch)) units += 0.4
    else if ('mwMW'.includes(ch)) units += 0.85
    else if (ch >= '0' && ch <= '9') units += 0.56
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) units += 0.68
    else units += 0.52
  }
  return units * fontPx
}

// Greedy word wrap to a pixel width.
export function wrapText(text: string, maxWidth: number, fontPx: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (estimateWidth(trial, fontPx) <= maxWidth || cur === '') cur = trial
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

export type LayoutText = { kind: 'text'; x: number; y: number; size: number; weight: number; anchor: 'start' | 'middle' | 'end'; text: string }
export type LayoutRect = { kind: 'rect'; x: number; y: number; w: number; h: number }
export type LayoutOp = LayoutText | LayoutRect
export interface VarietyLayout { W: number; height: number; ops: LayoutOp[] }

export interface VarietyColumn { label: string; data: PanelData }

/** Compute the full draw-op list for the aggregate panel. Pure + deterministic. */
export function layoutVarietyFacts(columns: VarietyColumn[]): VarietyLayout {
  const cols = columns.filter((c) => c.data && c.data.rows.length > 0)
  if (cols.length === 0) return { W: 10, height: 10, ops: [] }

  const canonical = cols[0]!.data
  const byId: Array<Map<string, NutrientRow>> = cols.map((c) => {
    const m = new Map<string, NutrientRow>()
    for (const r of c.data.rows) m.set(r.id, r)
    return m
  })
  const bodyRows = canonical.rows.filter((r) => r.id !== 'calories')

  function colContentWidth(ci: number): number {
    let amountW = 0
    let pctW = 0
    for (const r of bodyRows) {
      const row = byId[ci]!.get(r.id)
      amountW = Math.max(amountW, estimateWidth(amountText(row), ROW_PX))
      pctW = Math.max(pctW, estimateWidth(dvText(row), ROW_PX))
    }
    return amountW + DV_SUBCOL_GAP + pctW
  }
  const colW = cols.map((_, ci) => Math.ceil(Math.max(colContentWidth(ci), MIN_COL_W)) + NUM_COL_PAD * 2)

  const innerLeft = PAD
  let cursor = innerLeft + NAME_COL_W + COL_GAP
  const colRight: number[] = []
  const colCenter: number[] = []
  cols.forEach((_, ci) => {
    const w = colW[ci]!
    colRight.push(cursor + w)
    colCenter.push(cursor + w / 2)
    cursor += w + COL_GAP
  })
  const W = cursor - COL_GAP + PAD
  const innerRight = W - PAD
  const innerWidth = innerRight - innerLeft

  const ops: LayoutOp[] = []
  let y = PAD

  const titlePx = Math.min(TITLE_PX, Math.max(18, Math.floor((NAME_COL_W * 1.6) / (0.62 * 'Nutrition Facts'.length))))
  y += titlePx
  ops.push({ kind: 'text', x: innerLeft, y, size: titlePx, weight: 800, anchor: 'start', text: 'Nutrition Facts' })
  y += 3
  ops.push({ kind: 'rect', x: innerLeft, y, w: innerWidth, h: TITLE_RULE })

  if (canonical.servingsPerContainer && canonical.servingsPerContainer.trim().length > 0) {
    y += 3 + SERVINGS_PX
    ops.push({ kind: 'text', x: innerLeft, y, size: SERVINGS_PX, weight: 400, anchor: 'start', text: `${canonical.servingsPerContainer} servings per container` })
  }
  y += 3 + SERVING_LABEL_PX
  ops.push({ kind: 'text', x: innerLeft, y, size: SERVING_LABEL_PX, weight: 700, anchor: 'start', text: 'Serving size' })
  // Shared serving line spans the whole panel → right-align the value to the far
  // edge so it never collides with the "Serving size" label.
  ops.push({ kind: 'text', x: innerRight, y, size: SERVING_LABEL_PX, weight: 700, anchor: 'end', text: canonical.servingSize })

  y += 4
  ops.push({ kind: 'rect', x: innerLeft, y, w: innerWidth, h: HEAVY_BAR })
  y += HEAVY_BAR

  // Column headers (flavor names), centered, wrapped.
  y += 3
  let headerLines = 1
  cols.forEach((c, ci) => {
    const lines = wrapText(c.label || `Flavor ${ci + 1}`, colW[ci]! + COL_GAP, COL_HEADER_PX)
    headerLines = Math.max(headerLines, lines.length)
    lines.forEach((line, li) => {
      ops.push({ kind: 'text', x: colCenter[ci]!, y: y + COL_HEADER_PX + li * (COL_HEADER_PX + ROW_LINE_GAP), size: COL_HEADER_PX, weight: 700, anchor: 'middle', text: line })
    })
  })
  y += COL_HEADER_PX + (headerLines - 1) * (COL_HEADER_PX + ROW_LINE_GAP) + 3

  y += ROW_PX
  ops.push({ kind: 'text', x: innerLeft, y, size: ROW_PX, weight: 700, anchor: 'start', text: 'Amount per serving · % DV' })
  y += 2

  // Calories — word baseline-aligned to the big numbers; no bar above (d)(5).
  y += 2
  const calBaseline = y + CAL_NUM_PX
  ops.push({ kind: 'text', x: innerLeft, y: calBaseline, size: CAL_LABEL_PX, weight: 700, anchor: 'start', text: 'Calories' })
  cols.forEach((_, ci) => {
    ops.push({ kind: 'text', x: colCenter[ci]!, y: calBaseline, size: CAL_NUM_PX, weight: 800, anchor: 'middle', text: caloriesNum(byId[ci]!.get('calories')) })
  })
  y = calBaseline + 4
  ops.push({ kind: 'rect', x: innerLeft, y, w: innerWidth, h: CALORIES_RULE })
  y += CALORIES_RULE

  let prevVitamin = false
  bodyRows.forEach((row) => {
    const isVitamin = VITAMIN_IDS.has(row.id)
    if (isVitamin && !prevVitamin) ops.push({ kind: 'rect', x: innerLeft, y, w: innerWidth, h: VITAMIN_RULE })
    prevVitamin = isVitamin

    const indent = indentFor(row.indent)
    const nameX = innerLeft + indent
    const isBold = BOLD_IDS.has(row.id)
    const nameLines = wrapText(row.label, NAME_COL_W - indent, ROW_PX)
    const lineCount = Math.max(1, nameLines.length)
    const firstBaseline = y + 3 + ROW_PX

    nameLines.forEach((line, li) => {
      ops.push({ kind: 'text', x: nameX, y: firstBaseline + li * (ROW_PX + ROW_LINE_GAP), size: ROW_PX, weight: isBold ? 700 : 400, anchor: 'start', text: line })
    })

    cols.forEach((_, ci) => {
      const r = byId[ci]!.get(row.id)
      const amt = amountText(r)
      const pct = dvText(r)
      const rightX = colRight[ci]!
      if (pct.length > 0) ops.push({ kind: 'text', x: rightX, y: firstBaseline, size: ROW_PX, weight: 700, anchor: 'end', text: pct })
      if (amt.length > 0) {
        const amtRight = pct.length > 0 ? rightX - estimateWidth(pct, ROW_PX) - DV_SUBCOL_GAP : rightX
        ops.push({ kind: 'text', x: amtRight, y: firstBaseline, size: ROW_PX, weight: 400, anchor: 'end', text: amt })
      }
    })

    y = firstBaseline + (lineCount - 1) * (ROW_PX + ROW_LINE_GAP) + 4
    ops.push({ kind: 'rect', x: innerLeft, y, w: innerWidth, h: ROW_RULE })
  })

  const footer = canonical.requiredFooter
  if (footer && footer.trim().length > 0) {
    ops.push({ kind: 'rect', x: innerLeft, y, w: innerWidth, h: FOOTER_BAR })
    y += FOOTER_BAR + 4
    const footerLines = wrapText(footer, innerWidth, FOOTER_PX)
    footerLines.forEach((line, fi) => {
      ops.push({ kind: 'text', x: innerLeft, y: y + FOOTER_PX + fi * (FOOTER_PX + ROW_LINE_GAP), size: FOOTER_PX, weight: 400, anchor: 'start', text: line })
    })
    y += FOOTER_PX + (footerLines.length - 1) * (FOOTER_PX + ROW_LINE_GAP)
  }

  y += PAD
  return { W: Math.ceil(W), height: Math.ceil(y), ops }
}
