// Public exports of @ilaunchify/auth
export { auth, handlers, signIn, signOut } from './config'
export { requireRole, requireUser, requireSession } from './guards'
export type { Session, User, Role } from './types'
export { createUserWithRole } from './signup'
export type { SignupInput, SignupResult, SignupError } from './signup'
// R14.c — subscription-tier helpers shared across surfaces.
export {
  TIER_RANK,
  TIERS,
  getCreatorTier,
  hasTier,
  nextTier,
  normalizeTier,
} from './tiers'
export type { TierKey } from './tiers'

// V1.5-T2 — single write path for CreatorProfile.subscriptionTier
// (admin Tier Management + Stripe-webhook tier-flip handlers).
export { setCreatorTierWithAudit } from './tier-writes'
export type {
  SetCreatorTierInput,
  SetCreatorTierResult,
  TierWriteActor,
} from './tier-writes'
