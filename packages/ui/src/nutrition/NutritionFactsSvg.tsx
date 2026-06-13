// Print-grade, CSS-immune SVG renderer for the FDA Nutrition Facts panel
// (21 CFR 101.9(d), 2016 graphic format).
//
// This is a regulated LEGAL label. It must render deterministically regardless
// of the host page's stylesheet: NO Tailwind, NO className styling, NO inherited
// CSS, NO <foreignObject>. Every glyph is a positioned SVG <text> with an
// explicit font-size; every rule is an explicit <rect>/<line> with a literal
// stroke width.
//
// It consumes the SAME PanelData (format STANDARD) the HTML NutritionFactsRenderer
// uses, produced by @ilaunchify/nutrition `toPanelData`. The renderer is dumb:
// it lays out whatever rows + footer it is given. The INFANT/CHILD variants need
// NO branching here — the engine/adapter already omit rows (saturated fat, trans
// fat, cholesterol for infants) and swap the footer; this renderer simply lays
// out the rows present.
//
// DUAL-COLUMN ("per serving | per container", 21 CFR 101.9(e)) is engaged by
// passing `perContainer` (a second STANDARD PanelData with the SAME row ids/
// labels but per-container amounts/%DV) + `columnHeaders`. Rows are matched by
// id; each value cell becomes two columns.
//
// The whole panel scales via a viewBox; total height is computed from content so
// nothing clips or overlaps.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import { wrapSvgText, estimateTextWidth } from './SupplementFactsSvg'

// ---------------------------------------------------------------------------
// Layout constants. All distances in SVG user units (≈ px at viewBox scale).
// ---------------------------------------------------------------------------

// Type-size hierarchy per 21 CFR 101.9(d)(iii): the Calories NUMBER is the single
// largest element (≥22pt); "Calories" word ≥16pt bold; the "Nutrition Facts" title
// is the next-largest bold (no smaller than everything except the Calories number);
// "Serving size" ≥10pt bold; "Amount per serving" / "% Daily Value*" are SMALL
// subheadings; the nutrient list + %DV are ≥8pt. (viewBox units ≈ pt at this scale.)
const PAD = 6 // inner padding inside the outer box
const BORDER = 1.5 // outer box stroke width
const TITLE_PX = 31 // "Nutrition Facts" — dominant extra-bold header, full width
const TITLE_RULE = 0.75 // hairline under the title (d)(v)
const SERVINGS_PX = 12 // "N servings per container" line
const SERVING_LABEL_PX = 15 // "Serving size" (bold)
const HEAVY_BAR = 8 // heavy bar under the serving block (d)(4)
const AMOUNT_CAPTION_PX = 12 // "Amount per serving" subheading — clearly legible
const CALORIES_LABEL_PX = 31 // "Calories" word (large bold, bottom-aligned to the number)
const CALORIES_NUM_PX = 46 // the Calories number — the LARGEST element on the panel
const CALORIES_RULE = 4 // bar BELOW the Calories row (between Calories and %DV)
const DV_HEADER_PX = 11 // "% Daily Value*" heading — legible
const ROW_PX = 11.5 // body row text
const ROW_RULE = 0.5 // hairline between nutrient rows (d)(v)
const VITAMIN_RULE = 2.5 // bar separating the vitamins/minerals block (d)(8)
const FOOTER_BAR = 4 // bar above the footnote
const FOOTER_PX = 8 // footnote text
const COL_HEADER_PX = 9 // dual-column headers ("Per serving" / "Per container")

const ROW_LINE_GAP = 2 // extra vertical space added per wrapped text line
const COL_GAP = 6 // gap between value columns
const NUM_COL_PAD = 4 // breathing room inside a number column
const DV_SUBCOL_GAP = 4 // gap between amount and %DV within one dual column

// The mandatory top-level lines FDA prints in BOLD on the Nutrition Facts panel.
// Sub-nutrients (indent > 0) render regular weight. Calories is bold too.
const BOLD_IDS = new Set([
  'calories',
  'totalFat',
  'cholesterol',
  'sodium',
  'totalCarbohydrate',
  'protein',
])

// The vitamins/minerals block — a heavier rule precedes it.
const VITAMIN_IDS = new Set(['vitaminD', 'calcium', 'iron', 'potassium'])

