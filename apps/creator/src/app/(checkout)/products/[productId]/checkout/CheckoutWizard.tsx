'use client'

// Phase G1 + REBUILD R12 — checkout wizard shell.
//
// R12.d header rewrite (Pavel 2026-05-30):
//   LEFT  · iL pink square + "iLaunchify" wordmark + brand small / product
//           title bold — the exact Studio TopBar pattern.
//   CENTER · "Product Design — Label Design" context line, then the 3-step
//            stepper inline. Flat (no chips / cards), aria-current on
//            the active step, the number dot is the only colored anchor.
//   RIGHT  · Marketplace icon cluster — Heart, Bell (with unread dot),
//            BrandSwitcher (when ≥2 brands), AppHeaderUserMenu, and Cart.
//            Reuses TopbarRight + a sibling Cart IconButton so the right
//            cluster is bit-for-bit consistent with the rest of the app.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Bell,
  Loader2,
  Lock,
  RefreshCcw,
  ShoppingCart,
  LayoutDashboard,
  Layers,
  Package,
  ShoppingBag,
  Plug,
  CreditCard,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { signOut } from 'next-auth/react'
import {
  AppHeaderBrandMark,
  AppHeaderIconButton,
  AppHeaderUserMenu,
} from '@ilaunchify/ui'
import type { TierKey } from '@ilaunchify/auth'
import {
  WIZARD_STEPS,
  LAST_STEP_INDEX,
  type CheckoutDraftState,
  type WizardStepIndex,
} from './types'
import { saveCheckoutDraft, discardCheckoutDraft } from './actions'
import { ReviewStep } from './steps/ReviewStep'
import { ProductionStep } from './steps/ProductionStep'
import { CheckoutStep } from './steps/CheckoutStep'
import { OrderSummary } from './OrderSummary'
import { SubscribeChoiceRail } from './SubscribeChoiceRail'
import { BrandSwitcher, type BrandOption } from '@/components/nav/BrandSwitcher'
import { placeOrderFromCheckoutDraft } from './cart-actions'
import { applyOrderAdjustment } from './adjust-actions'
import type { CostBreakdown } from './production-actions'
import type { ReviewSnapshot } from './review-actions'

