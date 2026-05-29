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
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  WIZARD_STEPS,
  type CheckoutDraftState,
  type WizardStepIndex,
} from './types'
import { saveCheckoutDraft, discardCheckoutDraft } from './actions'
import { ReviewStep } from './steps/ReviewStep'
import { ProductionStep } from './steps/ProductionStep'
import { SubscriptionStep } from './steps/SubscriptionStep'
import { FulfillmentStep } from './steps/FulfillmentStep'
import { AccessoriesStep } from './steps/AccessoriesStep'
import { ViralStep } from './steps/ViralStep'
import { CartStep } from './steps/CartStep'
import { OrderSummary } from './OrderSummary'
import type { CostBreakdown } from './production-actions'

interface Props {
  productId: string
  productName: string
  brandName: string
  // Server-loaded draft state — empty defaults when no draft exists.
  initialState: CheckoutDraftState
  initialStep: WizardStepIndex
  initialCompletedSteps: WizardStepIndex[]
  hadExistingDraft: boolean
}

export function CheckoutWizard({
  productId,
  productName,
  brandName,
  initialState,
  initialStep,
  initialCompletedSteps,
  hadExistingDraft,
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
    const next = Math.min(7, currentStep + 1) as WizardStepIndex
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

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/products/${productId}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-600 hover:bg-ink-100"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Link>
          <div className="ml-2 border-l border-ink-200 pl-3">
            <div className="text-xs text-ink-500">{brandName}</div>
            <div className="text-sm font-medium text-ink-900">{productName}</div>
          </div>
        </div>

        <div className="text-xs text-ink-500">
          {isSaving ? 'Saving…' : hadExistingDraft ? 'Draft restored' : 'New checkout'}
        </div>
      </header>

      {/* Stepper */}
      <div className="border-b border-ink-200 bg-white px-6 py-4">
        <ol className="mx-auto flex max-w-6xl items-center gap-2">
          {WIZARD_STEPS.map((step, i) => {
            const isCurrent = step.index === currentStep
            const isComplete = completedSteps.includes(step.index)
            const isClickable = isComplete || step.index <= currentStep
            return (
              <li key={step.key} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => jumpTo(step.index)}
                  disabled={!isClickable}
                  className={
                    'group flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ' +
                    (isCurrent
                      ? 'bg-pink-50'
                      : isClickable
                        ? 'hover:bg-ink-50'
                        : 'opacity-50')
                  }
                >
                  <span
                    className={
                      'inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' +
                      (isCurrent
                        ? 'bg-pink-500 text-white'
                        : isComplete
                          ? 'bg-ink-900 text-white'
                          : 'bg-ink-100 text-ink-500')
                    }
                  >
                    {isComplete ? <Check className="h-3 w-3" /> : step.index}
                  </span>
                  <span
                    className={
                      'min-w-0 truncate text-[12.5px] font-medium ' +
                      (isCurrent ? 'text-pink-700' : 'text-ink-700')
                    }
                  >
                    {step.label}
                  </span>
                </button>
                {i < WIZARD_STEPS.length - 1 && (
                  <span className="h-px w-3 flex-shrink-0 bg-ink-200" />
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Body */}
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr,360px]">
        {/* Active step */}
        <section className="min-w-0">
          {currentStep === 1 && (
            <ReviewStep
              productId={productId}
              state={state.review}
              onChange={(patch) => patchState('review', patch)}
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
            <SubscriptionStep
              state={state.subscription}
              onChange={(patch) => patchState('subscription', patch)}
            />
          )}
          {currentStep === 4 && (
            <FulfillmentStep
              state={state.fulfillment}
              onChange={(patch) => patchState('fulfillment', patch)}
            />
          )}
          {currentStep === 5 && (
            <AccessoriesStep
              state={state.accessories}
              onChange={(patch) => patchState('accessories', patch)}
            />
          )}
          {currentStep === 6 && (
            <ViralStep
              state={state.viral}
              onChange={(patch) => patchState('viral', patch)}
            />
          )}
          {currentStep === 7 && (
            <CartStep
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
              {currentStep < 7 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-black"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="rounded-full bg-ink-100 px-4 py-2 text-xs font-medium text-ink-500">
                  Payment ships in G5
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Sticky right rail */}
        <aside className="lg:sticky lg:top-[136px] lg:self-start">
          <OrderSummary state={state} estimate={estimate} />
        </aside>
      </main>
    </div>
  )
}
