// Print-grade, CSS-immune SVG renderer for the cosmetic INCI ingredient
// declaration (21 CFR 701.3) + net contents + MoCRA responsible-person /
// adverse-event contact. Cosmetics have no "facts" box — the declaration is a
// legibly-set ingredient statement in the regulated order (built upstream by
// toInciDeclaration: >1% by predominance, then ≤1% any order, colors last).
//
// Same discipline as the food/supplement/pet renderers: NO Tailwind / className /
// inherited CSS / <foreignObject>. Deterministic height from content.

import { wrapSvgText } from './SupplementFactsSvg'

const FONT = 'Helvetica, Arial, sans-serif'

const W = 320
const PAD = 8
const BORDER = 1.5
const KICKER_PX = 9 // "INGREDIENT DECLARATION · 21 CFR 701.3"
const PREFIX_PX = 11 // "INGREDIENTS:" / contact labels
const BODY_PX = 11 // the ingredient list + contact values
const SECTION_RULE = 0.75
const LINE_GAP = 2

export function InciDeclarationSvg({
  ingredients,
  netContents,
  responsiblePerson,
  adverseEventContact,
  widthPx = 300,
}: {
  ingredients?: string
  netContents?: string
  responsiblePerson?: string
  adverseEventContact?: string
  widthPx?: number | null
}): JSX.Element {
  const innerLeft = PAD
  const innerRight = W - PAD
  const innerWidth = innerRight - innerLeft

  const els: JSX.Element[] = []
  let y = PAD

  // Kicker.
  y += KICKER_PX
  els.push(
    <text key="kicker" x={innerLeft} y={y} fontFamily={FONT} fontSize={KICKER_PX} fontWeight={700} letterSpacing="0.06em" fill="#000">
      INGREDIENT DECLARATION · 21 CFR 701.3
    </text>,
  )
  y += 3
  els.push(<line key="kicker-rule" x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={SECTION_RULE} />)

  // A "PREFIX rest" block (prefix bold, remainder regular), wrapped to width.
  const pushBlock = (key: string, prefix: string, rest: string) => {
    if (!rest || rest.trim().length === 0) return
    y += 7
    const full = `${prefix} ${rest.trim()}`
    const lines = wrapSvgText(full, innerWidth, BODY_PX)
    lines.forEach((line, li) => {
      const baseline = y + BODY_PX + li * (BODY_PX + LINE_GAP)
      if (li === 0) {
        const remainder = line.slice(prefix.length).replace(/^\s+/, '')
        els.push(
          <text key={`${key}-0`} x={innerLeft} y={baseline} fontFamily={FONT} fontSize={BODY_PX} fill="#000">
            <tspan fontWeight={700} fontSize={PREFIX_PX}>{prefix}</tspan>
            {remainder.length > 0 ? <tspan dx={5} fontWeight={400}>{remainder}</tspan> : null}
          </text>,
        )
      } else {
        els.push(
          <text key={`${key}-${li}`} x={innerLeft} y={baseline} fontFamily={FONT} fontSize={BODY_PX} fontWeight={400} fill="#000">
            {line}
          </text>,
        )
      }
    })
    y += BODY_PX + (lines.length - 1) * (BODY_PX + LINE_GAP) + 1
  }

  // The regulated ingredient statement (the core 701.3 element).
  pushBlock('ingredients', 'INGREDIENTS:', ingredients ?? '')

  // Divider before the net-contents / responsible-person block.
  if (netContents || responsiblePerson || adverseEventContact) {
    y += 7
    els.push(<line key="contact-rule" x1={innerLeft} y1={y} x2={innerRight} y2={y} stroke="#000" strokeWidth={SECTION_RULE} />)
  }

  if (netContents) pushBlock('net', 'NET CONTENTS:', netContents)
  if (responsiblePerson) pushBlock('rp', 'Manufactured / distributed by:', responsiblePerson)
  if (adverseEventContact) pushBlock('aec', 'Adverse-event reports:', adverseEventContact)

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
      aria-label="Cosmetic INCI ingredient declaration (21 CFR 701.3)"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x={BORDER / 2} y={BORDER / 2} width={W - BORDER} height={boxBottom - BORDER} fill="#fff" stroke="#000" strokeWidth={BORDER} />
      {els}
    </svg>
  )
}
