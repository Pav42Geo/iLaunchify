// Public exports of @ilaunchify/auth
export { auth, handlers, signIn, signOut } from './config'
export { requireRole, requireUser, requireSession } from './guards'
export type { Session, User, Role } from './types'

// Admin RBAC — capability layer (docs/ADMIN_RBAC.md).
export {
  ROLE_CAPABILITIES,
  ALL_CAPABILITIES,
  resolveCapabilities,
  hasCapability,
  requireCapability,
  getViewerCapabilities,
  capabilitiesForRole,
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  type AdminRole,
  type Capability,
} from './capabilities'
export { createUserWithRole } from './signup'
export type { SignupInput, SignupResult, SignupError } from './signup'
// Admin-team invite — pure acceptance decision (docs/ADMIN_RBAC.md).
export { evaluateInviteAcceptance } from './admin-invite'
export type {
  InviteAcceptanceDecision,
  InviteAcceptanceInput,
  InviteDenyReason,
} from './admin-invite'
// Tier 0.3 (docs/SECURITY_ARCHITECTURE.md) — DB-backed rate limiting.
export { checkRateLimit, requestIp } from './rate-limit'
export type { RateLimitOptions, RateLimitResult } from './rate-limit'
// Tier 1.1 (docs/SECURITY_ARCHITECTURE.md) — centralized ownership guards.
// NEW server actions use these, never ad-hoc checks (see CLAUDE.md).
export {
  requirePartnerActor,
  requirePartnerOwnedTemplate,
  decidePartnerActor,
  decideTemplateAccess,
  creatorOwnedProductWhere,
  creatorOwnedBrandWhere,
  creatorOwnedProductScope,
} from './ownership'
export type {
  PartnerActorResult,
  PartnerActorReason,
  TemplateAccessResult,
  TemplateAccessReason,
} from './ownership'
// R14.c — subscription-tier helpers shared across surfaces.
export {
  TIER_RANK,
  TIERS,
  getCreatorTier,
  getEffectiveCreatorTier,
  hasTier,
  nextTier,
  normalizeTier,
  brandLimits,
  BRAND_LIMITS,
  advancedBrandFeatures,
  ADVANCED_BRAND_FEATURES,
  canUploadCustomFonts,
  canUseColorHarmony,
  canExtractPalette,
  canRecolorTemplate,
} from './tiers'
export type { TierKey, BrandLimits, AdvancedBrandFeatures } from './tiers'

// V1.5-T2 — single write path for CreatorProfile.subscriptionTier
// (admin Tier Management + Stripe-webhook tier-flip handlers).
export { setCreatorTierWithAudit } from './tier-writes'
export type {
  SetCreatorTierInput,
  SetCreatorTierResult,
  TierWriteActor,
} from './tier-writes'
