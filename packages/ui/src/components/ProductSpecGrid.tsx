import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * ProductSpecGrid — 3-up grid of stat tiles for the product detail hero.
 *
 * Adapted from PeaPrint's Material / Process / Weight pattern, generalized
 * for iLaunchify F&B/supplement context where the three primary specs are
 * typically Format / Production method / Net weight.
 *
 * Renders ProductTemplate at detail-hero size per OOUX_OBJECT_MAP.md §2.3.
 * The labels are caller-provided so a Cosmetic template can render
 * "Texture / Process / Volume" instead.
 */

export interface SpecItem {
  label: string
  value: string
}

export interface ProductSpecGridProps {
  items: SpecItem[]
  className?: string
}

export function ProductSpecGrid({ items, className }: ProductSpecGridProps) {
  return (
    <div
      className={cn(
        'grid border-y border-ink-200 divide-x divide-ink-200',
        items.length === 2 && 'grid-cols-2',
        items.length === 3 && 'grid-cols-3',
        items.length === 4 && 'grid-cols-2 sm:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="py-4 px-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5">
            {item.label}
          </div>
          <div className="text-[15px] font-semibold text-ink-900">{item.value}</div>
        </div>
      ))}
    </div>
  )
}
