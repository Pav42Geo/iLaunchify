'use client'

import * as React from 'react'
import { BarChart3 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../primitives/dialog'
import { Button } from '../primitives/button'
import { cn } from '../lib/utils'
import type { PricingTierRow, TierKey } from './pricing-tier-data'

/**
 * PricingTierModal — "See pricing by tier" on the ProductTemplate detail page.
 *
 * Quantity-band table. When `feePctByTier` is supplied it renders a column per
 * creator subscription tier (Maker / Builder / Agency) showing the all-in price
 * at each — the unit cost is identical across tiers, so the columns differ only
 * by that tier's platform fee. Synced to the partner's ProductTemplatePricingTier
 * data (same source the partner edits in the builder). When `onDemandRows` is
 * non-empty, Bulk / On-demand tabs appear (Bulk default).
 *
 * Backward-compatible: without `feePctByTier` it falls back to a single
 * per-unit column at the viewer's tier (the prior behavior).
 */

export interface PricingTierModalProps {
  productName: string
  variantName?: string
  /** Bulk quantity bands (the volume tiers). */
  rows: PricingTierRow[]
  /** On-demand bands — when non-empty, a Bulk/On-demand tab switcher appears. */
  onDemandRows?: PricingTierRow[]
  /** Visitor's current tier — highlighted column + upgrade CTA. */
  currentTier: TierKey
  currentQuantity: number
  isAuthenticated?: boolean
  /** Platform-fee % per subscription tier — drives the per-tier columns. */
  feePctByTier?: { maker: number; builder: number; agency: number }
  onUpgrade?: (target: TierKey) => void
}

const TIER_LABEL: Record<TierKey, string> = { maker: 'Maker', builder: 'Builder', agency: 'Agency' }
const TIER_ORDER: TierKey[] = ['maker', 'builder', 'agency']

function fmt(n: number): string {
  return `$${n.toFixed(2)}`
}
function nextTier(t: TierKey): TierKey | null {
  return t === 'maker' ? 'builder' : t === 'builder' ? 'agency' : null
}
/** Base manufacturer cost for a row (real rows carry it; synthetic fall back to perUnit). */
function baseCents(row: PricingTierRow): number {
  return row.manufacturerCents ?? row.perUnitCents
}
function withFee(base: number, pct: number): number {
  return base + Math.round((base * pct) / 100)
}
function findRowForQuantity(rows: PricingTierRow[], qty: number): PricingTierRow | null {
  const eligible = rows.filter((r) => r.bandMin !== null && r.bandMin <= qty)
  return eligible.length > 0 ? eligible[eligible.length - 1]! : null
}

export function PricingTierModal({
  productName,
  variantName,
  rows,
  onDemandRows,
  currentTier,
  currentQuantity,
  isAuthenticated = false,
  feePctByTier,
  onUpgrade,
}: PricingTierModalProps) {
  const upgrade = nextTier(currentTier)
  const hasOnDemand = (onDemandRows?.length ?? 0) > 0
  const [tab, setTab] = React.useState<'bulk' | 'ondemand'>('bulk')
  const activeRows = tab === 'ondemand' ? onDemandRows ?? [] : rows
  const matchedRow = findRowForQuantity(activeRows, currentQuantity)
  const perTier = Boolean(feePctByTier)
  const pct = (t: TierKey): number => (feePctByTier ? feePctByTier[t] : 0)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-pink-700 hover:text-pink-600 transition-colors">
          <BarChart3 strokeWidth={2} className="w-3.5 h-3.5" />
          See pricing by tier
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <div className="p-6 pb-4 border-b border-ink-200">
          <DialogTitle className="font-display text-xl font-bold tracking-[-0.01em] text-ink-900">
            Pricing by tier
          </DialogTitle>
          <div className="text-sm font-normal text-ink-500 mt-1">
            {productName}
            {variantName && ` · ${variantName}`}
          </div>
          {hasOnDemand && (
            <div className="mt-3 inline-flex gap-0.5 rounded-lg bg-ink-100 p-0.5">
              <button
                onClick={() => setTab('bulk')}
                className={cn('rounded-md px-3.5 py-1.5 text-[12px] font-semibold transition-colors', tab === 'bulk' ? 'bg-white text-pink-700 shadow-sm' : 'text-ink-600')}
              >
                Bulk
              </button>
              <button
                onClick={() => setTab('ondemand')}
                className={cn('rounded-md px-3.5 py-1.5 text-[12px] font-semibold transition-colors', tab === 'ondemand' ? 'bg-white text-pink-700 shadow-sm' : 'text-ink-600')}
              >
                On-demand
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                <th className="text-left px-6 py-3">Quantity</th>
                {perTier ? (
                  TIER_ORDER.map((t) => (
                    <th key={t} className={cn('text-right px-5 py-3', t === currentTier && 'text-pink-700')}>
                      {TIER_LABEL[t]}
                      <span className="block text-[9px] font-medium normal-case tracking-normal text-ink-400">{pct(t)}% fee</span>
                    </th>
                  ))
                ) : (
                  <th className="text-right px-6 py-3">Per unit</th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeRows.map((row) => {
                const isMatch = matchedRow?.band === row.band
                return (
                  <tr key={row.band} className={cn('border-b border-ink-100 last:border-b-0 hover:bg-ink-50/50', isMatch && 'bg-pink-50/50')}>
                    <td className="px-6 py-3 text-ink-700">
                      {row.band}
                      {isMatch && <span className="ml-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-pink-700">your qty</span>}
                    </td>
                    {perTier ? (
                      TIER_ORDER.map((t) => (
                        <td key={t} className={cn('text-right px-5 py-3 font-mono tabular-nums', t === currentTier ? 'font-semibold text-ink-900' : 'text-ink-600')}>
                          {fmt(withFee(baseCents(row), pct(t)) / 100)}
                        </td>
                      ))
                    ) : (
                      <td className={cn('text-right px-6 py-3 font-mono tabular-nums', isMatch ? 'font-semibold text-ink-900' : 'text-ink-900')}>
                        {fmt(row.perUnitCents / 100)}
                      </td>
                    )}
                  </tr>
                )
              })}
              {activeRows.length === 0 && (
                <tr><td colSpan={perTier ? 4 : 2} className="px-6 py-6 text-center text-[12px] text-ink-500">No {tab === 'ondemand' ? 'on-demand' : 'bulk'} pricing for this product.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-ink-200 bg-cream text-[13px] text-ink-700 space-y-1.5">
          {matchedRow && (
            <div>
              At {currentQuantity.toLocaleString()} units ·{' '}
              <strong>{fmt(withFee(baseCents(matchedRow), pct(currentTier)) / 100)}/unit</strong> at your{' '}
              <strong className="text-ink-900">{TIER_LABEL[currentTier]}</strong> tier
            </div>
          )}
          <div className="text-ink-600">
            {isAuthenticated ? (
              <>Unit cost is the same across tiers — {upgrade ? (<><strong className="text-ink-900">{TIER_LABEL[upgrade]}</strong> pays a lower platform fee, so its all-in price is lower.</>) : 'Agency pays the lowest platform fee.'}</>
            ) : (
              <><strong className="text-ink-900">Sign in</strong> to see which tier you&apos;re priced at.</>
            )}
          </div>
          <div className="text-ink-500 text-[12px]">
            Production shipping isn&apos;t included — it&apos;s estimated at checkout based on quantity and destination.
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-ink-200">
          <button type="button" className="text-sm font-medium text-ink-600 hover:text-ink-900 px-3 py-2" data-radix-dialog-close="">
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
