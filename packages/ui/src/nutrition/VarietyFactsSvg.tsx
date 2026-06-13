// Print-grade, CSS-immune SVG renderer for the FDA aggregate ("multi-column")
// Nutrition Facts panel used on variety / assorted multi-unit packages — one
// numeric column per product (flavor), sharing one column of nutrient names.
// 21 CFR 101.9(d)(13) (aggregate display of two or more foods in one package).
//
// Same discipline as NutritionFactsSvg: NO Tailwind / className / inherited CSS /
// <foreignObject>. Every glyph is a positioned <text> with an explicit font-size;
// every rule is an explicit <rect>/<line> with a literal stroke width. The panel
// is a LEGAL artifact and must render identically regardless of host stylesheet.
//
// It consumes an array of STANDARD PanelData (one per flavor, produced by the
// same @ilaunchify/nutrition `toPanelData`). Rows are matched across columns by
// id, using the first column's row ORDER as canonical. Calories renders as one
// large number per column; each body row shows that column's amount + %DV.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import { wrapSvgText, estimateTextWidth } from './SupplementFactsSvg'

const FONT = 'Helvetica, Arial, sans-serif'

const PAD = 6
const BORDER = 1.5
const TITLE_PX = 26
const TITLE_RULE = 0.75
const SERVINGS_PX = 11
const SERVING_LABEL_PX = 13
const HEAVY_BAR = 7
const COL_HEADER_PX = 11 // flavor-name column headers
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
const DV_SUBCOL_GAP = 4
const NUM_COL_PAD = 5
const NAME_COL_W = 150 // nutrient-name column budget
const MIN_COL_W = 54

const BOLD_IDS = new Set(['calories', 'totalFat', 'cholesterol', 'sodium', 'totalCarbohydrate', 'protein'])
const VITAMIN_IDS = new Set(['vitaminD', 'calcium', 'iron', 'potassium'])
const INDENT_PX = [0, 10, 20] as const

function indentFor(indent: number | undefined): number {
  if (indent === 1) return INDENT_PX[1]
  if (indent === 2) return INDENT_PX[2]
  return INDENT_PX[0]
}

function amountText(row: NutrientRow | undefined): string {
  if (!row) return ''
  if (typeof row.amount === 'string') return row.unit ? `${row.amount}${row.unit}` : row.amount
  const num = Number.isInteger(row.amount) ? String(row.amount) : row.amount.toFixed(1)
  return row.unit ? `${num}${row.unit}` : num
}

function dvText(row: NutrientRow | undefined): string {
  if (!row) return ''
  if (row.dvText !== undefined) return row.dvText
  if (row.percentDailyValue !== undefined) return `${row.percentDailyValue}%`
  return ''
}

function caloriesNum(row: NutrientRow | undefined): string {
  if (!row) return '0'
  if (typeof row.amount === 'string') return row.amount
  return String(Math.round(row.amount))
}

export interface VarietyColumn {
  label: string
  data: PanelData
}