interface Props {
  productId: string
  productName: string
  brandName: string
  initialState: CheckoutDraftState
  initialStep: WizardStepIndex
  initialCompletedSteps: WizardStepIndex[]
  hadExistingDraft: boolean
  reviewSnapshot: ReviewSnapshot
  // R12.d — header right-cluster data, pre-loaded server-side in page.tsx.
  headerUser: { email: string; name: string | null }
  headerBrands: BrandOption[]
  headerActiveBrandId: string
  headerHasUnreadNotifications: boolean
  // R14.d — creator subscription tier drives the header tier label.
  creatorTier: TierKey
  // R16.a — server-resolved Subscribe & save gate via @ilaunchify/plans'
  // hasFeature() lookup, so the toggle is data-driven and admin-editable.
  subscribeAndSaveEnabled: boolean
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
  headerUser,
  headerBrands,
  headerActiveBrandId,
  headerHasUnreadNotifications,
  creatorTier,
  subscribeAndSaveEnabled,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<CheckoutDraftState>(initialState)
  const [currentStep, setCurrentStep] = useState<WizardStepIndex>(initialStep)
  const [completedSteps, setCompletedSteps] = useState<WizardStepIndex[]>(
    initialCompletedSteps,
  )
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)
  const [shipping, setShipping] = useState<{
    shippingCents: number
    leadTimeBusinessDays: number
  } | null>(null)
  const [isSaving, startSaving] = useTransition()
  // R8.d-rail-fix — place-order state lifted from CheckoutStep so the
  // pink Place-your-order button can live in the right rail (top of
  // the column on Step 3, matching Amazon's checkout pattern). The
  // CheckoutStep body no longer carries the "Ready to place" panel.
  const [isPaying, startPaying] = useTransition()

  function placeOrder() {
    const ready = isReadyToPay(state)
    if (!ready.ok) {
      toast.error(ready.error)
      return
    }
    const ack = state.cart.complianceAck
    const blockingCount = ack?.blockingFindingIds.length ?? 0
    if (blockingCount > 0 && !ack?.acknowledged) {
      toast.error('Tick the compliance acknowledgement before paying.')
      return
    }
    startPaying(async () => {
      if (state.isAdjustmentForOrderId) {
        const result = await applyOrderAdjustment({ productId, draft: state })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(
          `Adjustment submitted — ${result.data.adjustedDispatchCount} partner gate${
            result.data.adjustedDispatchCount === 1 ? '' : 's'
          } notified.`,
        )
        router.push(`/orders/${state.isAdjustmentForOrderId}`)
        return
      }
      const result = await placeOrderFromCheckoutDraft(productId, {
        complianceAck: ack,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.location.href = result.data.checkoutUrl
    })
  }

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
  const reviewAcksComplete =
    state.review.ackDesignFinal &&
    state.review.ackProductionReady &&
    state.review.ackComplianceReviewed
  const isNextDisabled =
    isSaving || (currentStep === 1 && !reviewAcksComplete)

  return (
    <div className="min-h-screen bg-ink-50">
      {/* H3.1 — adjust-mode banner stays */}
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

      {/* R12.d — Studio-style header.
            LEFT  : iL square + iLaunchify wordmark + brand small / product bold
            CENTER: "Product Design — Label Design" tag + 3-step stepper inline
            RIGHT : Marketplace icon cluster (Heart / Bell / brand switcher /
                    UserMenu / Cart) — pre-loaded server-side. */}
      {/* R12.g — full-width header. Drops the 1400px centered cap so the
          left brand mark + product hugs the viewport left edge and the
          right icon cluster hugs the viewport right edge — exactly like
          the Design Studio's top bar. */}
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="grid h-[73px] grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-6 px-4">
          {/* LEFT — iL brand mark + product context */}
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              aria-label="iLaunchify dashboard"
              className="flex flex-shrink-0 items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 rounded-md"
            >
              <AppHeaderBrandMark />
            </Link>
            <div className="min-w-0 border-l border-ink-200 pl-4">
              <div className="truncate text-[11px] uppercase tracking-[0.06em] text-ink-500">
                {brandName}
              </div>
              <div className="truncate text-[14px] font-semibold text-ink-900">
                {productName}
              </div>
            </div>
          </div>

          {/* CENTER — full path stepper.
              Pre-steps (Product Design + Label Design) render as a check
              + name only — no numbered badge, since the creator already
              completed them upstream (recipe customize + Design Studio).
              The 3 wizard steps keep their numbered/colored-dot pattern
              and remain clickable for jump-back. */}
          <div className="hidden items-center md:flex">
            <ol
              aria-label="Checkout progress"
              className="flex items-center gap-1.5"
            >
              {/* Pre-steps — completed prerequisites, just name + check.
                  Connector lines render as their own <li> so the <ol>
                  contains only valid list items. */}
              <PreStepChip
                href={`/products/${productId}/customize`}
                label="Product Builder"
              />
              <li aria-hidden="true" className="h-px w-5 bg-ink-200" />
              <PreStepChip
                href={`/products/${productId}/design/canvas`}
                label="Packaging Design"
              />
              <li aria-hidden="true" className="h-px w-5 bg-ink-200" />

              {/* Active wizard steps */}
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
                      aria-label={`${step.label}${isComplete ? ' (completed)' : isCurrent ? ' (current)' : ''}`}
                      className={
                        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
                        (isCurrent
                          ? 'text-pink-700'
                          : isClickable
                            ? 'text-ink-700 hover:text-ink-900'
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
                      <span className="h-px w-5 bg-ink-200" aria-hidden="true" />
                    )}
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Mobile fallback for the centre slot */}
          <div
            className="text-center text-[12px] text-ink-500 md:hidden"
            role="status"
            aria-live="polite"
          >
            Step {currentStep} of {LAST_STEP_INDEX}
          </div>

          {/* RIGHT — marketplace icon cluster + cart. Order matches the
              MarketplaceHeader so muscle memory transfers across surfaces. */}
          <div className="flex items-center justify-end gap-1">
            <CheckoutHeaderRight
              user={headerUser}
              brands={headerBrands}
              activeBrandId={headerActiveBrandId}
              hasUnreadNotifications={headerHasUnreadNotifications}
            />
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr,340px]">
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
              productName={productName}
              brandName={brandName}
            />
          )}
          {currentStep === 3 && (
            <CheckoutStep
              productId={productId}
              state={state.cart}
              draft={state}
              onChange={(patch) => patchState('cart', patch)}
              onFulfillmentChange={(patch) => patchState('fulfillment', patch)}
              onShippingEstimate={setShipping}
              productName={productName}
              brandName={brandName}
            />
          )}

          {/* Step 1 "Start fresh" link stays at the bottom of the left
              column — it's an escape hatch, not a primary action. */}
          {hadExistingDraft && currentStep === 1 && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={startFresh}
                disabled={isSaving}
                className="text-xs font-medium text-ink-500 hover:text-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
              >
                Start fresh instead
              </button>
            </div>
          )}
        </section>

        {/* R12.c — sticky right rail. ActionsCard sits ABOVE OrderSummary
            and both ride the viewport together on scroll. The aside is
            the sticky element so the whole column stays visible. */}
        <aside className="space-y-3 lg:sticky lg:top-[89px] lg:self-start">
          {/* ActionsCard rules per step:
              - Step 1 → use ActionsCard (Review has no inline CTA)
              - Step 2 → hidden (SubscribeChoiceRail owns advance)
              - Step 3 → hidden (PlaceOrderCard below owns advance) */}
          {currentStep === 1 && (
            <ActionsCard
              currentStep={currentStep}
              isAdjustment={isAdjustment}
              isSaving={isSaving}
              reviewAcksComplete={reviewAcksComplete}
              isNextDisabled={isNextDisabled}
              onBack={goBack}
              onNext={goNext}
            />
          )}
          {/* R8.d-rail-fix — Step 3 pink Place-your-order button anchored
              at the top of the right rail (Amazon checkout pattern, per
              Pavel 2026-06-01). Sits above the OrderSummary so the action
              is the first thing the eye lands on. The Terms line stays
              below the button. */}
          {currentStep === 3 && (
            <PlaceOrderCard
              isPaying={isPaying}
              isAdjustment={isAdjustment}
              onPlaceOrder={placeOrder}
            />
          )}
          {/* G6.c-rail (2026-05-30) — Amazon-style Subscribe & Save sits
              at the top of the Step 2 rail and owns the advance action
              via its own primary button. Only renders once we have a
              real per-run total to show savings against. */}
          {currentStep === 2 &&
            (estimate?.totalBeforeShippingAndTaxCents ?? 0) > 0 && (
              <SubscribeChoiceRail
                state={state.subscription}
                onChange={(patch) => patchState('subscription', patch)}
                unlocked={subscribeAndSaveEnabled}
                perRunTotalCents={
                  estimate?.totalBeforeShippingAndTaxCents ?? 0
                }
                onAdvance={goNext}
                isSaving={isSaving}
              />
            )}
          <OrderSummary
            state={state}
            estimate={estimate}
            shipping={shipping}
            currentStep={currentStep}
          />
        </aside>
      </main>
    </div>
  )
}

