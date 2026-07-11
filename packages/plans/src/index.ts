// Public exports of @ilaunchify/plans (R15.b).

export {
  CREATOR_PLAN_CODES,
  PARTNER_PLAN_CODES,
  CREATOR_FEATURES,
  PARTNER_FEATURES,
  FEE_EVENTS,
  DESIGN_ALTERNATE_CAPS,
  designAlternateCap,
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

export {
  SUBSCRIPTION_DISCOUNT_LADDER,
  getMaxDiscountBp,
  getTierByRunCount,
  formatDiscountPct,
} from './subscription-ladder'
export type { SubscriptionDiscountTier } from './subscription-ladder'
