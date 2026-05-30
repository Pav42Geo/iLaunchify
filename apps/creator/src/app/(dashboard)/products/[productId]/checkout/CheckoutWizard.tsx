'use client'

// Phase G1 — checkout wizard shell.
//
// Horizontal stepper across the top, two-column body: active step on the
// left, sticky Order Summary on the right (Vistaprint pattern). Next /
// Back navigation auto-saves the draft on every transition.
//
// Step content is stubbed in G1; G2-G7 fill each one in. The wizard does
// NOT take payment here — payment lands in G5 when the My cart step ships.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, RefreshCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  WIZARD_STEPS,
  LAST_STEP_INDEX,
  type CheckoutDraftState,
  type WizardStepIndex,
} from './types'
import { saveCheckoutDraft, discardCheckoutDraft } from './actions'
import { ReviewStep } from './steps/ReviewStep'
import { ProductionStep } from './steps/ProductionStep'
// R8.a · CheckoutStep is the merged Fulfillment + Cart for the new
// final step. R8.d will fill in the full Amazon-style merge; for now
// the existing CartStep stands in.
import { CartStep as CheckoutStep } from './steps/CartStep'
import { OrderSummary } from './OrderSummary'
import type { CostBreakdown } from './production-actions'
import type { ReviewSnapshot } from './review-actions'

interface Props {
  productId: string
  productName: string
  brandName: string
  // Server-loaded draft state — empty defaults when no draft exists.
  initialState: CheckoutDraftState
  initialStep: WizardStepIndex
  initialCompletedSteps: WizardStepIndex[]
  hadExistingDraft: boolean
  // G2 — server-loaded snapshot of the latest DesignVersion + checklist scan.
  reviewSnapshot: ReviewSnapshot
}