// =============================================================================
// CheckoutHeaderRight — marketplace-style icon cluster
// =============================================================================
//
// Renders Heart / Bell / BrandSwitcher / UserMenu / Cart in the SAME order
// the marketplace + dashboard topbars use. The Cart icon is checkout-specific
// (the rest of the app doesn't surface it because iLaunchify is a B2B
// production marketplace, not a consumer storefront) — here it deep-links
// back to the In-progress /products tab where Resume-Checkout chips live.

function CheckoutHeaderRight({
  user,
  brands,
  activeBrandId,
  hasUnreadNotifications,
}: {
  user: { email: string; name: string | null }
  brands: BrandOption[]
  activeBrandId: string
  hasUnreadNotifications: boolean
}) {
  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? brands[0]
  return (
    <>
      <AppHeaderIconButton aria-label="Favorites">
        <Heart strokeWidth={2} className="h-5 w-5" aria-hidden="true" />
      </AppHeaderIconButton>
      <AppHeaderIconButton
        aria-label="Notifications"
        hasDot={hasUnreadNotifications}
      >
        <Bell strokeWidth={2} className="h-5 w-5" aria-hidden="true" />
      </AppHeaderIconButton>
      {/* Cart sits between Bell and the profile cluster (BrandSwitcher +
          UserMenu) per Pavel's spec. Points back to /products so the
          creator can hop to other in-progress drafts (Resume-Checkout
          chips, R11). */}
      <Link
        href="/products"
        aria-label="View carts in progress"
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1"
      >
        <ShoppingCart strokeWidth={2} className="h-5 w-5" aria-hidden="true" />
      </Link>
      {brands.length > 1 && (
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      )}
      <AppHeaderUserMenu
        user={{
          name: user.name,
          email: user.email,
          tier: null,
          activeBrandName: activeBrand?.name ?? null,
        }}
        tierLabels={{ maker: 'Maker', builder: 'Builder', agency: 'Agency' }}
        manageTierHref="/settings/profile"
        activeBrandHref="/brands"
        avatarTone="pink"
        sections={[
          {
            items: [
              { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
              { label: 'My brands', href: '/brands', icon: Layers },
              { label: 'My products', href: '/products', icon: Package },
              { label: 'Orders', href: '/orders', icon: ShoppingBag },
            ],
          },
          {
            items: [
              { label: 'Channels', href: '/settings/channels', icon: Plug },
              { label: 'Payments', href: '/settings/payouts', icon: CreditCard },
              { label: 'Settings', href: '/settings', icon: Settings },
            ],
          },
          { items: [{ label: 'Help & support', href: '/help', icon: HelpCircle }] },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  )
}

// =============================================================================
// PreStepChip — completed prerequisite (Product Design / Label Design)
// =============================================================================
//
// Renders as a small button: check icon + label. No numbered badge because
// these aren't part of the in-checkout flow — they're history. Clicking
// deep-links back to the upstream surface (recipe customize / Studio) so
// the creator can iterate without losing their checkout draft (autosaved).

function PreStepChip({ href, label }: { href: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <Link
        href={href}
        aria-label={`${label} (completed) — open to edit`}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-ink-600 transition-colors hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
        {label}
      </Link>
    </li>
  )
}

// =============================================================================
// ActionsCard — Back / Continue, lives above the OrderSummary on the right
// =============================================================================

function ActionsCard({
  currentStep,
  isAdjustment,
  isSaving,
  reviewAcksComplete,
  isNextDisabled,
  onBack,
  onNext,
}: {
  currentStep: WizardStepIndex
  isAdjustment: boolean
  isSaving: boolean
  reviewAcksComplete: boolean
  isNextDisabled: boolean
  onBack: () => void
  onNext: () => void
}) {
  const isLast = currentStep === LAST_STEP_INDEX
  const nextLabel =
    currentStep === 1 ? 'Continue to Review Production' : 'Continue to Checkout'

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      {/* Primary CTA stacked above secondary so the eye lands on Continue.
          On the last step there's no wizard-level Next — the CheckoutStep
          owns its own Place-order button — so we show a contextual hint
          instead and only render the Back button. */}
      {!isLast ? (
        <>
          <button
            type="button"
            onClick={onNext}
            disabled={isNextDisabled}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:opacity-40"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                {nextLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </>
            )}
          </button>
          {currentStep === 1 && !reviewAcksComplete && (
            <p className="mt-2 text-center text-[11px] text-ink-500">
              Approve the design to continue
            </p>
          )}
        </>
      ) : (
        <p className="rounded-md bg-ink-50 px-3 py-2 text-center text-[11.5px] leading-snug text-ink-600">
          {isAdjustment
            ? 'Use Resubmit adjustment below to finish.'
            : 'Use Place your order below to finish.'}
        </p>
      )}

      <button
        type="button"
        onClick={onBack}
        disabled={currentStep === 1 || isSaving}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:opacity-40"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back
      </button>
    </div>
  )
}

