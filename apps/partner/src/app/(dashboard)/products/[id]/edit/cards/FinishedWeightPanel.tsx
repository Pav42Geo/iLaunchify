// Finished-product weight (recipe-builder Phase 2, completes the #131 stub).
// Derived, read-only: the recipe formula basis (sum of ingredient-slot grams)
// + the front-of-pack net weight per variant (container fill, or serving
// geometry when fill isn't set). Drives the shipping calc. Pure presentational —
// no server actions; it reflects the slots + variants the partner already edits.

import { formatNetWeight } from '@ilaunchify/nutrition'

interface WeightSlot {
  name: string
  weightG: number
}

interface WeightVariant {
  id: string
  flavor: string | null
  containerFormat: string
  containerSizeG: number | null
  servingSizeG: number
  servingsPerContainer: number
}

/** Net fill per unit: the authored container weight, else servings × serving size. */
function netWeightG(v: WeightVariant): number {
  if (v.containerSizeG && v.containerSizeG > 0) return v.containerSizeG
  return Math.round(v.servingSizeG * v.servingsPerContainer)
}

export function FinishedWeightPanel({
  slots,
  variants,
}: {
  slots: WeightSlot[]
  variants: WeightVariant[]
}) {
  const formulaTotalG = slots.reduce((sum, s) => sum + (s.weightG > 0 ? s.weightG : 0), 0)

  return (
    <div className="space-y-4 text-sm">
      {/* Formula basis */}
      <div className="rounded-lg border border-ink-200 bg-white p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Recipe formula basis</span>
          <span className="font-display text-[18px] font-bold tabular-nums text-ink-900">
            {formulaTotalG > 0 ? formatNetWeight(formulaTotalG) : '—'}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {slots.length === 0
            ? 'Add ingredient slots to derive the formula weight.'
            : `Sum of ${slots.length} ingredient slot${slots.length === 1 ? '' : 's'} as authored — the batch composition the partner scales to MOQ.`}
        </p>
      </div>

      {/* Net weight per variant */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">Net weight per unit</p>
        {variants.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-500">
            Add a variant to derive the per-unit net weight.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200 bg-white">
            {variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-ink-800">
                  {v.containerFormat}
                  {v.flavor ? <span className="text-ink-500"> · {v.flavor}</span> : null}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-ink-900">{formatNetWeight(netWeightG(v))}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-ink-400">
          Uses the variant&rsquo;s container fill weight when set, otherwise servings × serving size. Front-of-pack net
          weight must match what&rsquo;s declared on the label.
        </p>
      </div>
    </div>
  )
}