const INDENT_PX = [0, 10, 20] as const

function indentFor(indent: number | undefined): number {
  if (indent === 1) return INDENT_PX[1]
  if (indent === 2) return INDENT_PX[2]
  return INDENT_PX[0]
}

// ---------------------------------------------------------------------------
// Cell-string helpers. Food rows carry a numeric `amount` + optional `unit`,
// e.g. "Total Fat 8g". %DV is an integer percent when present.
// ---------------------------------------------------------------------------

/** The amount text that trails the nutrient NAME inline (e.g. "8g", "200mg"). */
function amountText(row: NutrientRow): string {
  if (typeof row.amount === 'string') {
    return row.unit ? `${row.amount}${row.unit}` : row.amount
  }
  const num = Number.isInteger(row.amount) ? String(row.amount) : row.amount.toFixed(1)
  return row.unit ? `${num}${row.unit}` : num
}

/** The %DV cell (e.g. "10%"), or '' when no DV is established for this row. */
function dvText(row: NutrientRow): string {
  if (row.dvText !== undefined) return row.dvText
  if (row.percentDailyValue !== undefined) return `${row.percentDailyValue}%`
  return ''
}

/** Calories number as a plain integer string. */
function caloriesNum(row: NutrientRow | undefined): string {
  if (!row) return '0'
  if (typeof row.amount === 'string') return row.amount
  return String(Math.round(row.amount))
}

const FONT = 'Helvetica, Arial, sans-serif'

// ---------------------------------------------------------------------------
// Renderer.
// ---------------------------------------------------------------------------

