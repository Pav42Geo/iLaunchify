// Print-grade, CSS-immune SVG renderer for the FDA Supplement Facts panel
// (21 CFR 101.36, vertical format).
//
// This is a regulated LEGAL label. It must render deterministically regardless of
// the host page's stylesheet: NO Tailwind, NO className styling, NO inherited CSS,
// NO <foreignObject>. Every glyph is a positioned SVG <text> with an explicit
// font-size; every rule is an explicit <rect>/<line> with a literal stroke width.
//
// It consumes the SAME PanelData the HTML NutritionFactsRenderer uses (format
// SUPPLEMENT_FACTS), produced by @ilaunchify/nutrition `toSupplementPanelData`.
// IMPORTANT: for supplement rows the engine PRE-FORMATS the cells — `row.amount`
// is a ready string ("250 mg", "< 1 g", "") and `row.dvText` is a ready %DV cell
// ("60%", "* 60%", "†", ""). This renderer prints them VERBATIM; it never
// recomputes units or percentages.
//
// The whole panel scales via a viewBox; total height is computed from content so
// nothing clips or overlaps.

import type { PanelData, NutrientRow } from '@ilaunchify/types'

// ---------------------------------------------------------------------------
// Text wrapping. SVG <text> has no auto-wrap, so we greedily word-wrap using an
// average-character-advance estimate for Helvetica. ~0.52 * fontPx is a coarse
// mean advance — fine for layout (we slightly over-reserve, never clip). Pure +
// deterministic: same input → same output, no measurement of the live DOM.
// ---------------------------------------------------------------------------

const AVG_CHAR_ADVANCE_RATIO = 0.52

/** Estimated rendered width of a string at `fontPx` in Helvetica. */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * AVG_CHAR_ADVANCE_RATIO
}

/**
 * Greedily word-wrap `text` so each line fits within `maxWidthPx` at `fontPx`.
 * Words are never split mid-word: a single word wider than the budget gets its
 * own line (it will visually overflow rather than break). Always returns at
 * least one line (an empty string for empty input).
 */
