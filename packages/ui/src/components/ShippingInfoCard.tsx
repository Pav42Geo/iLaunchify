import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * ShippingInfoCard — fulfillment-region + lead-time tile on the product
 * detail page. Adapted from PeaPrint's "Shipping / Ship to" pattern.
 *
 * V1 surfaces a single market (US — per [[ilaunchify-markets-and-regions]]).
 * V1.1 adds CA, V2 adds EU — at that point the user can change the ship-to
 * market via a select inside this card.
 */
export interface ShippingInfoCardProps {
  /** e.g., "Standard fulfillment" or "Premier 2-day". */
  serviceLabel: string
  /** Per-order shipping cost. Pass 0 to render "$0 (Standard)". */
  cost?: number
  /** Country code or full name for the destination market. */
  marketLabel: string
  /** Country flag emoji or 2-letter code. */
  marketFlag?: string
  /** e.g., "4–6 days". */
  leadTimeLabel: string
  className?: string
}

export function ShippingInfoCard({
  serviceLabel,
  cost = 0,
  marketLabel,
  marketFlag = '🇺🇸',
  leadTimeLabel,
  className,
}: ShippingInfoCardProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 p-4 rounded-lg border border-ink-200 bg-white',
        className,
      )}
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5">
          Shipping
        </div>
        <div className="text-2xl font-bold text-ink-900 leading-none">
          {cost === 0 ? '$0' : `$${cost.toFixed(2)}`}
        </div>
        <div className="text-[12px] text-ink-500 mt-1">({serviceLabel})</div>
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-1.5">
          Ship to
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-xl">
            {marketFlag}
          </span>
          <span className="text-[15px] font-semibold text-ink-900">{marketLabel}</span>
        </div>
        <div className="text-[12px] text-ink-500 mt-1">{leadTimeLabel}</div>
      </div>
    </div>
  )
}
