'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * FlavorSwatch — flavor variant picker on the product detail page.
 *
 * Rendered as text pills (matching the size-pill pattern in the configurator)
 * so the whole variant-selection language on the detail page reads as one
 * consistent family. The `color` field on FlavorOption is preserved for
 * confirmation surfaces (e.g., the /start recap card) but no longer drives
 * the picker visual.
 *
 * One pill per FlavorPreset on a ProductTemplate. Per
 * [[ilaunchify-flavors-as-presets]], flavors are admin-curated presets — the
 * creator picks one; they don't define new flavors.
 */

export interface FlavorOption {
  id: string
  name: string
  /** Optional CSS color — used only on confirmation surfaces, not the picker. */
  color?: string
}

export interface FlavorSwatchProps {
  options: FlavorOption[]
  value?: string
  onChange?: (id: string) => void
  className?: string
}

export function FlavorSwatch({ options, value, onChange, className }: FlavorSwatchProps) {
  const [internal, setInternal] = React.useState(value ?? options[0]?.id)
  const selected = value ?? internal
  const selectedName = options.find((o) => o.id === selected)?.name ?? '—'

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
        Flavor{' '}
        <span className="text-ink-700 normal-case font-normal tracking-normal">
          · {selectedName}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = opt.id === selected
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                if (value === undefined) setInternal(opt.id)
                onChange?.(opt.id)
              }}
              className={cn(
                'px-4 h-9 rounded-pill text-[13px] font-semibold border transition-[border-color,background-color,color] duration-base ease-out-quart cursor-pointer',
                isSelected
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-900 border-ink-300 hover:border-ink-500',
              )}
            >
              {opt.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
