'use client'

// TierUpgradeModal — the single, shared upgrade surface for tier-gated creator
// features. Presentational + data-driven: the comparison table is the canonical
// one from tier-upgrade-data.ts; the caller passes a small `feature` describing
// the gate (eyebrow, headline, the "Unlocks XXX" tag, spotlighted row, CTA verb).
//
// Two-plan chooser on the left + benefit comparison on the right (Canva-style),
// styled to the iLaunchify system (pink #FF2E63 accents on light, black pill CTA,
// Bricolage display / Fraunces italic emphasis).
//
// Self-managed body portal at z-[120]/[130] — same reliable pattern as
// PricingTierModal (Radix's default z-index sat under the sticky header).

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  CREATOR_PLAN_ORDER,
  CREATOR_UPGRADE_ROWS,
  buildUpgradePlans,
  feeRowValues,
  type CreatorPlanKey,
  type CreatorTierPricingInput,
  type UpgradeFeature,
} from './tier-upgrade-data'

export interface TierUpgradeModalProps {
  open: boolean
  onClose: () => void
  /** The gate framing — the only thing that differs between features. */
  feature: UpgradeFeature
  /** Viewer's current tier (default 'maker'). Upgrade options are the tiers above it. */
  currentTier?: CreatorPlanKey
  /** CTA target (default '/settings/plan'). Rendered as a full-navigation link. */
  manageHref?: string
  /** Optional click handler; when set the CTA calls it instead of navigating. */
  onUpgrade?: (planKey: CreatorPlanKey) => void
  /**
   * Live tier pricing (from @ilaunchify/plans resolveCreatorTierPricing, resolved
   * in a server component). When omitted, the static seed-mirror values are used.
   */
  pricing?: CreatorTierPricingInput
}

