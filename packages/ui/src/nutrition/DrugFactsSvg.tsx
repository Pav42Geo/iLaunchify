// Print-grade, CSS-immune SVG renderer for the OTC Drug Facts panel
// (21 CFR 201.66). Same discipline as the food/supplement/pet/cosmetic SVG
// renderers: NO Tailwind / className / inherited CSS / <foreignObject>, native
// <tspan> spacing, deterministic height from content so it prints identically
// regardless of the host page's styles.
//
// Structure per 201.66(c)-(d): "Drug Facts" title under a heavy bar; an
// Active ingredient ⟷ Purpose two-column block; then the ordered headings
// Uses · Warnings · Directions · Other information · Inactive ingredients ·
// Questions, each opened by a hairline rule. Warning sub-headers are bold and
// flush-left; uses / other-information are bulleted.

import { wrapSvgText } from './SupplementFactsSvg'
import type { DrugFactsData } from '../canvas/drugFactsPanel'

const FONT = 'Helvetica, Arial, sans-serif'

const W = 320
const PAD = 8
const BORDER = 1.5
const TITLE_PX = 21
const HEAD_PX = 12.5 // bold section headings
const BODY_PX = 10.5
const LINE_GAP = 2
const THICK = 3 // heavy bar under the title + after the active-ingredient block
const RULE = 0.5 // hairline above each subsequent heading
const BULLET_INDENT = 12

export function DrugFactsSvg({ data, widthPx = 300 }: { data: DrugFactsData; widthPx?: number | null }): JSX.Element {
  const left = PAD
  const right = W - PAD
  const innerW = right - left

  const els: JSX.Element[] = []
  let y = PAD
  let k = 0
  const key = () => `df-${k++}`

  // Wrapped paragraph (regular or bold), advancing y.
  const paragraph = (text: string, opts: { bold?: boolean } = {}) => {
    if (!text || !text.trim()) return
    const lines = wrapSvgText(text.trim(), innerW, BODY_PX)
    lines.forEach((ln, i) => {
      els.push(
        <text key={key()} x={left} y={y + BODY_PX + i * (BODY_PX + LINE_GAP)} fontFamily={FONT} fontSize={BODY_PX} fontWeight={opts.bold ? 700 : 400} fill="#000">
          {ln}
        </text>,
      )
    })
    y += BODY_PX + (lines.length - 1) * (BODY_PX + LINE_GAP) + 4
  }

  // Hanging-indent bullet.
  const bullet = (text: string) => {
    if (!text || !text.trim()) return
    const lines = wrapSvgText(text.trim(), innerW - BULLET_INDENT, BODY_PX)
    els.push(<text key={key()} x={left + 1} y={y + BODY_PX} fontFamily={FONT} fontSize={BODY_PX} fill="#000">▪</text>)
    lines.forEach((ln, i) => {
      els.push(
        <text key={key()} x={left + BULLET_INDENT} y={y + BODY_PX + i * (BODY_PX + LINE_GAP)} fontFamily={FONT} fontSize={BODY_PX} fontWeight={400} fill="#000">
          {ln}
        </text>,
      )
    })
    y += BODY_PX + (lines.length - 1) * (BODY_PX + LINE_GAP) + 3
  }

  // Hairline-opened bold section heading.
  const heading = (label: string) => {
    y += 6
    els.push(<line key={key()} x1={left} y1={y} x2={right} y2={y} stroke="#000" strokeWidth={RULE} />)
    y += 4 + HEAD_PX
    els.push(<text key={key()} x={left} y={y} fontFamily={FONT} fontSize={HEAD_PX} fontWeight={700} fill="#000">{label}</text>)
    y += 3
  }

  // ===== Title =====
  y += 2
  els.push(<text key={key()} x={left} y={y + TITLE_PX} fontFamily={FONT} fontSize={TITLE_PX} fontWeight={800} fill="#000">Drug Facts</text>)
  y += TITLE_PX + 4
  els.push(<line key={key()} x1={left} y1={y} x2={right} y2={y} stroke="#000" strokeWidth={THICK} />)
  y += 2

  // ===== Active ingredient(s) ⟷ Purpose =====
  const ai = data.activeIngredients ?? []
  y += 4 + HEAD_PX
  els.push(<text key={key()} x={left} y={y} fontFamily={FONT} fontSize={HEAD_PX} fontWeight={700} fill="#000">{ai.length === 1 ? 'Active ingredient' : 'Active ingredients'}</text>)
  els.push(<text key={key()} x={right} y={y} textAnchor="end" fontFamily={FONT} fontSize={HEAD_PX} fontWeight={700} fill="#000">Purpose</text>)
  y += 4
  ai.forEach((row) => {
    const nameLines = wrapSvgText(row.name, innerW * 0.6, BODY_PX)
    const purpLines = wrapSvgText(row.purpose, innerW * 0.36, BODY_PX)
    const top = y
    nameLines.forEach((ln, i) =>
      els.push(<text key={key()} x={left} y={top + BODY_PX + i * (BODY_PX + LINE_GAP)} fontFamily={FONT} fontSize={BODY_PX} fontWeight={700} fill="#000">{ln}</text>),
    )
    purpLines.forEach((ln, i) =>
      els.push(<text key={key()} x={right} y={top + BODY_PX + i * (BODY_PX + LINE_GAP)} textAnchor="end" fontFamily={FONT} fontSize={BODY_PX} fontWeight={400} fill="#000">{ln}</text>),
    )
    const rows = Math.max(nameLines.length, purpLines.length)
    y = top + BODY_PX + (rows - 1) * (BODY_PX + LINE_GAP) + 4
  })
  // Heavy bar closing the active-ingredient block.
  y += 2
  els.push(<line key={key()} x1={left} y1={y} x2={right} y2={y} stroke="#000" strokeWidth={THICK} />)
  y += 1

  // ===== Uses =====
  if (data.uses?.length) {
    heading('Uses')
    data.uses.forEach((u) => bullet(u))
  }

  // ===== Warnings — bold sub-headers flush-left, detail lines regular =====
  if (data.warnings?.length) {
    heading('Warnings')
    data.warnings.forEach((w) => paragraph(w.text, { bold: !!w.bold }))
  }

  // ===== Directions =====
  if (data.directions?.trim()) {
    heading('Directions')
    paragraph(data.directions)
  }

  // ===== Other information =====
  if (data.otherInformation?.length) {
    heading('Other information')
    data.otherInformation.forEach((o) => bullet(o))
  }

  // ===== Inactive ingredients =====
  if (data.inactiveIngredients?.trim()) {
    heading('Inactive ingredients')
    paragraph(data.inactiveIngredients)
  }

  // ===== Questions or comments? =====
  if (data.questions?.trim()) {
    heading('Questions or comments?')
    paragraph(data.questions)
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
      aria-label="OTC Drug Facts panel (21 CFR 201.66)"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x={BORDER / 2} y={BORDER / 2} width={W - BORDER} height={boxBottom - BORDER} fill="#fff" stroke="#000" strokeWidth={BORDER} />
      {els}
    </svg>
  )
}
