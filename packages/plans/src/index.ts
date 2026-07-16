// Public exports of @ilaunchify/plans (R15.b).

export {
  CREATOR_PLAN_CODES,
  PARTNER_PLAN_CODES,
  CREATOR_FEATURES,
  PARTNER_FEATURES,
  FEE_EVENTS,
  DESIGN_ALTERNATE_CAPS,
  designAlternateCap,
  designerSeatCap,
} from './codes'

export type {
  CreatorPlanCode,
  PartnerPlanCode,
  PlanCode,
  CreatorFeatureCode,
  PartnerFeatureCode,
  FeatureCode,
  FeeEvent,
} from './codes'

export {
  creatorTierToPlanCode,
  partnerTierToPlanCode,
  getPlanByCode,
  lookupPlanFeature,
  hasFeature,
  getFeatureLimit,
  getFeatureString,
  lookupFeeRate,
  resolveCreatorTierPricing,
  invalidatePlansCache,
} from './lookups'

export type {
  PlanFeatureValue,
  FeeRuleValue,
  CreatorTierPrice,
  CreatorTierPricing,
} from './lookups'

// Creator platform-fee SSOT (FEE_MODEL_RECONCILIATION_SPEC_2026-07-09) — the creator
// pays their subscription-tier rate (15/12/8%); every charge path resolves it here.
export {
  resolveCreatorFeeBps,
  resolveCreatorFeeBounds,
  creatorFeeFromRule,
  creatorFeeCents,
  CREATOR_FEE_FALLBACK_BPS,
} from './creator-fee'
export type { CreatorFee, CreatorFeeSource, CreatorTier, FeeRuleBounds } from './creator-fee'

// PP-0: the ONE order-pricing function (docs/PRINT_PRICING_SPEC_2026-07-15.md §2).
// Every price surface (PDP, configurator, checkout estimate, OrderSummary, placeOrder)
// must resolve through this, or they diverge again. Encodes the LOCKED fee-base rule:
// a component is in the base IFF a partner/creator sets its price AND keeps proceeds.
export { computeOrderPricing, pricingDelta } from './order-pricing'
export type { PricedOrder, PriceLine, PricingInput } from './order-pricing'

// PP-0: decoration + component-upgrade money. Lives here (not in the checkout
// route) because it computes FEE-BASE MEMBERS, so it belongs with the fee base.
// Pure: callers pass the PackagingComponent rows they already loaded.
export { priceComponents, pickTierPriceCents, COMPONENT_PRICING_SELECT } from './component-pricing'
export type { ComponentRow, ComponentPricing } from './component-pricing'

export {
  SUBSCRIPTION_DISCOUNT_LADDER,
  getMaxDiscountBp,
  getTierByRunCount,
  formatDiscountPct,
} from './subscription-ladder'
export type { SubscriptionDiscountTier } from './subscription-ladder'