// =============================================================================
// PlaceOrderCard — Step 3 right-rail pink CTA (Amazon checkout pattern)
// =============================================================================
//
// Pavel 2026-06-01: pink "Place your order" pinned to the top-right of
// the rail, above the OrderSummary. No reassurance copy ("Ready to
// place / Stripe collects payment / Pick a delivery destination above")
// — just the button + a small Terms line beneath. Mirrors Amazon's
// Secure Checkout layout where the action is the first thing the eye
// lands on.

function PlaceOrderCard({
  isPaying,
  isAdjustment,
  onPlaceOrder,
}: {
  isPaying: boolean
  isAdjustment: boolean
  onPlaceOrder: () => void
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onPlaceOrder}
        disabled={isPaying}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-pink-500 px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-white shadow-sm hover:bg-pink-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {isPaying ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {isAdjustment ? 'Resubmitting…' : 'Handing off to Stripe…'}
          </>
        ) : isAdjustment ? (
          'Resubmit adjustment'
        ) : (
          'Place your order'
        )}
      </button>
      <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-ink-500">
        <Lock className="h-3 w-3" aria-hidden="true" />
        By placing this order you agree to our Terms &amp; Privacy.
      </p>
    </div>
  )
}

// =============================================================================
// isReadyToPay — server-mirrors the validation in placeOrderFromCheckoutDraft
// =============================================================================

function isReadyToPay(
  draft: CheckoutDraftState,
): { ok: true } | { ok: false; error: string } {
  if (!draft.production.quantity || draft.production.quantity <= 0) {
    return { ok: false, error: 'Set a quantity in Production first.' }
  }
  if (!draft.fulfillment.shipToType) {
    return { ok: false, error: 'Pick a delivery destination above.' }
  }
  if (
    draft.fulfillment.shipToType === 'SPECIFIC_WAREHOUSE' &&
    !draft.fulfillment.warehousePartnerServiceId
  ) {
    return { ok: false, error: 'Choose a specific warehouse from the list.' }
  }
  if (
    draft.fulfillment.shipToType === 'SAVED_ADDRESS' &&
    !draft.fulfillment.savedAddressId
  ) {
    return { ok: false, error: 'Pick a saved address from your list.' }
  }
  if (draft.fulfillment.shipToType === 'NEW_ADDRESS') {
    const a = draft.fulfillment.newAddress
    if (!a || !a.contactName || !a.addressLine1 || !a.city || !a.postalCode) {
      return { ok: false, error: 'Fill in the new address details above.' }
    }
  }
  return { ok: true }
}
