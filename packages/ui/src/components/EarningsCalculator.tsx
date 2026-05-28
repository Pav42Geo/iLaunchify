'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * EarningsCalculator — "Your earnings · Set your price" widget on the product
 * detail page. Adapted from PeaPrint's pricing-row pattern.
 *
 * The creator enters the retail price they plan to charge end buyers. The
 * widget shows live margin and per-order earnings given the platform's
 * landed cost. Useful for assessing whether the unit economics work BEFORE
 * the creator commits to launching.
 *
 * Note: iLaunchify is B2B production — the creator sets the retail price on
 * their own DTC / wholesale channel. This calculator surfaces the math so
 * they can plan margins without leaving the marketplace.
 */
export interface EarningsCalculatorProps {
  /** Per-unit landed cost (what the creator pays iLaunchify). */
  costPerUnit: number
  /** Default retail price (per unit) — used as the initial value. */
  defaultRetail?: number
  /** Optional callback when the retail input changes. */
  onChange?: (retailPerUnit: number) => void
  className?: string
}

export function EarningsCalculator({
  costPerUnit,
  defaultRetail,
  onChange,
  className,
}: EarningsCalculatorProps) {
  const initial = defaultRetail ?? Math.round(costPerUnit * 3.5 * 100) / 100
  const [retail, setRetail] = React.useState<number>(initial)

  const margin = retail - costPerUnit
  const marginPct = retail > 0 ? (margin / retail) * 100 : 0

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 p-4 rounded-lg border border-ink-200 bg-white',
        className,
      )}
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5">
          Your earnings
        </div>
        <div className="text-2xl font-bold text-pink-700 tracking-[-0.01em] leading-none">
          ${margin > 0 ? margin.toFixed(2) : '0.00'}
          <span className="text-ink-500 text-[13px] font-medium ml-1.5">/ unit</span>
        </div>
        <div className="text-[12px] text-ink-500 mt-1">
          {margin > 0 ? `${marginPct.toFixed(0)}% margin` : 'set retail above cost'}
        </div>
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5 block">
          Set your price
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 font-medium">
            $
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={retail}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              const next = Number.isFinite(v) ? v : 0
              setRetail(next)
              onChange?.(next)
            }}
            className="w-full h-10 pl-7 pr-3 rounded-md border border-ink-300 bg-white text-[15px] font-semibold text-ink-900 focus:outline-none focus:border-pink-500 focus:ring-[3px] focus:ring-pink-500/15 transition-[border-color,box-shadow] tabular-nums"
          />
        </div>
        <div className="text-[12px] text-ink-500 mt-1 tabular-nums">
          cost ${costPerUnit.toFixed(2)} / unit
        </div>
      </div>
    </div>
  )
}