export function VarietyFactsSvg({
  columns,
  widthPx = null,
}: {
  columns: VarietyColumn[]
  widthPx?: number | null
}): JSX.Element {
  const cols = columns.filter((c) => c.data && c.data.rows.length > 0)
  if (cols.length === 0) {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width={widthPx ?? '100%'} />
  }

  // Canonical row order = first column's rows; map each column's rows by id.
  const canonical = cols[0]!.data
  const byId: Array<Map<string, NutrientRow>> = cols.map((c) => {
    const m = new Map<string, NutrientRow>()
    for (const r of c.data.rows) m.set(r.id, r)
    return m
  })

  const bodyRows = canonical.rows.filter((r) => r.id !== 'calories')

  // --- Column widths -------------------------------------------------------
  function colContentWidth(ci: number): number {
    let amountW = 0
    let pctW = 0
    for (const r of bodyRows) {
      const row = byId[ci]!.get(r.id)
      amountW = Math.max(amountW, estimateTextWidth(amountText(row), ROW_PX))
      pctW = Math.max(pctW, estimateTextWidth(dvText(row), ROW_PX))
    }
    return amountW + DV_SUBCOL_GAP + pctW
  }
  const colW = cols.map((_, ci) => Math.ceil(Math.max(colContentWidth(ci), MIN_COL_W)) + NUM_COL_PAD * 2)

  // Right edges (right-aligned cell anchors), left→right.
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

  const els: JSX.Element[] = []
  let y = PAD

  // Title.
  const titlePx = Math.min(TITLE_PX, Math.max(18, Math.floor((NAME_COL_W * 1.6) / (0.62 * 'Nutrition Facts'.length))))
  y += titlePx
  els.push(
    <text key="title" x={innerLeft} y={y} fontFamily={FONT} fontSize={titlePx} fontWeight={800} fill="#000">Nutrition Facts</text>,
  )
  y += 3
  els.push(<line key="title-rule" x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={TITLE_RULE} />)

  // Serving block (uniform across the variety pack — taken from the first column;
  // if columns differ, each flavor still prints its own single-column label).
  if (canonical.servingsPerContainer && canonical.servingsPerContainer.trim().length > 0) {
    y += 3 + SERVINGS_PX
    els.push(
      <text key="servings" x={innerLeft} y={y} fontFamily={FONT} fontSize={SERVINGS_PX} fill="#000">
        {`${canonical.servingsPerContainer} servings per container`}
      </text>,
    )
  }
  y += 3 + SERVING_LABEL_PX
  els.push(
    <text key="serving-label" x={innerLeft} y={y} fontFamily={FONT} fontSize={SERVING_LABEL_PX} fontWeight={700} fill="#000">Serving size</text>,
  )
  els.push(
    <text key="serving-size" x={innerLeft + NAME_COL_W} y={y} fontFamily={FONT} fontSize={SERVING_LABEL_PX} fontWeight={700} fill="#000" textAnchor="end">
      {canonical.servingSize}
    </text>,
  )

  y += 4
  els.push(<rect key="serving-bar" x={innerLeft} y={y} width={innerWidth} height={HEAVY_BAR} fill="#000" />)
  y += HEAVY_BAR

  // Column headers (flavor names), centered over each value column; wrap to col.
  y += 3
  let headerLines = 1
  cols.forEach((c, ci) => {
    const lines = wrapSvgText(c.label || `Flavor ${ci + 1}`, colW[ci]! + COL_GAP, COL_HEADER_PX)
    headerLines = Math.max(headerLines, lines.length)
    lines.forEach((line, li) => {
      els.push(
        <text key={`hdr-${ci}-${li}`} x={colCenter[ci]!} y={y + COL_HEADER_PX + li * (COL_HEADER_PX + ROW_LINE_GAP)} fontFamily={FONT} fontSize={COL_HEADER_PX} fontWeight={700} fill="#000" textAnchor="middle">
          {line}
        </text>,
      )
    })
  })
  y += COL_HEADER_PX + (headerLines - 1) * (COL_HEADER_PX + ROW_LINE_GAP) + 3

  // "Amount per serving / % DV" caption on the name side.
  y += ROW_PX
  els.push(
    <text key="amt-caption" x={innerLeft} y={y} fontFamily={FONT} fontSize={ROW_PX} fontWeight={700} fill="#000">Amount per serving · % DV</text>,
  )
  y += 2

  // Calories: word on the name side (baseline-aligned to the big numbers), one
  // big number per column. NO bar above (d)(5); bar BELOW (d)(6).
  y += 2
  const calBaseline = y + CAL_NUM_PX
  els.push(
    <text key="cal-label" x={innerLeft} y={calBaseline} fontFamily={FONT} fontSize={CAL_LABEL_PX} fontWeight={700} fill="#000">Calories</text>,
  )
  cols.forEach((_, ci) => {
    els.push(
      <text key={`cal-${ci}`} x={colCenter[ci]!} y={calBaseline} fontFamily={FONT} fontSize={CAL_NUM_PX} fontWeight={800} fill="#000" textAnchor="middle">
        {caloriesNum(byId[ci]!.get('calories'))}
      </text>,
    )
  })
  y = calBaseline + 4
  els.push(<rect key="cal-rule" x={innerLeft} y={y} width={innerWidth} height={CALORIES_RULE} fill="#000" />)
  y += CALORIES_RULE

  // Body rows.
  let prevVitamin = false
  bodyRows.forEach((row, ri) => {
    const isVitamin = VITAMIN_IDS.has(row.id)
    if (isVitamin && !prevVitamin) {
      els.push(<line key={`vit-${ri}`} x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={VITAMIN_RULE} />)
    }
    prevVitamin = isVitamin

    const indent = indentFor(row.indent)
    const nameX = innerLeft + indent
    const isBold = BOLD_IDS.has(row.id)
    const nameLines = wrapSvgText(row.label, NAME_COL_W - indent, ROW_PX)
    const lineCount = Math.max(1, nameLines.length)
    const firstBaseline = y + 3 + ROW_PX

    nameLines.forEach((line, li) => {
      els.push(
        <text key={`name-${ri}-${li}`} x={nameX} y={firstBaseline + li * (ROW_PX + ROW_LINE_GAP)} fontFamily={FONT} fontSize={ROW_PX} fontWeight={isBold ? 700 : 400} fill="#000">
          {line}
        </text>,
      )
    })

    // Per-column amount (left) + %DV (right edge). %DV always bold (d)(iv);
    // amount always regular.
    cols.forEach((_, ci) => {
      const r = byId[ci]!.get(row.id)
      const amt = amountText(r)
      const pct = dvText(r)
      const rightX = colRight[ci]!
      if (pct.length > 0) {
        els.push(
          <text key={`dv-${ri}-${ci}`} x={rightX} y={firstBaseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={700} fill="#000" textAnchor="end">{pct}</text>,
        )
      }
      if (amt.length > 0) {
        const amtRight = pct.length > 0 ? rightX - estimateTextWidth(pct, ROW_PX) - DV_SUBCOL_GAP : rightX
        els.push(
          <text key={`amt-${ri}-${ci}`} x={amtRight} y={firstBaseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={400} fill="#000" textAnchor="end">{amt}</text>,
        )
      }
    })

    y = firstBaseline + (lineCount - 1) * (ROW_PX + ROW_LINE_GAP) + 4
    els.push(<line key={`rule-${ri}`} x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={ROW_RULE} />)
  })

  // Footnote (shared) — use the first column's footer.
  const footer = canonical.requiredFooter
  if (footer && footer.trim().length > 0) {
    els.push(<rect key="footer-bar" x={innerLeft} y={y} width={innerWidth} height={FOOTER_BAR} fill="#000" />)
    y += FOOTER_BAR + 4
    const footerLines = wrapSvgText(footer, innerWidth, FOOTER_PX)
    footerLines.forEach((line, fi) => {
      els.push(
        <text key={`footer-${fi}`} x={innerLeft} y={y + FOOTER_PX + fi * (FOOTER_PX + ROW_LINE_GAP)} fontFamily={FONT} fontSize={FOOTER_PX} fill="#000">{line}</text>,
      )
    })
    y += FOOTER_PX + (footerLines.length - 1) * (FOOTER_PX + ROW_LINE_GAP)
  }

  y += PAD
  const boxBottom = y

  const widthAttr: number | string = widthPx == null ? '100%' : widthPx

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${Math.ceil(W)} ${Math.ceil(boxBottom)}`}
      width={widthAttr}
      height={widthPx == null ? undefined : (widthPx * boxBottom) / W}
      role="img"
      aria-label="Aggregate Nutrition Facts panel (variety pack)"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect key="outer-box" x={BORDER / 2} y={BORDER / 2} width={W - BORDER} height={boxBottom - BORDER} fill="#fff" stroke="#000" strokeWidth={BORDER} />
      {els}
    </svg>
  )
}