export function CheckoutWizard({
  productId,
  productName,
  brandName,
  initialState,
  initialStep,
  initialCompletedSteps,
  hadExistingDraft,
  reviewSnapshot,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<CheckoutDraftState>(initialState)
  const [currentStep, setCurrentStep] = useState<WizardStepIndex>(initialStep)
  const [completedSteps, setCompletedSteps] = useState<WizardStepIndex[]>(
    initialCompletedSteps,
  )
  // G3 — lifted from ProductionStep so the right-rail OrderSummary can
  // render real cents instead of placeholders. Null until the user has
  // entered a quantity (or while the estimate is in-flight).
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)
  // G4d — same idea for shipping. Null until the user has picked a
  // ship-to mode in step 4.
  const [shipping, setShipping] = useState<{
    shippingCents: number
    leadTimeBusinessDays: number
  } | null>(null)
  const [isSaving, startSaving] = useTransition()

  function patchState<K extends keyof CheckoutDraftState>(
    key: K,
    patch: Partial<CheckoutDraftState[K]>,
  ) {
    setState((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as object), ...patch },
    }))
  }

  function persist(nextStep: WizardStepIndex, nextCompleted: WizardStepIndex[]) {
    startSaving(async () => {
      const result = await saveCheckoutDraft({
        productId,
        state,
        currentStep: nextStep,
        completedSteps: nextCompleted,
      })
      if (!result.ok) toast.error(result.error)
    })
  }

  function goNext() {
    const next = Math.min(LAST_STEP_INDEX, currentStep + 1) as WizardStepIndex
    const nextCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep].sort((a, b) => a - b)
    setCompletedSteps(nextCompleted)
    setCurrentStep(next)
    persist(next, nextCompleted)
  }

  function goBack() {
    const prev = Math.max(1, currentStep - 1) as WizardStepIndex
    setCurrentStep(prev)
    persist(prev, completedSteps)
  }

  function jumpTo(idx: WizardStepIndex) {
    // Don't let the user jump forward past completed steps — they have
    // to go through Next so the draft validates step-by-step.
    if (idx > currentStep && !completedSteps.includes((idx - 1) as WizardStepIndex)) {
      return
    }
    setCurrentStep(idx)
    persist(idx, completedSteps)
  }

  async function startFresh() {
    if (!confirm('Discard your in-progress checkout for this product?')) return
    startSaving(async () => {
      const result = await discardCheckoutDraft(productId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  const isAdjustment = Boolean(state.isAdjustmentForOrderId)

  // G2 — step 1 Next is gated on all three reviewer sign-offs. Other
  // steps don't have an inline gate (validation lives in step content +
  // the final placeOrder server action).
  const reviewAcksComplete =
    state.review.ackDesignFinal &&
    state.review.ackProductionReady &&
    state.review.ackComplianceReviewed
  const isNextDisabled =
    isSaving || (currentStep === 1 && !reviewAcksComplete)

  return (
    <div className="min-h-screen bg-ink-50">
      {/* H3.1 — adjust-mode banner */}
      {isAdjustment && (
        <div className="border-b border-amber-300 bg-amber-50 px-6 py-2.5">
          <div className="mx-auto flex max-w-6xl items-start gap-2.5">
            <RefreshCcw className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-800" />
            <div className="flex-1 text-[12.5px] text-amber-900">
              <span className="font-semibold">
                Adjusting order #{state.isAdjustmentForOrderId?.slice(-8)}
              </span>{' '}
              — only partner gates affected by your changes will need to
              re-accept. Acceptances that aren&apos;t affected stay valid.
            </div>
            <Link
              href={`/orders/${state.isAdjustmentForOrderId}`}
              className="text-[11px] font-medium text-amber-900 underline hover:text-amber-700"
            >
              Cancel adjustment
            </Link>
          </div>
        </div>
      )}

      {/* Sticky checkout header — brand + product on the left, stepper
          centered, save-state on the right. Replaces the older two-row
          stack so the body owns more of the viewport. */}
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link
            href={`/products/${productId}`}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-ink-100"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Link>
          <div className="min-w-0 flex-shrink-0 border-l border-ink-200 pl-3">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-500">
              {brandName}
            </div>
            <div className="truncate text-sm font-medium text-ink-900">
              {productName}
            </div>
          </div>

          {/* In-header stepper. With 3 steps we have room to anchor it
              in the middle of the chrome row rather than below it. */}
          <ol
            aria-label="Checkout progress"
            className="hidden flex-1 items-center justify-center gap-1.5 md:flex"
          >
            {WIZARD_STEPS.map((step, i) => {
              const isCurrent = step.index === currentStep
              const isComplete = completedSteps.includes(step.index)
              const isClickable = isComplete || step.index <= currentStep
              return (
                <li key={step.key} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => jumpTo(step.index)}
                    disabled={!isClickable}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={
                      'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                      (isCurrent
                        ? 'bg-pink-50 text-pink-700'
                        : isClickable
                          ? 'text-ink-700 hover:bg-ink-100'
                          : 'cursor-not-allowed text-ink-400')
                    }
                  >
                    <span
                      className={
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] font-semibold ' +
                        (isCurrent
                          ? 'bg-pink-500 text-white'
                          : isComplete
                            ? 'bg-emerald-600 text-white'
                            : 'bg-ink-100 text-ink-500')
                      }
                    >
                      {isComplete ? <Check className="h-3 w-3" /> : step.index}
                    </span>
                    {step.label}
                  </button>
                  {i < WIZARD_STEPS.length - 1 && (
                    <span className="h-px w-6 bg-ink-200" aria-hidden="true" />
                  )}
                </li>
              )
            })}
          </ol>

          {/* Mobile fallback — show current/total instead of all chips. */}
          <div className="flex flex-1 justify-center text-[12px] text-ink-500 md:hidden">
            Step {currentStep} of {LAST_STEP_INDEX}
          </div>

          <div className="flex-shrink-0 text-[11.5px] text-ink-500">
            {isSaving ? 'Saving…' : hadExistingDraft ? 'Draft restored' : 'New checkout'}
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr,360px]">
        {/* Active step */}
        <section className="min-w-0">
          {currentStep === 1 && (
            <ReviewStep
              productId={productId}
              state={state.review}
              onChange={(patch) => patchState('review', patch)}
              snapshot={reviewSnapshot}
            />
          )}
          {currentStep === 2 && (
            <ProductionStep
              productId={productId}
              state={state.production}
              onChange={(patch) => patchState('production', patch)}
              onEstimate={setEstimate}
            />
          )}
          {currentStep === 3 && (
            // R8.a — last step. R8.d will swap this for a merged
            // Fulfillment + Cart Amazon-style layout; for now CartStep
            // (aliased above) stands in.
            <CheckoutStep
              productId={productId}
              state={state.cart}
              draft={state}
              onChange={(patch) => patchState('cart', patch)}
            />
          )}

          {/* Nav */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-ink-200 pt-5">
            {hadExistingDraft && currentStep === 1 ? (
              <button
                type="button"
                onClick={startFresh}
                disabled={isSaving}
                className="text-xs font-medium text-ink-500 hover:text-pink-600"
              >
                Start fresh instead
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={currentStep === 1 || isSaving}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              {currentStep < LAST_STEP_INDEX ? (
                <div className="flex items-center gap-2">
                  {currentStep === 1 && !reviewAcksComplete && (
                    <span className="text-[11px] text-ink-500">
                      Approve the design to continue
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={isNextDisabled}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-black disabled:opacity-40"
                  >
                    {currentStep === 1 ? 'Continue to production' : 'Continue to checkout'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                // Step 3 owns its own Place-order CTA (CheckoutStep
                // renders the Stripe button). No wizard-level next here.
                <span className="text-[11px] text-ink-500">
                  Use the Place order button below
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Sticky right rail — top offset matches the single-row
            checkout header height (R8.a). */}
        <aside className="lg:sticky lg:top-[80px] lg:self-start">
          <OrderSummary state={state} estimate={estimate} shipping={shipping} />
        </aside>
      </main>
    </div>
  )
}
