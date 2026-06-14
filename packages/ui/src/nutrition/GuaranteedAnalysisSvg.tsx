// Print-grade, CSS-immune SVG renderer for the pet-food AAFCO label block:
// Guaranteed Analysis table + ingredient statement + nutritional-adequacy
// statement + feeding directions. (AAFCO Model Pet Food Regulations; the
// Guaranteed Analysis is the formal min/max table.)
//
// Same discipline as the human-food renderers: NO Tailwind / className /
// inherited CSS / <foreignObject>. Every glyph is a positioned <text> with an
// explicit font-size; every rule is an explicit <rect>/<line>. Deterministic:
// height is computed from content so nothing clips. Reuses the shared SVG text
// helpers (wrapSvgText/estimateTextWidth) so wrapping matches the other panels.

import { wrapSvgText } from './SupplementFactsSvg'

const FONT = 'Helvetica, Arial, sans-serif'

const W = 320
const PAD = 8
const BORDER = 1.5
const TITLE_PX = 15 // "GUARANTEED ANALYSIS"
const TITLE_RULE = 1
const ROW_PX = 12 // GA table rows
const ROW_RULE = 0.5
const SECTION_BAR = 3 // heavy rule under the GA table
const LABEL_PX = 11 // "INGREDIENTS:" / "FEEDING DIRECTIONS:" prefixes
const BODY_PX = 10.5 // ingredient list / statement / directions
const NETWT_PX = 12
const LINE_GAP = 2
const NUM_PAD = 6

export interface GaRow { label: string; value: string }

export function GuaranteedAnalysisSvg({
  gaRows,
  ingredients,
  adequacyStatement,
  feedingDirections,
  netContents,
  widthPx = 300,
}: {
  gaRows: GaRow[]
  ingredients?: string
  adequacyStatement?: string
  feedingDirections?: string
  netContents?: string
  widthPx?: number | null
}): JSX.Element {
  const innerLeft = PAD
  const innerRight = W - PAD
  const innerWidth = innerRight - innerLeft

  const els: JSX.Element[] = []
  let y = PAD

  // Title.
  y += TITLE_PX
  els.push(
    <text key="title" x={innerLeft} y={y} fontFamily={FONT} fontSize={TITLE_PX} fontWeight={800} fill="#000">
      GUARANTEED ANALYSIS
    </text>,
  )
  y += 3
  els.push(<line key="title-rule" x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={TITLE_RULE} />)

  // GA rows — guarantee name left, value right-aligned. Hairline between.
  gaRows.forEach((g, i) => {
    const baseline = y + 4 + ROW_PX
    els.push(
      <text key={`ga-l-${i}`} x={innerLeft} y={baseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={400} fill="#000">
        {g.label}
      </text>,
    )
    els.push(
      <text key={`ga-v-${i}`} x={innerRight} y={baseline} fontFamily={FONT} fontSize={ROW_PX} fontWeight={700} fill="#000" textAnchor="end">
        {g.value}
      </text>,
    )
    y = baseline + 4
    if (i < gaRows.length - 1) {
      els.push(<line key={`ga-rule-${i}`} x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={ROW_RULE} />)
    }
  })

  // Heavy rule closing the GA table.
  els.push(<rect key="ga-bar" x={innerLeft} y={y} width={innerWidth} height={SECTION_BAR} fill="#000" />)
  y += SECTION_BAR

  // A "PREFIX rest" block (prefix bold, rest regular), wrapped to inner width.
  const pushBlock = (key: string, prefix: string, rest: string, restPx: number) => {
    if (!rest || rest.trim().length === 0) return
    y += 7
    const full = `${prefix} ${rest.trim()}`
    const lines = wrapSvgText(full, innerWidth, restPx)
    lines.forEach((line, li) => {
      const baseline = y + restPx + li * (restPx + LINE_GAP)
      if (li === 0) {
        const remainder = line.slice(prefix.length).replace(/^\s+/, '')
        els.push(
          <text key={`${key}-0`} x={innerLeft} y={baseline} fontFamily={FONT} fontSize={restPx} fill="#000">
            <tspan fontWeight={700} fontSize={LABEL_PX}>{prefix}</tspan>
            {remainder.length > 0 ? <tspan dx={5} fontWeight={400}>{remainder}</tspan> : null}
          </text>,
        )
      } else {
        els.push(
          <text key={`${key}-${li}`} x={innerLeft} y={baseline} fontFamily={FONT} fontSize={restPx} fontWeight={400} fill="#000">
            {line}
          </text>,
        )
      }
    })
    y += restPx + (lines.length - 1) * (restPx + LINE_GAP) + 1
  }

  // A plain wrapped paragraph (no bold prefix) — used for the adequacy statement.
  const pushParagraph = (key: string, text: string, px: number) => {
    if (!text || text.trim().length === 0) return
    y += 7
    const lines = wrapSvgText(text.trim(), innerWidth, px)
    lines.forEach((line, li) => {
      els.push(
        <text key={`${key}-${li}`} x={innerLeft} y={y + px + li * (px + LINE_GAP)} fontFamily={FONT} fontSize={px} fontWeight={400} fill="#000">
          {line}
        </text>,
      )
    })
    y += px + (lines.length - 1) * (px + LINE_GAP) + 1
  }

  if (ingredients) pushBlock('ingredients', 'INGREDIENTS:', ingredients, BODY_PX)
  if (adequacyStatement) pushParagraph('adequacy', adequacyStatement, BODY_PX)
  if (feedingDirections) pushBlock('feeding', 'FEEDING DIRECTIONS:', feedingDirections, BODY_PX)

  if (netContents && netContents.trim().length > 0) {
    y += 8
    els.push(
      <text key="netwt" x={innerLeft} y={y + NETWT_PX} fontFamily={FONT} fontSize={NETWT_PX} fontWeight={700} fill="#000">
        {netContents.trim()}
      </text>,
    )
    y += NETWT_PX
  }

  y += PAD
  const boxBottom = y
  const widthAttr: number | string = widthPx == null ? '100%' : widthPx

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${Math.ceil(boxBottom)}`}
      width={widthAttr}
      height={widthPx == null ? undefined : (widthPx * boxBottom) / W}
      role="img"
      aria-label="Guaranteed Analysis (pet food AAFCO label)"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x={BORDER / 2} y={BORDER / 2} width={W - BORDER} height={boxBottom - BORDER} fill="#fff" stroke="#000" strokeWidth={BORDER} />
      {els}
    </svg>
  )
}
