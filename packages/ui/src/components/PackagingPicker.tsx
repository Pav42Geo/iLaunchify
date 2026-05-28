'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * PackagingPicker — card grid for selecting the packaging variant on a
 * ProductTemplate detail page.
 *
 * Each option renders as a card with icon + name + lead-time + per-unit
 * price-delta. Per the variant matrix (flavor × size × packing) and
 * [[ilaunchify-flavors-as-presets]], packaging is admin-curated — the
 * creator picks one; they don't define new types.
 *
 * For V1 demo, options carry icon emoji. Replace with PackagingType.logoAssetId
 * once the schema migration lands.
 */

export interface PackagingOption {
  id: string
  /** e.g., "Stand-up pouch", "Glass jar 250mL", "Aluminum can". */
  name: string
  /** Emoji glyph for V1; eventually a small image of the packaging. */
  icon: string
  /** Optional price delta per unit vs. the cheapest option. Positive = premium. */
  priceDelta?: number
  /** Optional lead-time in days. */
  leadTimeDays?: number
  /** Marks the option as unavailable (greyed out). */
  unavailable?: boolean
}

export interface PackagingPickerProps {
  options: PackagingOption[]
  value?: string
  onChange?: (id: string) => void
  className?: string
}

export function PackagingPicker({
  options,
  value,
  onChange,
  className,
}: PackagingPickerProps) {
  const [internal, setInternal] = React.useState(value ?? options.find((o) => !o.unavailable)?.id)
  const selected = value ?? internal

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
        Packaging
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map((opt) => {
          const isSelected = opt.id === selected
          const disabled = opt.unavailable === true
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => {
                if (disabled) return
                if (value === undefined) setInternal(opt.id)
                onChange?.(opt.id)
              }}
              className={cn(
                'flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-[border-color,background-color] duration-base ease-out-quart',
                disabled && 'opacity-40 cursor-not-allowed',
                !disabled && isSelected && 'border-ink-900 bg-ink-50',
                !disabled && !isSelected && 'border-ink-300 bg-white hover:border-ink-500 cursor-pointer',
              )}
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {opt.icon}
              </span>
              <span className="text-[13px] font-semibold text-ink-900 leading-tight">
                {opt.name}
              </span>
              <div className="text-[11px] text-ink-500 flex items-center gap-1.5 mt-0.5">
                {opt.priceDelta !== undefined && opt.priceDelta !== 0 && (
                  <span>
                    {opt.priceDelta > 0 ? '+' : ''}${opt.priceDelta.toFixed(2)}/unit
                  </span>
                )}
                {opt.leadTimeDays !== undefined && (
                  <span>
                    {opt.priceDelta !== undefined && opt.priceDelta !== 0 ? '·' : ''}{' '}
                    {opt.leadTimeDays}d
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