export function NutritionFactsSvg({
  data,
  perContainer,
  columnHeaders,
  widthPx = 320,
}: {
  data: PanelData
  perContainer?: PanelData
  columnHeaders?: { primary: string; secondary: string }
  widthPx?: number | null
}): JSX.Element {
  // viewBox width is the authoritative geometry; widthPx only sets the rendered
  // size (or fills the container when null). Geometry never depends on widthPx.
  const W = 320
  const innerLeft = PAD
  const innerRight = W - PAD
  const innerWidth = innerRight - innerLeft

  const dual = perContainer != null
  const headers = columnHeaders ?? { primary: 'Per serving', secondary: 'Per container' }

  // Index the per-container rows by id so we can pair them with the primary rows.
  const containerById = new Map<string, NutrientRow>()
  if (perContainer) {
    for (const r of perContainer.rows) containerById.set(r.id, r)
  }

  // Body rows EXCLUDING the big calories row (laid out separately).
  const bodyRows = data.rows.filter((r) => r.id !== 'calories')
  const caloriesRow = data.rows.find((r) => r.id === 'calories')
  const caloriesContainerRow = dual ? containerById.get('calories') : undefined

  // --- Column sizing -------------------------------------------------------
  // SINGLE-COLUMN: one amount column inline after the name (so it's not a fixed
  // column) + a %DV column right-aligned at innerRight.
  // DUAL-COLUMN: two value columns to the right; each column holds an amount
  // sub-cell + a %DV sub-cell. Column width = max(header, widest amount+%DV).
  let dvColW = 0
  for (const row of bodyRows) {
    dvColW = Math.max(dvColW, estimateTextWidth(dvText(row), ROW_PX))
  }
  // "% Daily Value*" header sets a floor on the single-column %DV column.
  dvColW = Math.max(dvColW, estimateTextWidth('% DV', ROW_PX))
  dvColW = Math.ceil(dvColW) + NUM_COL_PAD

  // Dual-column geometry.
  function dualColWidth(headerLine: string): number {
    let amountW = 0
    let pctW = 0
    for (const row of bodyRows) {
      amountW = Math.max(amountW, estimateTextWidth(amountText(row), ROW_PX))
      const c = containerById.get(row.id)
      const primaryPct = estimateTextWidth(dvText(row), ROW_PX)
      const secondaryPct = c ? estimateTextWidth(dvText(c), ROW_PX) : 0
      pctW = Math.max(pctW, primaryPct, secondaryPct)
    }
    // Per-container amounts (different source) also feed the amount sub-cell.
    if (perContainer) {
      for (const row of perContainer.rows) {
        if (row.id === 'calories') continue
        amountW = Math.max(amountW, estimateTextWidth(amountText(row), ROW_PX))
      }
    }
    const content = amountW + DV_SUBCOL_GAP + pctW
    const header = estimateTextWidth(headerLine, COL_HEADER_PX)
    return Math.ceil(Math.max(content, header)) + NUM_COL_PAD
  }

  // Right edges of value columns (right-aligned anchors).
  const secondaryColW = dual ? dualColWidth(headers.secondary) : 0
  const primaryColW = dual ? dualColWidth(headers.primary) : 0

  const secondaryRightX = innerRight
  const primaryRightX = dual ? secondaryRightX - secondaryColW - COL_GAP : innerRight
  // %DV right edge for single-column mode.
  const dvRightX = innerRight

  // Name-column budget. DUAL: stop before the primary value column. SINGLE:
  // name + inline amount share the left region; reserve the %DV column at the
  // right edge.
  const nameColMaxWidth = dual
    ? Math.max(40, primaryRightX - primaryColW - COL_GAP - innerLeft)
    : Math.max(40, dvRightX - dvColW - COL_GAP - innerLeft)

  // Column centers (for centered dual-column headers).
  const primaryCenterX = primaryRightX - primaryColW / 2
  const secondaryCenterX = secondaryRightX - secondaryColW / 2

  // --- Vertical layout: walk top→bottom accumulating y, building elements ---
  const els: JSX.Element[] = []
  let y = PAD

  // Title — set the FULL width of the panel (21 CFR 101.9(d)(2)). Size it up to
  // fill the inner width (bold advance ≈ 0.62·em), capped at TITLE_PX, so it is
  // always the dominant header regardless of panel width.
  const titlePx = Math.min(
    TITLE_PX,
    Math.max(20, Math.floor((innerWidth * 0.98) / (0.62 * 'Nutrition Facts'.length))),
  )
  y += titlePx
  els.push(
    <text key="title" x={innerLeft} y={y} fontFamily={FONT} fontSize={titlePx} fontWeight={800} fill="#000">
      Nutrition Facts
    </text>,
  )
  y += 3
  els.push(
    <line key="title-rule" x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={TITLE_RULE} />,
  )

  // Serving block — FDA order: "N servings per container" then bold "Serving size".
  if (data.servingsPerContainer && data.servingsPerContainer.trim().length > 0) {
    y += 3 + SERVINGS_PX
    els.push(
      <text key="servings-per" x={innerLeft} y={y} fontFamily={FONT} fontSize={SERVINGS_PX} fill="#000">
        {`${data.servingsPerContainer} servings per container`}
      </text>,
    )
  }
  y += 3 + SERVING_LABEL_PX
  els.push(
    <text key="serving-label" x={innerLeft} y={y} fontFamily={FONT} fontSize={SERVING_LABEL_PX} fontWeight={700} fill="#000">
      Serving size
    </text>,
  )
  els.push(
    <text key="serving-size" x={innerRight} y={y} fontFamily={FONT} fontSize={SERVING_LABEL_PX} fontWeight={700} fill="#000" textAnchor="end">
      {data.servingSize}
    </text>,
  )

  // Heavy bar under serving block.
  y += 4
  els.push(<rect key="serving-bar" x={innerLeft} y={y} width={innerWidth} height={HEAVY_BAR} fill="#000" />)
  y += HEAVY_BAR

  // --- Amount-per-serving caption OR dual-column headers -------------------
  if (dual) {
    // Centered bold headers over each value column.
    y += 3 + COL_HEADER_PX
    els.push(
      <text key="hdr-primary" x={primaryCenterX} y={y} fontFamily={FONT} fontSize={COL_HEADER_PX} fontWeight={700} fill="#000" textAnchor="middle">
        {headers.primary}
      </text>,
    )
    els.push(
      <text key="hdr-secondary" x={secondaryCenterX} y={y} fontFamily={FONT} fontSize={COL_HEADER_PX} fontWeight={700} fill="#000" textAnchor="middle">
        {headers.secondary}
      </text>,
    )
    y += 3
  } else {
    y += 3 + AMOUNT_CAPTION_PX
    els.push(
      <text key="amount-caption" x={innerLeft} y={y} fontFamily={FONT} fontSize={AMOUNT_CAPTION_PX} fontWeight={700} fill="#000">
        Amount per serving
      </text>,
    )
    y += 2
  }

  // --- Big Calories row. Per 21 CFR 101.9(d)(5) "Calories" follows the "Amount
  // per serving" subheading directly — NO bar above it; the bar sits BELOW,
  // between Calories and the "% Daily Value" heading (d)(6). -----------------
  y += 2
  const calBaseline = y + CALORIES_NUM_PX
  // "Calories" word shares the NUMBER's baseline so both sit on the same bottom
  // line (FDA graphic). Bottom-aligned, large bold.
  els.push(
    <text key="cal-label" x={innerLeft} y={calBaseline} fontFamily={FONT} fontSize={CALORIES_LABEL_PX} fontWeight={700} fill="#000">
      Calories
    </text>,
  )
  if (dual) {
    // Two big calorie numbers, one centered per value column.
    els.push(
      <text key="cal-num-primary" x={primaryCenterX} y={calBaseline} fontFamily={FONT} fontSize={CALORIES_NUM_PX} fontWeight={800} fill="#000" textAnchor="middle">
        {caloriesNum(caloriesRow)}
      </text>,
    )
    els.push(
      <text key="cal-num-secondary" x={secondaryCenterX} y={calBaseline} fontFamily={FONT} fontSize={CALORIES_NUM_PX} fontWeight={800} fill="#000" textAnchor="middle">
        {caloriesNum(caloriesContainerRow)}
      </text>,
    )
  } else {
    els.push(
      <text key="cal-num" x={innerRight} y={calBaseline} fontFamily={FONT} fontSize={CALORIES_NUM_PX} fontWeight={800} fill="#000" textAnchor="end">
        {caloriesNum(caloriesRow)}
      </text>,
    )
  }
  y = calBaseline + 4
  els.push(<rect key="cal-rule-bottom" x={innerLeft} y={y} width={innerWidth} height={CALORIES_RULE} fill="#000" />)
  y += CALORIES_RULE

  // --- "% Daily Value*" header (single-column only) ------------------------
  if (!dual) {
    y += 2 + DV_HEADER_PX
    els.push(
      <text key="dv-header" x={dvRightX} y={y} fontFamily={FONT} fontSize={DV_HEADER_PX} fontWeight={700} fill="#000" textAnchor="end">
        % Daily Value*
      </text>,
    )
    y += 2
    els.push(<line key="dv-header-rule" x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={ROW_RULE} />)
  }

  // --- Body rows -----------------------------------------------------------
  let prevVitamin = false
  bodyRows.forEach((row, ri) => {
    const isVitamin = VITAMIN_IDS.has(row.id)
    // Heavier rule entering the vitamins block (once).
    if (isVitamin && !prevVitamin) {
      els.push(<line key={`vit-rule-${ri}`} x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={VITAMIN_RULE} />)
    }
    prevVitamin = isVitamin

    const indent = indentFor(row.indent)
    const nameX = innerLeft + indent
    const isBold = BOLD_IDS.has(row.id)
    const amount = amountText(row)

    // Wrap the NAME only (the inline amount is placed separately so it can stay
    // regular weight even when the name is bold).
    const nameMax = nameColMaxWidth - indent
    const nameLines = wrapSvgText(row.label, nameMax, ROW_PX)
    const lineCount = Math.max(1, nameLines.length)

    const rowTop = y
    const firstBaseline = rowTop + 3 + ROW_PX

    // Nutrient NAME — bold only for the six non-indented mandatory names
    // (Calories/Total Fat/Cholesterol/Sodium/Total Carbohydrate/Protein), per
    // 21 CFR 101.9(d)(iv). Sub-nutrients + vitamins/minerals stay regular.
    nameLines.forEach((line, li) => {
      els.push(
        <text
          key={`name-${ri}-${li}`}
          x={nameX}
          y={firstBaseline + li * (ROW_PX + ROW_LINE_GAP)}
          fontFamily={FONT}
          fontSize={ROW_PX}
          fontWeight={isBold ? 700 : 400}
          fill="#000"
        >
          {line}
        </text>,
      )
    })

    // Single-column: the gram/mg amount prints INLINE right after the name, but
    // ALWAYS regular weight — (d)(iv) forbids highlighting anything but the name.
    if (!dual && amount.length > 0) {
      const lastLine = nameLines[nameLines.length - 1] ?? ''
      const lastBaseline = firstBaseline + (lineCount - 1) * (ROW_PX + ROW_LINE_GAP)
      els.push(
        <text
          key={`amt-${ri}`}
          x={nameX + estimateTextWidth(lastLine, ROW_PX) + 4}
          y={lastBaseline}
          fontFamily={FONT}
          fontSize={ROW_PX}
          fontWeight={400}
          fill="#000"
        >
          {amount}
        </text>,
      )
    }

    if (dual) {
      const containerRow = containerById.get(row.id)
      // Primary column: amount (left of its sub-cell) + %DV (right edge).
      const primAmount = amount
      const primDv = dvText(row)
      const secAmount = containerRow ? amountText(containerRow) : ''
      const secDv = containerRow ? dvText(containerRow) : ''
      const pushCell = (rightX: number, amt: string, pct: string, key: string) => {
        // %DV right-aligned at the column's right edge — always bold (d)(iv).
        if (pct.length > 0) {
          els.push(
            <text key={`${key}-dv`} x={rightX} y={firstBaseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={700} fill="#000" textAnchor="end">
              {pct}
            </text>,
          )
        }
        // amount right-aligned to the LEFT of the %DV sub-cell — always regular.
        if (amt.length > 0) {
          const amtRight = pct.length > 0 ? rightX - estimateTextWidth(pct, ROW_PX) - DV_SUBCOL_GAP : rightX
          els.push(
            <text key={`${key}-amt`} x={amtRight} y={firstBaseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={400} fill="#000" textAnchor="end">
              {amt}
            </text>,
          )
        }
      }
      pushCell(primaryRightX, primAmount, primDv, `prim-${ri}`)
      pushCell(secondaryRightX, secAmount, secDv, `sec-${ri}`)
    } else {
      // Single-column: %DV right-aligned at innerRight. Per (d)(iv) the %DV
      // percentages are ALWAYS bold — including the vitamins/minerals rows.
      const dv = dvText(row)
      if (dv.length > 0) {
        els.push(
          <text key={`dv-${ri}`} x={dvRightX} y={firstBaseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={700} fill="#000" textAnchor="end">
            {dv}
          </text>,
        )
      }
    }

    // Advance past the tallest content, then a hairline rule.
    y = firstBaseline + (lineCount - 1) * (ROW_PX + ROW_LINE_GAP) + 4
    els.push(<line key={`row-rule-${ri}`} x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={ROW_RULE} />)
  })

  // --- Footnote ------------------------------------------------------------
  const footer = data.requiredFooter
  if (footer && footer.trim().length > 0) {
    els.push(<rect key="footer-bar" x={innerLeft} y={y} width={innerWidth} height={FOOTER_BAR} fill="#000" />)
    y += FOOTER_BAR + 4
    const footerLines = wrapSvgText(footer, innerWidth, FOOTER_PX)
    footerLines.forEach((line, fi) => {
      const baseline = y + FOOTER_PX + fi * (FOOTER_PX + ROW_LINE_GAP)
      els.push(
        <text key={`footer-${fi}`} x={innerLeft} y={baseline} fontFamily={FONT} fontSize={FOOTER_PX} fill="#000">
          {line}
        </text>,
      )
    })
    y += FOOTER_PX + (footerLines.length - 1) * (FOOTER_PX + ROW_LINE_GAP)
  }

  // Bottom inner pad, then the outer box height closes here.
  y += PAD
  const boxBottom = y

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

  const totalHeight = boxBottom
  const widthAttr: number | string = widthPx == null ? '100%' : widthPx

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${Math.ceil(totalHeight)}`}
      width={widthAttr}
      height={widthPx == null ? undefined : (widthPx * totalHeight) / W}
      role="img"
      aria-label="Nutrition Facts panel"
      preserveAspectRatio="xMinYMin meet"
    >
      {boxEl}
      {els}
    </svg>
  )
}
