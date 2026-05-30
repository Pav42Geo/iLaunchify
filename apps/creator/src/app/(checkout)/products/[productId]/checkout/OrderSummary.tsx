'use client'

// Phase G1 + G3 + R8.c — sticky Order Summary, right-rail of the wizard.
//
// G1 shipped the layout with $—.—— placeholders. G3 wires in the live
// CostBreakdown from estimateProductionCost so the totals are real cents
// the moment a quantity is entered. R8.c adds the Subscribe & save
// "Coming soon" stub that renders only on Step 2 per Pavel's spec.
//
// Shipping + tax remain placeholders here — they land in G4 (fulfillment
// + carrier rates) and G5 (tax computation at My cart).

import Link from 'next/link'
import { Lock, Repeat } from 'lucide-react'
import type { CheckoutDraftState, WizardStepIndex } from './types'
import type { CostBreakdown } from './production-actions'

interface Props {
  state: CheckoutDraftState
  estimate: CostBreakdown | null
  // G4d — shipping cents from the wizard's lifted estimateShipping state.
  // Null until the user has picked a ship-to mode.
  shipping: { shippingCents: number; leadTimeBusinessDays: number } | null
  // R8.c — which step are we on? Drives the contextual hints rendered
  // above the totals (Subscribe stub on Step 2, summary on Step 3, etc.).
  currentStep?: WizardStepIndex
  // R16.a — pre-resolved feature flag via @ilaunchify/plans' hasFeature()
  // lookup on the server. true = Builder+; false = locked → upgrade hint.
  subscribeAndSaveEnabled?: boolean
}

export function OrderSummary({
  state,
  estimate,
  shipping,
  currentStep,
  subscribeAndSaveEnabled = false,
}: Props) {
  const qty = state.production.quantity ?? 0
  const hasEstimate = !!estimate && estimate.quantity > 0
  const hasShipping = !!shipping && shipping.shippingCents > 0
  const grandTotalCents =
    (estimate?.totalBeforeShippingAndTaxCents ?? 0) + (shipping?.shippingCents ?? 0)
  // G6.c — once the creator accepts the Subscribe & save offer on
  // Step 2, the right-rail flips from upsell-stub to confirmation-readout
  // so the choice stays visible all the way through Step 3 / Pay.
  const subAccepted = state.subscription?.offerAccepted === true

  return (
    <div className="space-y-3">
      {/* Subscribe & save right-rail surfaces:
            - Step 2, not accepted yet → the old "this rail used to live
              here" stub is gone now that we have the full picker in the
              step body. We still render a tiny lock badge for Maker so
              the upgrade affordance shows even when the picker isn't yet
              visible (no qty entered).
            - Any step, accepted → confirmation summary so the creator's
              choice persists into Step 3 visual state. */}
      {subAccepted && state.subscription?.cadence ? (
        <SubscribedSummary
          cadence={state.subscription.cadence}
          runCount={state.subscription.runCount ?? null}
          discountBp={state.subscription.discountBp ?? 0}
        />
      ) : (
        currentStep === 2 &&
        !subscribeAndSaveEnabled && (
          <SubscribeAndSaveStub unlocked={false} />
        )
      )}

      <div
        className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
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
        <Row
          label="Platform fee"
          value={hasEstimate ? formatCents(estimate.platformFeeCents) : '$—.——'}
          dimmed={!hasEstimate}
        />
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

// =============================================================================
// SubscribeAndSaveStub — Step 2 right-rail "Coming soon" upsell (R8.c)
// =============================================================================

function SubscribeAndSaveStub({ unlocked }: { unlocked: boolean }) {
  // R16.a — Subscribe & save now reads its unlock state from the
  // data-driven @ilaunchify/plans layer (resolved server-side in the
  // page loader via hasFeature). Locked = upgrade prompt; unlocked =
  // live (still-coming-soon) waitlist card. Copy and CTA target swap
  // accordingly. Admin can toggle the feature row in /admin/tiers
  // without a redeploy.
  return (
    <div className="rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50/80 to-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-700"
        >
          <Repeat className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[12.5px] font-semibold text-ink-900">
              Subscribe &amp; save
            </p>
            {unlocked ? (
              <span className="rounded-full bg-ink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-ink-600">
                Soon
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-pink-700">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                Builder
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-600">
            {unlocked
              ? "Lock in a recurring production cadence and save up to 12% on every run. We'll re-route automatically as your forecast grows."
              : 'Upgrade to Builder to lock in a recurring cadence and save up to 12% on every run.'}
          </p>
          {unlocked ? (
            <button
              type="button"
              disabled
              className="mt-2.5 inline-flex cursor-not-allowed items-center rounded-full border border-ink-200 bg-white px-3 py-1 text-[11px] font-medium text-ink-400"
            >
              Join the waitlist
            </button>
          ) : (
            <Link
              href="/pricing?tier=builder"
              className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-pink-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
            >
              Upgrade to Builder
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// SubscribedSummary — confirmation readout once the offer is accepted (G6.c)
// =============================================================================

function SubscribedSummary({
  cadence,
  runCount,
  discountBp,
}: {
  cadence: 'MONTHLY' | 'QUARTERLY'
  runCount: number | null
  discountBp: number
}) {
  const cadenceLabel = cadence === 'QUARTERLY' ? 'every 3 months' : 'every month'
  const runsLabel = runCount ? `${runCount} runs` : 'open-ended'
  const pctOff = (discountBp / 100).toFixed(0)
  return (
    <div className="rounded-xl border border-pink-300 bg-gradient-to-br from-pink-50/80 to-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-pink-500 text-white"
        >
          <Repeat className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[12.5px] font-semibold text-ink-900">
              Subscribed
            </p>
            <span className="rounded-full bg-emerald-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">
              {pctOff}% off
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-700">
            {cadenceLabel} · {runsLabel}
          </p>
          <p className="mt-2 text-[11px] text-ink-500">
            First charge with this order. Recurring billing begins after this
            run lands. Manage from your account anytime.
          </p>
        </div>
      </div>
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