export function wrapSvgText(text: string, maxWidthPx: number, fontPx: number): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return ['']

  const words = trimmed.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`
    if (estimateTextWidth(candidate, fontPx) <= maxWidthPx || current.length === 0) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current.length > 0) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

// ---------------------------------------------------------------------------
// Layout constants. All distances in SVG user units (≈ px at viewBox scale).
// ---------------------------------------------------------------------------

const PAD = 6 // inner padding inside the outer box
const BORDER = 1.5 // outer box stroke width
const TITLE_PX = 22 // "Supplement Facts"
const TITLE_RULE = 1 // thin rule under title
const SERVING_PX = 11 // serving-size lines
const HEAVY_BAR = 7 // heavy black bar under the serving block
const HEADER_PX = 10 // "Amount / Per Serving", "% Daily / Value"
const HEADER_RULE = 1.5 // rule under the header row
const ROW_PX = 11 // body row text
const ROW_RULE = 0.75 // hairline under each body row
const FOOTER_BAR = 5 // heavy bar above the footnote
const FOOTER_PX = 9 // footnote text
const OTHER_PX = 10 // "Other ingredients:" line (outside the box)

const ROW_LINE_GAP = 2 // extra vertical space added per wrapped text line
const HEADER_LINE_GAP = 1
const COL_GAP = 8 // gap between the three columns
const NUM_COL_PAD = 4 // breathing room inside a number column

// The mandatory top-level macronutrients FDA prints in BOLD on a Supplement Facts
// panel. Sub-nutrients (indent > 0) and dietary ingredients stay regular weight.
// Mirrors SUPPLEMENT_BOLD_IDS in NutritionFactsRenderer.tsx.
const SUPPLEMENT_BOLD_IDS = new Set([
  'calories',
  'totalFat',
  'cholesterol',
  'sodium',
  'totalCarbohydrate',
  'protein',
])

const INDENT_PX = [0, 10, 20] as const

function indentFor(indent: number | undefined): number {
  if (indent === 1) return INDENT_PX[1]
  if (indent === 2) return INDENT_PX[2]
  return INDENT_PX[0]
}

// ---------------------------------------------------------------------------
// Cell-string helpers. The engine pre-formats supplement cells; we print them
// verbatim, only falling back to raw fields for older / non-supplement data.
// ---------------------------------------------------------------------------

function amountCell(row: NutrientRow): string {
  if (typeof row.amount === 'string') {
    return row.unit ? `${row.amount} ${row.unit}`.trim() : row.amount
  }
  // Numeric amount (older / food-style data): join with unit if present.
  const num = Number.isInteger(row.amount) ? String(row.amount) : row.amount.toFixed(1)
  return row.unit ? `${num} ${row.unit}` : num
}

function dvCell(row: NutrientRow): string {
  if (row.dvText !== undefined) return row.dvText
  if (row.percentDailyValue !== undefined) return `${row.percentDailyValue}%`
  if (row.noDailyValue) return '†'
  return ''
}

// ---------------------------------------------------------------------------
// Renderer.
// ---------------------------------------------------------------------------

export function SupplementFactsSvg({
  data,
  otherIngredients = [],
  widthPx = 320,
}: {
  data: PanelData
  otherIngredients?: string[]
  widthPx?: number | null
}): JSX.Element {
  // viewBox width is the authoritative geometry; widthPx only sets the rendered
  // size (or fills the container when null). Geometry never depends on widthPx.
  const W = 320
  const innerLeft = PAD
  const innerRight = W - PAD
  const innerWidth = innerRight - innerLeft

  const rows = data.rows

  // --- Column sizing -------------------------------------------------------
  // Right two columns ("Amount Per Serving", "% Daily Value") size to the widest
  // of their two-line header and their content. The name column absorbs the rest.
  const amountHeaderLines = ['Amount', 'Per Serving']
  const dvHeaderLines = ['% Daily', 'Value']

  const widestHeader = (lines: string[]): number =>
    lines.reduce((m, l) => Math.max(m, estimateTextWidth(l, HEADER_PX)), 0)

  let amountColW = widestHeader(amountHeaderLines)
  let dvColW = widestHeader(dvHeaderLines)
  for (const row of rows) {
    amountColW = Math.max(amountColW, estimateTextWidth(amountCell(row), ROW_PX))
    dvColW = Math.max(dvColW, estimateTextWidth(dvCell(row), ROW_PX))
  }
  amountColW = Math.ceil(amountColW) + NUM_COL_PAD
  dvColW = Math.ceil(dvColW) + NUM_COL_PAD

  // Right edges of the two number columns (right-aligned text anchors here).
  const dvRightX = innerRight
  const amountRightX = dvRightX - dvColW - COL_GAP

  // Name column runs from innerLeft to the left edge of the amount column.
  const amountLeftX = amountRightX - amountColW
  const nameColRight = amountLeftX - COL_GAP
  const nameColMaxWidth = Math.max(20, nameColRight - innerLeft)

  // Header column centers (for centered two-line headers).
  const amountCenterX = amountRightX - amountColW / 2
  const dvCenterX = dvRightX - dvColW / 2

  // --- Vertical layout: walk top→bottom accumulating y, building elements ---
  const els: JSX.Element[] = []
  let y = PAD

  // Title
  y += TITLE_PX
  els.push(
    <text
      key="title"
      x={innerLeft}
      y={y}
      fontFamily="Helvetica, Arial, sans-serif"
      fontSize={TITLE_PX}
      fontWeight={700}
      fill="#000"
    >
      Supplement Facts
    </text>,
  )
  y += 4
  els.push(
    <line
      key="title-rule"
      x1={innerLeft}
      y1={y}
      x2={innerRight}
      y2={y}
      stroke="#000"
      strokeWidth={TITLE_RULE}
    />,
  )

  // Serving block
  y += 4 + SERVING_PX
  els.push(
    <text
      key="serving-size"
      x={innerLeft}
      y={y}
      fontFamily="Helvetica, Arial, sans-serif"
      fontSize={SERVING_PX}
      fill="#000"
    >
      {`Serving Size ${data.servingSize}`}
    </text>,
  )
  y += SERVING_PX + 2
  els.push(
    <text
      key="servings-per"
      x={innerLeft}
      y={y}
      fontFamily="Helvetica, Arial, sans-serif"
      fontSize={SERVING_PX}
      fill="#000"
    >
      {`Servings Per Container ${data.servingsPerContainer}`}
    </text>,
  )
  // Heavy bar under serving block
  y += 4
  els.push(
    <rect
      key="serving-bar"
      x={innerLeft}
      y={y}
      width={innerWidth}
      height={HEAVY_BAR}
      fill="#000"
    />,
  )
  y += HEAVY_BAR

  // Header row: blank name col + two-line centered headers.
  y += 4
  const headerTextTop = y + HEADER_PX
  amountHeaderLines.forEach((line, i) => {
    els.push(
      <text
        key={`amount-h-${i}`}
        x={amountCenterX}
        y={headerTextTop + i * (HEADER_PX + HEADER_LINE_GAP)}
        fontFamily="Helvetica, Arial, sans-serif"
        fontSize={HEADER_PX}
        fontWeight={700}
        fill="#000"
        textAnchor="middle"
      >
        {line}
      </text>,
    )
  })
  dvHeaderLines.forEach((line, i) => {
    els.push(
      <text
        key={`dv-h-${i}`}
        x={dvCenterX}
        y={headerTextTop + i * (HEADER_PX + HEADER_LINE_GAP)}
        fontFamily="Helvetica, Arial, sans-serif"
        fontSize={HEADER_PX}
        fontWeight={700}
        fill="#000"
        textAnchor="middle"
      >
        {line}
      </text>,
    )
  })
  y = headerTextTop + (2 - 1) * (HEADER_PX + HEADER_LINE_GAP) + 4
  els.push(
    <line
      key="header-rule"
      x1={innerLeft}
      y1={y}
      x2={innerRight}
      y2={y}
      stroke="#000"
      strokeWidth={HEADER_RULE}
    />,
  )

  // Body rows. Name wraps; amount + dvText are single-line right-aligned.
  rows.forEach((row, ri) => {
    const indent = indentFor(row.indent)
    const nameX = innerLeft + indent
    const nameMax = nameColMaxWidth - indent
    const isBold = SUPPLEMENT_BOLD_IDS.has(row.id)
    const nameLines = wrapSvgText(row.label, nameMax, ROW_PX)
    const lineCount = Math.max(1, nameLines.length)

    const rowTop = y
    const firstBaseline = rowTop + 3 + ROW_PX

    nameLines.forEach((line, li) => {
      els.push(
        <text
          key={`name-${ri}-${li}`}
          x={nameX}
          y={firstBaseline + li * (ROW_PX + ROW_LINE_GAP)}
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize={ROW_PX}
          fontWeight={isBold ? 700 : 400}
          fill="#000"
        >
          {line}
        </text>,
      )
    })

    // Amount + %DV align to the first baseline, right-anchored.
    const amount = amountCell(row)
    if (amount.length > 0) {
      els.push(
        <text
          key={`amount-${ri}`}
          x={amountRightX}
          y={firstBaseline}
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize={ROW_PX}
          fontWeight={isBold ? 700 : 400}
          fill="#000"
          textAnchor="end"
        >
          {amount}
        </text>,
      )
    }
    const dv = dvCell(row)
    if (dv.length > 0) {
      els.push(
        <text
          key={`dv-${ri}`}
          x={dvRightX}
          y={firstBaseline}
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize={ROW_PX}
          fontWeight={isBold ? 700 : 400}
          fill="#000"
          textAnchor="end"
        >
          {dv}
        </text>,
      )
    }

    // Advance past the tallest content in this row, then a hairline rule.
    y = firstBaseline + (lineCount - 1) * (ROW_PX + ROW_LINE_GAP) + 4
    els.push(
      <line
        key={`row-rule-${ri}`}
        x1={innerLeft}
        y1={y}
        x2={innerRight}
        y2={y}
        stroke="#000"
        strokeWidth={ROW_RULE}
      />,
    )
  })

  // Footnote: heavy bar + wrapped requiredFooter. Omitted entirely when empty.
  const footer = data.requiredFooter
  if (footer && footer.trim().length > 0) {
    y += 4
    els.push(
      <rect
        key="footer-bar"
        x={innerLeft}
        y={y}
        width={innerWidth}
        height={FOOTER_BAR}
        fill="#000"
      />,
    )
    y += FOOTER_BAR + 4
    const footerLines = wrapSvgText(footer, innerWidth, FOOTER_PX)
    footerLines.forEach((line, fi) => {
      const baseline = y + FOOTER_PX + fi * (FOOTER_PX + ROW_LINE_GAP)
      els.push(
        <text
          key={`footer-${fi}`}
          x={innerLeft}
          y={baseline}
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize={FOOTER_PX}
          fill="#000"
        >
          {line}
        </text>,
      )
    })
    y += FOOTER_PX + (footerLines.length - 1) * (FOOTER_PX + ROW_LINE_GAP)
  }

  // Bottom inner pad, then the outer box height closes here.
  y += PAD
  const boxBottom = y

  // Outer box drawn AROUND the content. Stroke is centered on the path, so the
  // visible border sits half-inside the viewBox edge — inset by BORDER/2.
  const boxEl = (
    <rect
      key="outer-box"
      x={BORDER / 2}
      y={BORDER / 2}
      width={W - BORDER}
      height={boxBottom - BORDER}
      fill="#fff"
      stroke="#000"
      strokeWidth={BORDER}
    />
  )

  // "Other ingredients:" line — rendered BELOW / OUTSIDE the box.
  const otherEls: JSX.Element[] = []
  let totalHeight = boxBottom
  const clean = otherIngredients.map((s) => s.trim()).filter((s) => s.length > 0)
  if (clean.length > 0) {
    const text = `Other ingredients: ${clean.join(', ')}.`
    const otherLines = wrapSvgText(text, W, OTHER_PX)
    let oy = boxBottom + 6
    otherLines.forEach((line, oi) => {
      const baseline = oy + OTHER_PX + oi * (OTHER_PX + ROW_LINE_GAP)
      otherEls.push(
        <text
          key={`other-${oi}`}
          x={0}
          y={baseline}
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize={OTHER_PX}
          fill="#000"
        >
          {line}
        </text>,
      )
    })
    oy += OTHER_PX + (otherLines.length - 1) * (OTHER_PX + ROW_LINE_GAP) + 2
    totalHeight = oy
  }

  const widthAttr: number | string = widthPx == null ? '100%' : widthPx

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${Math.ceil(totalHeight)}`}
      width={widthAttr}
      height={widthPx == null ? undefined : (widthPx * totalHeight) / W}
      role="img"
      aria-label="Supplement Facts panel"
      preserveAspectRatio="xMinYMin meet"
    >
      {boxEl}
      {els}
      {otherEls}
    </svg>
  )
}
