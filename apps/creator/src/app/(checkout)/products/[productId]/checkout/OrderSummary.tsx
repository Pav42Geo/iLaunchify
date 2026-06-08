'use client'

// Phase G1 + G3 + G6.c-cleanup — sticky Order Summary, right-rail of
// the wizard.
//
// G1 shipped the layout with $—.—— placeholders. G3 wires in the live
// CostBreakdown from estimateProductionCost so the totals are real cents
// the moment a quantity is entered.
//
// History — R8.c added a "Subscribe & save" upsell stub here when the
// picker was still a placeholder. Now that G6.c ships the full picker
// inline in Step 2's body, the right-rail stub was redundant
// (lock-badge dupe under the cards) and was removed on 2026-05-30 per
// Pavel. The SubscribedSummary readout still renders here once the
// offer is accepted, so the creator's choice stays visible into Step 3.
//
// Shipping + tax remain placeholders here — they land in G4 (fulfillment
// + carrier rates) and G5 (tax computation at My cart).

import type { CheckoutDraftState, WizardStepIndex } from './types'
import type { CostBreakdown } from './production-actions'

interface Props {
  state: CheckoutDraftState
  estimate: CostBreakdown | null
  // G4d — shipping cents from the wizard's lifted estimateShipping state.
  // Null until the user has picked a ship-to mode.
  shipping: { shippingCents: number; leadTimeBusinessDays: number } | null
  // Reserved for future step-specific hints in the right rail. Kept on
  // the API even after the Subscribe stub was removed so wizard callers
  // don't need a follow-up patch.
  currentStep?: WizardStepIndex
}

export function OrderSummary({
  state,
  estimate,
  shipping,
  currentStep: _currentStep,
}: Props) {
  const qty = state.production.quantity ?? 0
  const hasEstimate = !!estimate && estimate.quantity > 0
  const hasShipping = !!shipping && shipping.shippingCents > 0
  // G6.c — once the creator accepts the Subscribe & save offer on
  // Step 2, the right-rail surfaces both a savings line and a
  // confirmation readout so the choice stays visible into Step 3.
  const subAccepted = state.subscription?.offerAccepted === true
  // Per Pavel 2026-05-30 — the subscription savings appears as a
  // negative line item in the breakdown and the Builder/platform fee
  // line recalculates against the discounted subtotal. Discount is
  // basis points (e.g. 800 = 8%), applied to the pre-ship subtotal.
  const subscriptionDiscountBp =
    subAccepted ? state.subscription?.discountBp ?? 0 : 0
  const subscriptionSavingsCents =
    hasEstimate && subscriptionDiscountBp > 0
      ? Math.round(
          (estimate.totalBeforeShippingAndTaxCents * subscriptionDiscountBp) /
            10_000,
        )
      : 0
  const subtotalAfterSavingsCents =
    (estimate?.totalBeforeShippingAndTaxCents ?? 0) - subscriptionSavingsCents
  const grandTotalCents =
    subtotalAfterSavingsCents + (shipping?.shippingCents ?? 0)

  return (
    <div className="space-y-3">
      {/* SubscribedSummary readout removed 2026-06-01 per Pavel —
          redundant with the Subscribe & Save card in the rail above
          (which already shows the cadence, runs, and discount). The
          OrderSummary just owns the price breakdown now. */}
      <div
        className="rounded-2xl border border-ink-200 bg-white p-5"
        aria-labelledby="order-summary-heading"
      >
      {/* R9.b — h3 keeps StepShell's h1 and CheckoutStep's h2 sections
          above this summary block in the document outline. */}
      <h3
        id="order-summary-heading"
        className="mb-3 text-[10.5px] font-semibold uppercase tracking-widest text-ink-500"
      >
        Order summary
      </h3>

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
        {hasEstimate && estimate.decorationUnitCents > 0 && (
          <Row
            label={`Decoration${
              estimate.decorationMethod
                ? ` (${formatDecorationMethod(estimate.decorationMethod)})`
                : ''
            }${qty ? ` × ${qty}` : ''}`}
            value={formatCents(estimate.decorationUnitCents * estimate.quantity)}
          />
        )}
        {hasEstimate && estimate.componentsUnitCents > 0 && (
          <Row
            label={`Component upgrades${qty ? ` × ${qty}` : ''}`}
            value={formatCents(estimate.componentsUnitCents * estimate.quantity)}
          />
        )}
        <Row
          label="Platform fee"
          value={hasEstimate ? formatCents(estimate.platformFeeCents) : '$—.——'}
          dimmed={!hasEstimate}
        />
        {subAccepted && subscriptionSavingsCents > 0 && (
          <Row
            label={`Subscription savings (${(subscriptionDiscountBp / 100).toFixed(0)}%)`}
            value={`−${formatCents(subscriptionSavingsCents)}`}
            tone="savings"
          />
        )}
        <Row
          label="Shipping"
          value={hasShipping ? formatCents(shipping.shippingCents) : '$—.——'}
          dimmed={!hasShipping}
        />
        <Row label="Tax" value="$—.——" dimmed />
      </dl>

      <div className="my-4 h-px bg-ink-100" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-900">
          {hasShipping ? 'Before tax' : hasEstimate ? 'Before ship + tax' : 'Total'}
        </span>
        <span className="text-lg font-bold text-ink-900 tabular-nums">
          {hasEstimate ? formatCents(grandTotalCents) : '$—.——'}
        </span>
      </div>

      <p className="mt-3 text-[11px] text-ink-500">
        {hasShipping && shipping.leadTimeBusinessDays > 0
          ? `Lead time: ~${shipping.leadTimeBusinessDays} business days. Tax calculates at Checkout.`
          : hasEstimate
            ? 'Pick a ship-to at Checkout to add shipping. Tax calculates there too.'
            : 'Live cost lights up once you pick a quantity in step 2.'}
      </p>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  dimmed,
  tone,
}: {
  label: string
  value: string
  dimmed?: boolean
  /** Optional emphasis. 'savings' = emerald green for negative discount lines. */
  tone?: 'savings'
}) {
  const colorClass =
    tone === 'savings'
      ? 'text-emerald-700 font-semibold'
      : dimmed
        ? 'text-ink-400'
        : 'text-ink-700'
  return (
    <div className={'flex items-center justify-between gap-2 ' + colorClass}>
      <dt className="truncate">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// C8.2 — turn a DecorationMethod enum value (DIRECT_PRINT) into a readable
// label ("Direct print") for the Order Summary line.
function formatDecorationMethod(method: string): string {
  const lower = method.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
