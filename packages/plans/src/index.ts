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

// Creator platform-fee SSOT (FEE_MODEL_RECONCILIATION_SPEC_2026-07-09): the creator
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

// PP-0: the DECLARED goods basis, replacing the Math.max reconcile. `resolveGoods`
// says which number an order prices on; `composeProductionLines` is the single
// composer, which is what makes "each add-on exactly once" structural rather than
// asserted. `costFloorBreach` keeps partner COST out of the creator's PRICE: it
// reports an under-funded order, it never raises the bill.
export { resolveGoods, composeProductionLines, costFloorBreach } from './goods-basis'
// Blocker 2 (2026-07-16): the manufacturer's volume band. THE goods basis for a
// non-pack order, and the number the PDP already quotes. placeOrder never read the
// tiers at all, so it billed a catalog buildup ~90% below the quote.
export { pickPricingBand, pickPricingBandIndex, tierGoodsCents, tierGoodsCentsAtBand, bandUnitsForPackOrder } from './pricing-band'
export type { PricingBandInput } from './pricing-band'
export type { GoodsBasis, ResolvedGoods, GoodsBasisInput, ProductionComposition } from './goods-basis'

export {
  SUBSCRIPTION_DISCOUNT_LADDER,
  getMaxDiscountBp,
  getTierByRunCount,
  formatDiscountPct,
} from './subscription-ladder'
export type { SubscriptionDiscountTier } from './subscription-ladder'
