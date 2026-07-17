// Public exports of @ilaunchify/auth
export { auth, handlers, signIn, signOut } from './config'
export { requireRole, requireUser, requireSession } from './guards'
export type { Session, User, Role } from './types'
// Dev sign-in bypass predicates — pure, unit-tested SSOT (H5). The dev Credentials
// provider (config.ts) and the /api/dev/login routes gate on these.
export { isDevSignInAllowed, isDevLoginBlocked } from './dev-guard'

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
// Legal re-acceptance gate (docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §5.2)
// is SERVER-ONLY — it pulls @ilaunchify/legal → node:crypto, which Next 15 webpack
// can't bundle for the client. It's exported from '@ilaunchify/auth/server' instead,
// so this barrel stays client-safe (client components import tier helpers from here).
// getOutstandingLegalDocs / recordLegalAcceptances / LEGAL_CONSENT_TEXT_VERSION /
// OutstandingLegalDoc → import from '@ilaunchify/auth/server'.
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
// H5 A4 (docs/A4_TURNSTILE_BUILD_SPEC_2026-07-11.md) — Cloudflare Turnstile bot defense.
export { interpretSiteverify, verifyTurnstile } from './turnstile'
export type { TurnstileResult, SiteverifyBody } from './turnstile'
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
  channelConnectionLimit,
  CHANNEL_CONNECTION_LIMITS,
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
//
// ─── THE VALUE EXPORT MOVED TO `@ilaunchify/auth/server` (2026-07-16) ────────
//
// `setCreatorTierWithAudit` imports @ilaunchify/orders, whose barrel now reaches
// node:crypto (orders/index -> room-service -> @ilaunchify/notifications ->
// feedback-token -> node:crypto). Re-exporting it HERE made the whole chain part
// of the client bundle for anyone importing this barrel, and the Design Studio
// canvas died on it:
//
//   Module build failed: UnhandledSchemeError: Reading from "node:crypto"
//   ... CanvasLayoutShell.tsx  ('use client', imports hasTier/canRecolorTemplate)
//
// server.ts's own header predicted this exact failure ("a client component
// importing a client-safe helper (e.g. a tier check) would drag node:crypto in
// and fail the build") - tier-writes simply never got moved. Same disease as
// @ilaunchify/plans -> /math: a barrel re-exporting server-only code, imported by
// a client component that only wanted a pure helper.
//
// It was MASKED by the .next cache: the canvas route had not recompiled since
// room-service.ts landed, so the build stayed green over a broken graph until a
// cache wipe forced a fresh compile. A cached success is not a passing build.
//
// TYPES STAY: `import type` is erased at compile time and pulls in no runtime
// graph, so type-only consumers need no change.
export type {
  SetCreatorTierInput,
  SetCreatorTierResult,
  TierWriteActor,
} from './tier-writes'

// P3 multi-seat partner access (docs/PRINT_PRODUCTION_WORKFLOW.md §2.2)
export { getPartnerAccess, requirePartnerAdminAccess, type PartnerAccess } from './partner-access'
// Partner Access & Opportunity resolver — pure lever decider
// (docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md).
export {
  resolvePartnerOpportunity,
  resolveNamedReviewsAudience,
  type AccessLeverState,
  type PartnerAccessLever,
  type NamedReviewsAudience,
  type AccessPolicy,
  type AccessOverride,
  type PartnerFacts,
  type LeverSource,
  type LeverResolution,
} from './partner-opportunity'
