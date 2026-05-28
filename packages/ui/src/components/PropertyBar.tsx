import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * PropertyBar — labeled horizontal bar showing the strength of a property
 * (0–100). Adapted from PeaPrint's "Wrinkle-resistance / Flexibility" pattern.
 *
 * For iLaunchify products, common properties: Shelf life, Stability, Solubility,
 * Bioavailability, Sweetness, Texture smoothness. Admin-curated per
 * ProductTemplate.
 */
export interface PropertyBarProps {
  label: string
  /** 0–100. */
  value: number
  className?: string
}

export function PropertyBar({ label, value, className }: PropertyBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="text-[13px] text-ink-700">{label}</div>
      <div className="relative h-1.5 bg-ink-100 rounded-pill overflow-hidden">
        <div
          className="absolute top-0 left-0 bottom-0 bg-ink-900 rounded-pill transition-[width] duration-slow ease-out-quart"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
