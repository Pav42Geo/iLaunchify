// Stripe utilities shared across apps.
//
// Three responsibilities:
//   1. Singleton Stripe client wrapper.
//   2. Connect Express account onboarding helpers.
//   3. Checkout Session creation + webhook event handlers.
//
// The actual webhook routes live in each app's /api/webhooks/stripe — they
// import handleStripeEvent() to dispatch into the right per-event handler.

export { stripe } from './client'
export { createConnectAccount, createConnectAccountLink, createExpressDashboardLink } from './connect'
export { createCheckoutSession } from './checkout'
export { handleStripeEvent } from './webhook-handlers'
export {
  APPLICATION_FEE_RATE_BP,
  APPLICATION_FEE_FLOOR_CENTS,
  computeApplicationFee,
} from './fees'
// Refund money math (pure) — see docs/REFUND_EXECUTION.md for the executor.
export { planRefund } from './refund-plan'
export type {
  RefundPlan,
  RefundPlanInput,
  RefundPlanTransfer,
  RefundPlanReversal,
  TransferReversalAction,
} from './refund-plan'
export { executeOrderRefund, refundsEnabled } from './refund-execute'
export type { ExecuteRefundInput, ExecuteRefundResult } from './refund-execute'
// Partner payout executor — sends the PENDING Transfer rows shipDispatch queues
// to the partner's Connect account. Gated behind STRIPE_TRANSFERS_ENABLED.
export { executePendingTransfers, transfersEnabled } from './transfer-execute'
export type { ExecuteTransfersResult, TransferOutcome } from './transfer-execute'
// Clawback netting — recoup APPROVED partner clawbacks from the next payout.
// Pure math + its own opt-in flag (STRIPE_CLAWBACK_NETTING_ENABLED).
export { computeClawbackNetting, clawbackNettingEnabled } from './clawback-netting'
export type { ClawbackNetting, ClawbackApplication, NettableClawback } from './clawback-netting'
// Phase G6.b — production-run subscription helpers.
export {
  getOrCreateCreatorCustomer,
  createProductionSubscription,
  cancelProductionSubscription,
} from './subscriptions'
export type {
  ProductionCadence,
  CreateProductionSubscriptionInput,
  CreateProductionSubscriptionResult,
} from './subscriptions'
// V1.5-T3 — creator tier (Maker → Builder/Agency) self-serve helpers.
export {
  createTierCheckoutSession,
  cancelTierSubscription,
  resumeTierSubscription,
  // Cancellation P1 — save-flow pause (1-3 months, benefits kept).
  pauseTierSubscription,
  PAUSE_MIN_MONTHS,
  PAUSE_MAX_MONTHS,
  PAUSE_COOLDOWN_DAYS,
} from './tier-subscriptions'
export type { PauseTierSubscriptionInput } from './tier-subscriptions'
// Cancellation P1 — Stripe Billing Portal (card update + invoices only;
// cancel/plan-switch disabled — those stay in our flows).
export { createBillingPortalSession } from './billing-portal'
export type { CreateBillingPortalSessionInput } from './billing-portal'
export type {
  UpgradeableTier,
  CreateTierCheckoutSessionInput,
  CreateTierCheckoutSessionResult,
  CancelTierSubscriptionInput,
  CancelTierSubscriptionResult,
} from './tier-subscriptions'
// V1 dunning — grace-expiry tier downgrade (run by the creator cron).
export { processTierDunning, type TierDunningResult } from './tier-dunning'
// Billing slice 2 — payment-method management via Stripe-hosted Checkout (setup).
export {
  isStripeConfigured,
  createSetupCheckoutSession,
  syncPaymentMethodFromCheckout,
  setDefaultPaymentMethod,
  removePaymentMethod,
  type CreateSetupCheckoutInput,
} from './payment-methods'
// Billing slice 3 — orders & invoices (Stripe-hosted receipt links).
export { getChargeReceiptUrl } from './invoices'