function Cell({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-pink-600" strokeWidth={2.5} aria-label="Included" />
  if (value === false) return <span className="text-ink-300" aria-label="Not included">—</span>
  return <span className="font-bold tabular-nums text-ink-900">{value}</span>
}

export function TierUpgradeModal({
  open,
  onClose,
  feature,
  currentTier = 'maker',
  manageHref = '/settings/plan',
  onUpgrade,
  pricing,
}: TierUpgradeModalProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Live-or-static plan display + fee-row values (single source of truth).
  const plans = React.useMemo(() => buildUpgradePlans(pricing), [pricing])
  const feeValues = React.useMemo(() => feeRowValues(pricing), [pricing])

  // Upgrade options = every tier strictly above the current one.
  const currentIdx = CREATOR_PLAN_ORDER.indexOf(currentTier)
  const upgradeKeys = CREATOR_PLAN_ORDER.slice(currentIdx + 1)

  const [selected, setSelected] = React.useState<CreatorPlanKey>(feature.requiredTier)
  React.useEffect(() => {
    // Keep the recommended plan pre-selected whenever the gate changes.
    setSelected(feature.requiredTier)
  }, [feature.requiredTier])

  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  const selectedPlan = plans[selected]
  const ctaLabel = `Upgrade to ${selectedPlan.name}${feature.ctaSuffix ? ` ${feature.ctaSuffix}` : ''} →`

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      {/* Scrim */}
      <div onClick={onClose} className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade your plan"
        className="relative z-[130] grid w-full max-w-[1000px] grid-cols-1 overflow-hidden rounded-[var(--radius-lg)] border border-ink-200 bg-[var(--bg-surface)] shadow-xl md:grid-cols-[minmax(0,400px)_1fr]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-ink-200 bg-white text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>

        {/* LEFT — plan chooser */}
        <section className="border-b border-ink-100 px-8 pb-7 pt-10 md:border-b-0 md:border-r">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-pink-100 bg-pink-50 px-3 py-1.5 text-[12px] font-bold tracking-[0.01em] text-pink-700">
            {feature.eyebrow}
          </span>

          <h2 className="mt-4 font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink-900">
            {feature.title}{' '}
            {feature.emphasis && (
              <span className="font-serif italic font-semibold text-pink-600">{feature.emphasis}</span>
            )}
          </h2>
          <p className="mb-5 mt-2 text-[14.5px] leading-relaxed text-ink-500">{feature.subtitle}</p>

          <div className="space-y-3">
            {upgradeKeys.map((key) => {
              const plan = plans[key]
              const isSel = selected === key
              const recommended = key === feature.requiredTier
              const tag = recommended ? feature.unlocksLabel : plan.defaultTag
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border-[1.5px] bg-white p-4 text-left transition',
                    isSel ? 'border-pink-500 ring-[3px] ring-pink-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border-2 transition',
                      isSel ? 'border-pink-500' : 'border-ink-300',
                    )}
                  >
                    {isSel && <span className="h-2.5 w-2.5 rounded-full bg-pink-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="text-[16px] font-extrabold tracking-[-0.01em] text-ink-900">{plan.name}</b>
                      {tag && (
                        <span
                          className={cn(
                            'rounded-pill px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.03em]',
                            recommended ? 'bg-pink-500 text-white' : 'bg-ink-100 text-ink-600',
                          )}
                        >
                          {tag}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-500">
                      {plan.price && <strong className="text-ink-900">{plan.price}</strong>}
                      {plan.priceSub}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {onUpgrade ? (
            <button
              type="button"
              onClick={() => onUpgrade(selected)}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-ink-900 px-4 py-3.5 text-[15px] font-bold text-white transition hover:-translate-y-px hover:bg-black"
            >
              {ctaLabel}
            </button>
          ) : (
            <a
              href={manageHref}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-ink-900 px-4 py-3.5 text-[15px] font-bold text-white transition hover:-translate-y-px hover:bg-black"
            >
              {ctaLabel}
            </a>
          )}
          <p className="mt-3 px-1 text-center text-[12px] leading-relaxed text-ink-400">
            Change or cancel anytime from Plan &amp; billing. Upgrades are prorated — you keep every
            brand, product, and order.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mx-auto mt-3 block text-[13.5px] font-semibold text-ink-500 transition-colors hover:text-ink-900"
          >
            Maybe later
          </button>
        </section>

        {/* RIGHT — benefits comparison */}
        <section className="px-8 pb-7 pt-9">
          <h3 className="font-display text-[16px] font-bold text-ink-900">What each plan unlocks</h3>
          <p className="mb-4 text-[13px] text-ink-500">
            The unit cost of production is the same on every plan — higher tiers pay a lower platform
            fee and unlock more.
          </p>

          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th className="border-b border-ink-200 pb-3 pr-2 text-left text-[12px] font-extrabold uppercase tracking-[0.05em] text-ink-700">
                  Benefit
                </th>
                {CREATOR_PLAN_ORDER.map((key) => {
                  const plan = plans[key]
                  const isSel = key === selected
                  return (
                    <th
                      key={key}
                      className={cn(
                        'border-b pb-3 text-center text-[12px] font-extrabold uppercase tracking-[0.05em]',
                        isSel ? 'border-pink-100 bg-pink-50 text-pink-700' : 'border-ink-200 text-ink-700',
                        plan.isCurrent && 'text-ink-400',
                      )}
                    >
                      {plan.name}
                      <small
                        className={cn(
                          'mt-0.5 block text-[10.5px] font-semibold normal-case tracking-normal',
                          isSel ? 'text-pink-400' : 'text-ink-400',
                        )}
                      >
                        {plan.columnCaption}
                      </small>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {CREATOR_UPGRADE_ROWS.map((row) => {
                const spotlight = row.key === feature.highlightKey
                return (
                  <tr
                    key={row.key}
                    className={cn('border-b border-ink-100 last:border-b-0', spotlight && 'bg-gradient-to-r from-pink-50 to-transparent')}
                  >
                    <td className={cn('py-2.5 pr-2 text-left text-ink-700', spotlight && 'font-semibold text-ink-900')}>
                      {row.label}
                      {spotlight && (
                        <span className="mt-0.5 block text-[11.5px] font-medium text-pink-700">{feature.why}</span>
                      )}
                    </td>
                    {CREATOR_PLAN_ORDER.map((key) => {
                      const isSel = key === selected
                      const isCurrent = plans[key].isCurrent
                      // Fee row reads live percentages; everything else is the row's own value.
                      const value = row.key === 'fee' ? feeValues[key] : row.values[key]
                      return (
                        <td
                          key={key}
                          className={cn(
                            'py-2.5 text-center',
                            isSel && 'bg-pink-50/60',
                            isCurrent && 'text-ink-400',
                          )}
                        >
                          {isCurrent && typeof value !== 'boolean' ? (
                            <span className="font-bold tabular-nums text-ink-400">{value}</span>
                          ) : (
                            <Cell value={value} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>,
    document.body,
  )
}
