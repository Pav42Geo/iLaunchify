'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * PerFlavorEarnings — the per-flavor earnings breakdown for variety packs priced
 * PER_FLAVOR where each flavor unit is independently sellable (PER_FLAVOR_IN_OUTER
 * / pick-N). A single blended margin would hide reality, so each flavor is its own
 * row: its landed cost, an editable retail price the creator plans to charge, and
 * the resulting per-unit margin. A weighted summary (by the pack composition) keeps
 * one headline number on top.
 *
 * For single-flavor / PER_PACK / fixed-assortment products use EarningsCalculator
 * instead — there's genuinely one price there.
 */

export interface PerFlavorEarningsRow {
  flavorPresetId: string
  name: string
  swatchHex?: string | null
  /** Creator's landed cost per unit for THIS flavor (what they pay iLaunchify). */
  costPerUnit: number
  /** How many units of this flavor are in one pack — weights the blended summary. */
  unitsInPack: number
}

export interface PerFlavorEarningsProps {
  rows: PerFlavorEarningsRow[]
  /** Default retail = cost × this multiplier (per flavor). */
  retailMultiplier?: number
  tone?: 'default' | 'neutral'
  className?: string
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`
}

export function PerFlavorEarnings({
  rows,
  retailMultiplier = 3.5,
  tone = 'neutral',
  className,
}: PerFlavorEarningsProps) {
  // Retail price per flavor, defaulting to cost × multiplier. Keyed by flavor id;
  // re-seeded when a flavor first appears (kept otherwise so edits survive picks).
  const [retailById, setRetailById] = React.useState<Record<string, number>>({})
  React.useEffect(() => {
    setRetailById((prev) => {
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.flavorPresetId] == null) {
          next[r.flavorPresetId] = Math.round(r.costPerUnit * retailMultiplier * 100) / 100
        }
      }
      return next
    })
  }, [rows, retailMultiplier])

  const setRetail = (id: string, v: number) =>
    setRetailById((p) => ({ ...p, [id]: Number.isFinite(v) ? v : 0 }))

  // Blended (pack-weighted) earnings + average margin across the composition.
  const totalUnits = rows.reduce((t, r) => t + Math.max(0, r.unitsInPack), 0)
  let weightedMargin = 0
  let weightedRetail = 0
  for (const r of rows) {
    const retail = retailById[r.flavorPresetId] ?? r.costPerUnit * retailMultiplier
    weightedMargin += (retail - r.costPerUnit) * Math.max(0, r.unitsInPack)
    weightedRetail += retail * Math.max(0, r.unitsInPack)
  }
  const blendedMarginPerUnit = totalUnits > 0 ? weightedMargin / totalUnits : 0
  const avgMarginPct = weightedRetail > 0 ? (weightedMargin / weightedRetail) * 100 : 0

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        tone === 'neutral' ? 'border-ink-100 bg-ink-50/60' : 'border-ink-200 bg-white',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink-700">
          Your earnings
        </div>
        <div className="text-[12px] text-ink-500 tabular-nums">
          blended{' '}
          <span className="font-bold text-pink-700">{usd(Math.max(0, blendedMarginPerUnit))}</span>
          <span className="text-ink-400"> / unit</span>
          {avgMarginPct > 0 && <span className="text-ink-500"> · {avgMarginPct.toFixed(0)}% avg</span>}
        </div>
      </div>

      <p className="mt-1 text-[11.5px] text-ink-500">
        Each flavor is its own SKU — set the price you’ll charge per flavor.
      </p>

      <ul className="mt-3 space-y-1.5">
        {rows.map((r) => {
          const retail = retailById[r.flavorPresetId] ?? r.costPerUnit * retailMultiplier
          const margin = retail - r.costPerUnit
          return (
            <li
              key={r.flavorPresetId}
              className="flex items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-2.5 py-2"
            >
              <span
                className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-ink-200"
                style={{ backgroundColor: r.swatchHex ?? '#E7E2D8' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-900">{r.name}</span>
                <span className="block text-[11px] text-ink-500 tabular-nums">cost {usd(r.costPerUnit)} / unit</span>
              </span>

              <div className="relative flex-shrink-0">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={retail}
                  onChange={(e) => setRetail(r.flavorPresetId, parseFloat(e.target.value))}
                  aria-label={`${r.name} retail price`}
                  className="h-8 w-[88px] rounded-md border border-ink-300 bg-white pl-5 pr-2 text-right text-[13px] font-semibold tabular-nums text-ink-900 focus:outline-none focus:border-pink-500 focus:ring-[3px] focus:ring-pink-500/15 transition-[border-color,box-shadow]"
                />
              </div>

              <span
                className={cn(
                  'w-[58px] flex-shrink-0 text-right text-[13px] font-semibold tabular-nums',
                  margin > 0 ? 'text-pink-700' : 'text-ink-400',
                )}
              >
                {margin > 0 ? `+${usd(margin)}` : usd(0)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
