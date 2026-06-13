// Print-grade, CSS-immune SVG renderer for the FDA aggregate ("multi-column")
// Nutrition Facts panel used on variety / assorted multi-unit packages — one
// numeric column per product (flavor), sharing one column of nutrient names.
// 21 CFR 101.9(d)(13) (aggregate display of two or more foods in one package).
//
// Same discipline as NutritionFactsSvg: NO Tailwind / className / inherited CSS /
// <foreignObject>. This component is a THIN map from layoutVarietyFacts()'s pure
// draw-ops to positioned <text>/<rect> — all regulated geometry lives in
// variety-layout.ts and is node-verified (variety-layout.selftest.ts).

import { layoutVarietyFacts, BORDER, FONT, type VarietyColumn } from './variety-layout'

export type { VarietyColumn } from './variety-layout'

export function VarietyFactsSvg({
  columns,
  widthPx = null,
}: {
  columns: VarietyColumn[]
  widthPx?: number | null
}): JSX.Element {
  const { W, height, ops } = layoutVarietyFacts(columns)
  const widthAttr: number | string = widthPx == null ? '100%' : widthPx

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${height}`}
      width={widthAttr}
      height={widthPx == null ? undefined : (widthPx * height) / W}
      role="img"
      aria-label="Aggregate Nutrition Facts panel (variety pack)"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x={BORDER / 2} y={BORDER / 2} width={W - BORDER} height={height - BORDER} fill="#fff" stroke="#000" strokeWidth={BORDER} />
      {ops.map((op, i) =>
        op.kind === 'rect' ? (
          <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill="#000" />
        ) : (
          <text key={i} x={op.x} y={op.y} fontFamily={FONT} fontSize={op.size} fontWeight={op.weight} fill="#000" textAnchor={op.anchor}>
            {op.text}
          </text>
        ),
      )}
    </svg>
  )
}
