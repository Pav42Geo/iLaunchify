'use client'

// Phase G1 + G3 — sticky Order Summary, right-rail of the wizard.
//
// G1 shipped the layout with $—.—— placeholders. G3 wires in the live
// CostBreakdown from estimateProductionCost so the totals are real cents
// the moment a quantity is entered.
//
// Shipping + tax remain placeholders here — they land in G4 (fulfillment
// + carrier rates) and G5 (tax computation at My cart).

import type { CheckoutDraftState } from './types'
import type { CostBreakdown } from './production-actions'

interface Props {
  state: CheckoutDraftState
  estimate: CostBreakdown | null
}

export function OrderSummary({ state, estimate }: Props) {
  const qty = state.production.quantity ?? 0
  const hasEstimate = !!estimate && estimate.quantity > 0
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
        Order summary
      </h2>

      <dl className="space-y-2 text-sm">
        <Row
          label={`Label printing${qty ? ` × ${qty}` : ''}`}
          value={
            hasEstimate
              ? formatCents(estimate.labelUnitCents * estimate.quantity)
              : '$—.——'
          }
          dimmed={!hasEstimate}
        />
        <Row
          label={`Packaging${qty ? ` × ${qty}` : ''}`}
          value={
            hasEstimate
              ? formatCents(estimate.packagingUnitCents * estimate.quantity)
              : '$—.——'
          }
          dimmed={!hasEstimate || !state.production.packagingMaterialSlug}
        />
        <Row
          label={`Finishes${
            state.production.finishPartnerFinishIds.length
              ? ` (${state.production.finishPartnerFinishIds.length})`
              : ''
          }`}
          value={
            hasEstimate
              ? formatCents(
                  estimate.finishUnitCents * estimate.quantity + estimate.setupCents,
                )
              : '$—.——'
          }
          dimmed={state.production.finishPartnerFinishIds.length === 0}
        />
        <Row
          label="Platform fee"
          value={hasEstimate ? formatCents(estimate.platformFeeCents) : '$—.——'}
          dimmed={!hasEstimate}
        />
        <Row label="Shipping" value="$—.——" dimmed={!state.fulfillment.shipToType} />
        <Row label="Tax" value="$—.——" dimmed />
      </dl>

      <div className="my-4 h-px bg-ink-100" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-900">
          {hasEstimate ? 'Before ship + tax' : 'Total'}
        </span>
        <span className="text-lg font-bold text-ink-900 tabular-nums">
          {hasEstimate
            ? formatCents(estimate.totalBeforeShippingAndTaxCents)
            : '$—.——'}
        </span>
      </div>

      <p className="mt-3 text-[11px] text-ink-500">
        {hasEstimate
          ? 'Shipping + tax calculate in step 4 + step 7.'
          : 'Live cost lights up once you pick a quantity in step 2.'}
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  dimmed,
}: {
  label: string
  value: string
  dimmed?: boolean
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-2 ' +
        (dimmed ? 'text-ink-400' : 'text-ink-700')
      }
    >
      <dt className="truncate">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
