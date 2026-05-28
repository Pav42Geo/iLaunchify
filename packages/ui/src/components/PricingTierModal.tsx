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
 * Rows = MOQ quantity bands (admin-curated, sourced from ProductionPath data
 * once wired to the DB).
 * Columns = creator subscription tiers (Maker / Builder / Agency per
 * PLATFORM_SPEC.md).
 * Cells = landed cost per unit at that (band × tier).
 *
 * The current tier is highlighted. A personalized footnote calls out the
 * savings the visitor would get by upgrading at their current quantity.
 *
 * Logged-in only — logged-out gets the same page without this trigger
 * (per MARKETPLACE_DESIGN.md §9 hybrid gating).
 *
 * For the data-shape types + sample-row generator, see `pricing-tier-data.ts`
 * (a non-'use client' sibling — server components import the helper from
 * there, then pass the rows as a prop to this client modal).
 */

export interface PricingTierModalProps {
  productName: string
  variantName?: string
  rows: PricingTierRow[]
  /** Visitor's current tier. */
  currentTier: TierKey
  /** Visitor's current quantity from the detail-page input (used for footnote). */
  currentQuantity: number
  /** Called when the visitor clicks "Upgrade to [tier]" inside the modal. */
  onUpgrade?: (target: TierKey) => void
}

const TIERS: TierKey[] = ['maker', 'builder', 'agency']

const TIER_LABEL: Record<TierKey, string> = {
  maker: 'Maker',
  builder: 'Builder',
  agency: 'Agency',
}

const TIER_ICON: Record<TierKey, string> = {
  maker: '',
  builder: '⚡',
  agency: '🏛',
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
  onUpgrade,
}: PricingTierModalProps) {
  const upgrade = nextTier(currentTier)
  const matchedRow = findRowForQuantity(rows, currentQuantity)

  // Personalized savings footnote
  const footnote: React.ReactNode = (() => {
    if (!matchedRow || !upgrade) return null
    const here = matchedRow.prices[currentTier]
    const there = matchedRow.prices[upgrade]
    if (here <= there) return null
    const saving = here - there
    const total = saving * currentQuantity
    return (
      <>
        At {currentQuantity} units you'd save{' '}
        <strong>{fmt(saving)}/unit</strong> on {TIER_LABEL[upgrade]} (
        <strong>{fmt(total)} / order</strong>)
      </>
    )
  })()

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-pink-700 hover:text-pink-600 transition-colors">
          <BarChart3 strokeWidth={2} className="w-3.5 h-3.5" />
          See pricing by tier
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="p-6 pb-4 border-b border-ink-200">
          <DialogTitle className="font-display text-xl font-bold tracking-[-0.01em] text-ink-900">
            Pricing by tier
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
                  Tier
                </th>
                <th className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Monthly QTY
                </th>
                {TIERS.map((t) => (
                  <th
                    key={t}
                    className={cn(
                      'text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em]',
                      t === currentTier
                        ? 'bg-pink-50 text-pink-700'
                        : 'text-ink-500',
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {TIER_ICON[t]} {TIER_LABEL[t]}
                    </span>
                    {t === currentTier && (
                      <span className="block text-[9px] font-normal opacity-70 mt-px">
                        (current)
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.band}
                  className={cn(
                    'border-b border-ink-100 last:border-b-0',
                    'hover:bg-ink-50/50',
                  )}
                >
                  <td className="px-6 py-3 text-ink-600 font-medium">
                    {row.bandMin === null ? '—' : i}
                  </td>
                  <td className="px-3 py-3 text-ink-700">{row.band}</td>
                  {TIERS.map((t) => (
                    <td
                      key={t}
                      className={cn(
                        'text-right px-4 py-3 font-mono tabular-nums',
                        t === currentTier
                          ? 'bg-pink-50/50 font-semibold text-ink-900'
                          : 'text-ink-900',
                      )}
                    >
                      {fmt(row.prices[t])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {footnote && (
          <div className="px-6 py-4 border-t border-ink-200 bg-cream text-[13px] text-ink-700">
            Your current tier:{' '}
            <strong className="text-ink-900">{TIER_LABEL[currentTier]}</strong>
            {' · '}
            {footnote}
          </div>
        )}

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

