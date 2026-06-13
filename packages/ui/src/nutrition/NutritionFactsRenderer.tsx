// FDA Nutrition Facts panel renderer.
//
// Implements the 21 CFR 101.9 vertical "Standard" format (2020 redesign).
// Renders from a PanelData object returned by services/compliance.
//
// Used in:
//   - apps/creator (preview while customizing the template + during compliance check)
//   - services/exports (server-side rendered to SVG/PDF in the print pipeline)
//
// Type sizes follow 21 CFR 101.9(d)(1)(ii) but render in CSS units. The
// services/exports pipeline rasterizes this at print resolution with the
// correct point sizes for label production.

import type { PanelData, NutrientRow } from '@ilaunchify/types'
import { cn } from '../lib/utils'

interface NutritionFactsRendererProps {
  data: PanelData
  className?: string
  /** Width in pixels; pass `null` to fill container */
  widthPx?: number | null
  /**
   * Mode 3 (Slice 4). When the panel is manufacturer-declared (not platform-
   * computed), render the FDA-footer "Declared by manufacturer" caption.
   */
  declaredByManufacturer?: boolean
}

export function NutritionFactsRenderer({
  data,
  className,
  widthPx = 280,
  declaredByManufacturer = false,
}: NutritionFactsRendererProps) {
  const isSupplement = data.format === 'SUPPLEMENT_FACTS'
  const title = isSupplement ? 'Supplement Facts' : 'Nutrition Facts'

  return (
    <div
      className={cn(
        'border-2 border-black bg-white p-2 font-["Helvetica","Arial",sans-serif] text-black',
        className,
      )}
      style={widthPx ? { width: widthPx } : undefined}
      data-testid="nutrition-facts-renderer"
    >
      <h2 className="border-b-[1px] border-black pb-1 text-3xl font-extrabold leading-none">
        {title}
      </h2>

      <div className="mt-1 text-sm leading-tight">
        Serving Size <span className="font-semibold">{data.servingSize}</span>
      </div>
      <div className="border-b-[8px] border-black pb-1 text-sm leading-tight">
        Servings Per Container <span className="font-semibold">{data.servingsPerContainer}</span>
      </div>

      {isSupplement ? (
        // 21 CFR 101.36: "Amount Per Serving" over the amounts + a "% Daily Value"
        // column header on the right.
        <div className="mt-1 flex items-end justify-between border-b border-black pb-0.5 text-xs font-bold">
          <span>Amount Per Serving</span>
          <span>% Daily Value</span>
        </div>
      ) : (
        <div className="mt-1 text-xs font-bold uppercase">Amount per serving</div>
      )}

      {data.rows.map((row, i) => (
        <NutrientRowRender key={`${row.id}-${i}`} row={row} isSupplement={isSupplement} />
      ))}

      {data.requiredFooter && (
        <div className="mt-2 border-t border-black pt-1 text-[10px] leading-tight">
          {data.requiredFooter}
        </div>
      )}

      {data.requiredWarnings.length > 0 && (
        <div className="mt-1 space-y-1">
          {data.requiredWarnings.map((w, i) => (
            <div key={i} className="text-[10px] font-bold uppercase leading-tight">
              {w}
            </div>
          ))}
        </div>
      )}

      {declaredByManufacturer && (
        <p className="mt-1 text-[8px] italic leading-tight text-gray-500">
          Declared by manufacturer
        </p>
      )}
    </div>
  )
}

function NutrientRowRender({ row, isSupplement }: { row: NutrientRow; isSupplement: boolean }) {
  // Supplement Facts has no large bold Calories box (that's a Nutrition Facts
  // feature); any calories on a supplement render as a normal line.
  const isCalories = row.id === 'calories' && !isSupplement
  const indentClass = row.indent === 1 ? 'pl-3' : row.indent === 2 ? 'pl-6' : ''
  const isMajorRow = row.indent === 0

  if (isCalories) {
    return (
      <div className="mt-1 flex items-end justify-between border-y-[4px] border-black py-0.5">
        <span className="text-base font-extrabold">Calories</span>
        <span className="text-2xl font-extrabold leading-none">{formatValue(row.amount)}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex justify-between border-b border-zinc-400 py-0.5 text-sm leading-tight',
        isMajorRow && 'font-semibold',
        indentClass,
      )}
    >
      <span>
        {row.label} {formatValue(row.amount)}
        {row.unit && <span className="font-normal"> {row.unit}</span>}
      </span>
      {row.percentDailyValue !== undefined ? (
        <span className="font-bold">{row.percentDailyValue}%</span>
      ) : row.noDailyValue ? (
        // No established Daily Value → "†" in the % Daily Value column.
        <span className="font-bold">†</span>
      ) : null}
    </div>
  )
}

function formatValue(v: number | string): string {
  if (typeof v === 'string') return v
  // Whole numbers without trailing .0; one decimal place otherwise.
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
