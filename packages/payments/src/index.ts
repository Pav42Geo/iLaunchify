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
export { createConnectAccount, createConnectAccountLink } from './connect'
export { createCheckoutSession } from './checkout'
export { handleStripeEvent } from './webhook-handlers'
export {
  APPLICATION_FEE_RATE_BP,
  APPLICATION_FEE_FLOOR_CENTS,
  computeApplicationFee,
} from './fees'
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
} from './tier-subscriptions'
export type {
  UpgradeableTier,
  CreateTierCheckoutSessionInput,
  CreateTierCheckoutSessionResult,
  CancelTierSubscriptionInput,
  CancelTierSubscriptionResult,
} from './tier-subscriptions'
