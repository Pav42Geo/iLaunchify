'use client'

import * as React from 'react'
import { BarChart3 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../primitives/dialog'
import { Button } from '../primitives/button'
import { cn } from '../lib/utils'
import type { PricingTierRow, TierKey } from './pricing-tier-data'

/**
 * PricingTierModal — the "📊 See pricing by tier" affordance on the
 * ProductTemplate detail page (per MARKETPLACE_DESIGN.md §8).
 *
 * Rows = MOQ quantity bands sourced from ProductTemplatePricingTier (falls
 * through to a synthetic table when a template has no real tiers yet — see
 * getPricingTierRows).
 *
 * Per the LOCKED pricing model (MARKETPLACE_MANAGEMENT_PLAN §6) there is ONE
 * per-unit price per band — the volume band sets the unit price, and a
 * creator's Builder/Agency tier discounts the platform *fee*, not the unit
 * cost. So this is a quantity-band table, not a tier-comparison grid; the
 * tier benefit is called out as a fee note below.
 *
 * Logged-in only — logged-out gets the same page without this trigger
 * (per MARKETPLACE_DESIGN.md §9 hybrid gating).
 *
 * For the data-shape types + synthetic-row generator, see `pricing-tier-data.ts`
 * (a non-'use client' sibling — server components import the helper from
 * there, then pass the rows as a prop to this client modal).
 */

export interface PricingTierModalProps {
  productName: string
  variantName?: string
  rows: PricingTierRow[]
  /** Visitor's current tier — the platform fee for this tier is baked into the
   *  rows' perUnitCents. Drives the breakdown line + upgrade CTA. */
  currentTier: TierKey
  /** Visitor's current quantity from the detail-page input (used for the subtotal note). */
  currentQuantity: number
  /** Signed-in? When false the price shown is the Maker rate — surface a
   *  "sign in for your tier" hint. */
  isAuthenticated?: boolean
  /** Called when the visitor clicks "Upgrade to [tier]" inside the modal. */
  onUpgrade?: (target: TierKey) => void
}

const TIER_LABEL: Record<TierKey, string> = {
  maker: 'Maker',
  builder: 'Builder',
  agency: 'Agency',
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`
}

function nextTier(t: TierKey): TierKey | null {
  return t === 'maker' ? 'builder' : t === 'builder' ? 'agency' : null
}

function findRowForQuantity(rows: PricingTierRow[], qty: number): PricingTierRow | null {
  // Skip sample row (bandMin = null). Find the band whose lower bound is <= qty,
  // preferring the highest matching band (most-specific).
  const eligible = rows.filter((r) => r.bandMin !== null && r.bandMin <= qty)
  return eligible.length > 0 ? eligible[eligible.length - 1]! : null
}

export function PricingTierModal({
  productName,
  variantName,
  rows,
  currentTier,
  currentQuantity,
  isAuthenticated = false,
  onUpgrade,
}: PricingTierModalProps) {
  const upgrade = nextTier(currentTier)
  const matchedRow = findRowForQuantity(rows, currentQuantity)
  // The platform-fee % is uniform across rows (it's a tier property).
  const feePercent = rows.find((r) => r.feePercent !== undefined)?.feePercent ?? null

  // Subtotal at the visitor's current quantity. The unit price is the same
  // across creator tiers (locked model) — tier benefits are fee-side.
  const orderNote: React.ReactNode = (() => {
    if (!matchedRow) return null
    const total = (matchedRow.perUnitCents * currentQuantity) / 100
    return (
      <>
        At {currentQuantity.toLocaleString()} units ·{' '}
        <strong>{fmt(matchedRow.perUnitCents / 100)}/unit</strong> (
        <strong>{fmt(total)} subtotal</strong>)
      </>
    )
  })()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-pink-700 hover:text-pink-600 transition-colors">
          <BarChart3 strokeWidth={2} className="w-3.5 h-3.5" />
          See pricing by quantity
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="p-6 pb-4 border-b border-ink-200">
          <DialogTitle className="font-display text-xl font-bold tracking-[-0.01em] text-ink-900">
            Pricing by quantity
          </DialogTitle>
          <div className="text-sm font-normal text-ink-500 mt-1">
            {productName}
            {variantName && ` · ${variantName}`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Quantity / month
                </th>
                <th className="text-right px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Per unit
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isMatch = matchedRow?.band === row.band
                return (
                  <tr
                    key={row.band}
                    className={cn(
                      'border-b border-ink-100 last:border-b-0 hover:bg-ink-50/50',
                      isMatch && 'bg-pink-50/50',
                    )}
                  >
                    <td className="px-6 py-3 text-ink-700">
                      {row.band}
                      {isMatch && (
                        <span className="ml-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-pink-700">
                          your qty
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'text-right px-6 py-3 font-mono tabular-nums',
                        isMatch ? 'font-semibold text-ink-900' : 'text-ink-900',
                      )}
                    >
                      {fmt(row.perUnitCents / 100)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-ink-200 bg-cream text-[13px] text-ink-700 space-y-1.5">
          {orderNote && <div>{orderNote}</div>}

          {/* P3 breakdown for the matched band — manufacturer + tier fee. */}
          {matchedRow?.manufacturerCents !== undefined &&
            matchedRow.platformFeeCents !== undefined && (
              <div className="text-ink-600 font-mono text-[12px] tabular-nums">
                {fmt(matchedRow.manufacturerCents / 100)} manufacturer
                {' + '}
                {fmt(matchedRow.platformFeeCents / 100)} platform fee
                {feePercent !== null && ` (${feePercent}% ${TIER_LABEL[currentTier]})`}
                {' = '}
                <strong className="text-ink-900">{fmt(matchedRow.perUnitCents / 100)}/unit</strong>
              </div>
            )}

          {/* Tier note — the price already reflects the viewer's tier fee. */}
          <div className="text-ink-600">
            {isAuthenticated ? (
              <>
                Priced at your <strong className="text-ink-900">{TIER_LABEL[currentTier]}</strong>{' '}
                tier{feePercent !== null && ` (${feePercent}% platform fee)`}.
                {upgrade && (
                  <>
                    {' '}
                    <strong className="text-ink-900">{TIER_LABEL[upgrade]}</strong> lowers the fee
                    further.
                  </>
                )}
              </>
            ) : (
              <>
                Showing <strong className="text-ink-900">Maker</strong> pricing
                {feePercent !== null && ` (${feePercent}% platform fee)`}.{' '}
                <strong className="text-ink-900">Sign in</strong> to see pricing at your tier.
              </>
            )}
          </div>

          {/* Shipping is not in the unit price — partner-managed, estimated at checkout. */}
          <div className="text-ink-500 text-[12px]">
            Production shipping isn&apos;t included — it&apos;s estimated at checkout based on
            quantity and destination.
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-ink-200">
          <button
            type="button"
            className="text-sm font-medium text-ink-600 hover:text-ink-900 px-3 py-2"
            data-radix-dialog-close=""
          >
            Close
          </button>
          {upgrade && (
            <Button variant="primary" onClick={() => onUpgrade?.(upgrade)}>
              Upgrade to {TIER_LABEL[upgrade]}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
