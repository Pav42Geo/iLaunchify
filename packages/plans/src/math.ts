// @ilaunchify/plans/math: the CLIENT-SAFE money subpath.
//
// Mirrors the @ilaunchify/ui/money precedent: a barrel that re-exports server
// code cannot be imported from a client component, so the pure half gets its own
// entry point that provably cannot reach a DB.
//
// IMPORT THIS from any 'use client' component. Do NOT import '@ilaunchify/plans'
// there: the main barrel re-exports ./lookups, which is server-only and eagerly
// imports prisma (lookups.ts:12). Today that only survives because webpack
// tree-shakes it out; this subpath means it does not have to.
//
// Everything re-exported here is pure: no prisma, no I/O, no clock. If you are
// about to add an export that is none of those things, it does not belong here.
//
// WHY IT EXISTS: the configurator prices live in the browser as the creator picks
// options, so it must compute the fee client-side. It could not import
// creatorFeeCents, so it hand-rolled `Math.round(subtotal * pct / 100)` and
// dropped the FeeRule's flat/min/max bounds that the real charge applies. The
// creator was quoted an unclamped fee and charged a clamped one.

// The fee math (bounds included: that is the whole point).
export {
  creatorFeeCents,
  creatorFeeFromRule,
  CREATOR_FEE_FALLBACK_BPS,
} from './creator-fee-math'
export type {
  CreatorFee,
  CreatorFeeSource,
  CreatorTier,
  FeeRuleBounds,
  FeeRuleRateLike,
} from './creator-fee-math'

// The ONE order pricer + the fee-base rule it encodes.
export { computeOrderPricing, pricingDelta } from './order-pricing'
export type { PricedOrder, PriceLine, PricingInput } from './order-pricing'

// Option C all-in DISPLAY composer (docs/PLATFORM_FEE_PRESENTATION_BRIEF
// 2026-07-21): folds the administrative fee into the goods lines for decision
// surfaces. Presentation only — the pricer and fee snapshot are untouched.
export { composeAllInLines } from './all-in-display'
export type { AllInLine, AllInDisplay } from './all-in-display'

// The declared goods basis + the single composer that makes "each add-on exactly
// once" structural.
export { resolveGoods, composeProductionLines, costFloorBreach } from './goods-basis'
export type { GoodsBasis, ResolvedGoods, GoodsBasisInput, ProductionComposition } from './goods-basis'

// The volume-band picker: the PDP, the estimate and the charge must all resolve a
// quantity to the SAME manufacturer band, or the quote is not the price.
export { pickPricingBand, pickPricingBandIndex, tierGoodsCents, bandUnitsForPackOrder } from './pricing-band'
export type { PricingBandInput } from './pricing-band'

// Decoration + component-upgrade money (pure; callers pass the rows they loaded).
export { priceComponents, pickTierPriceCents } from './component-pricing'
export type { ComponentRow, ComponentPricing } from './component-pricing'

// Subscription ladder (already imported by client components today).
export {
  SUBSCRIPTION_DISCOUNT_LADDER,
  getMaxDiscountBp,
  getTierByRunCount,
  formatDiscountPct,
} from './subscription-ladder'
export type { SubscriptionDiscountTier } from './subscription-ladder'
