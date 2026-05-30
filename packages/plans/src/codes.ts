// REBUILD R15.b — stable identifiers for SubscriptionPlan rows + the
// feature codes / fee-trigger events the platform looks up.
//
// PLAN CODES are the `SubscriptionPlan.code` values (UNIQUE). Server
// helpers + admin UI both reference them through this file so a typo
// at the call site is a compile-time error instead of a silent
// "feature not found" return value.

/** Creator subscription plan codes (matches CreatorProfile.subscriptionTier). */
export const CREATOR_PLAN_CODES = {
  maker: 'creator_maker',
  builder: 'creator_builder',
  agency: 'creator_agency',
} as const

/** Partner subscription plan codes (matches Partner.tier). */
export const PARTNER_PLAN_CODES = {
  verified: 'partner_verified',
  trusted: 'partner_trusted',
  premier: 'partner_premier',
} as const

export type CreatorPlanCode =
  (typeof CREATOR_PLAN_CODES)[keyof typeof CREATOR_PLAN_CODES]
export type PartnerPlanCode =
  (typeof PARTNER_PLAN_CODES)[keyof typeof PARTNER_PLAN_CODES]
export type PlanCode = CreatorPlanCode | PartnerPlanCode

// -----------------------------------------------------------------------------
// FEATURE CODES — referenced by call sites that gate a module
// -----------------------------------------------------------------------------
//
// Each shipped module owns its own code(s). Add yours here when you ship
// the gate. Keep them snake_case + audience-scoped so creator + partner
// codes never collide.
//
// Pavel decision 2026-05-30: V1 doesn't pre-wall non-existent modules.
// Codes below mirror gates that already exist in the app today. The
// long PLATFORM_SPEC §Tier 1 matrix gets seeded in R15.b but most
// features only become enforced as their owning module ships.

export const CREATOR_FEATURES = {
  /** Max number of active products. null = unlimited. */
  MAX_ACTIVE_PRODUCTS: 'max_active_products',
  /** Print-ready PDF / PNG export from Design Studio (DS-73d). */
  STUDIO_EXPORT: 'studio_export',
  /** Subscribe & save upsell on checkout (R8.c / R14.d). */
  SUBSCRIBE_AND_SAVE: 'subscribe_and_save',
  /** Concierge / human "Get product support" link on order detail (R14.d). */
  PRODUCT_SUPPORT: 'product_support',
  /** Custom domain storefront (V1.1+ — placeholder for the future module). */
  CUSTOM_DOMAIN: 'custom_domain',
  /** Multi-brand workspace (Agency-only per PLATFORM_SPEC). */
  MULTI_BRAND_WORKSPACE: 'multi_brand_workspace',
  /** Volume pricing discount on production runs (cents-off % stored elsewhere). */
  VOLUME_PRICING: 'volume_pricing',
} as const

export const PARTNER_FEATURES = {
  /** Max active product/template listings. null = unlimited. */
  MAX_ACTIVE_LISTINGS: 'max_active_listings',
  /** "Premier" badge rendered on marketplace listings. */
  PREMIER_BADGE: 'premier_badge',
  /** Routing position weight — 0 = last-look, 2 = first-look. */
  ROUTING_PRIORITY: 'routing_priority',
  /** Number of team-member seats on the partner profile. null = unlimited. */
  TEAM_SEATS: 'team_seats',
  /** Custom die-cut templates allowed per quarter. null = unlimited. */
  CUSTOM_DIE_CUTS_PER_QUARTER: 'custom_die_cuts_per_quarter',
  /** Creator-recipe customization (slot replacements + mods). */
  CREATOR_RECIPE_CUSTOMIZATION: 'creator_recipe_customization',
  /** AI partner-support agent (Trusted+). */
  AI_SUPPORT_AGENT: 'ai_support_agent',
  /** Support SLA in hours. Lower = faster. */
  SUPPORT_SLA_HOURS: 'support_sla_hours',
  /** File storage in GB. null = unlimited. */
  FILE_STORAGE_GB: 'file_storage_gb',
  /** Volume discount tier pricing (set custom price bands). */
  VOLUME_DISCOUNT_TIERS: 'volume_discount_tiers',
  /** Subscribe & save partner-side recurring discount (mirrors creator). */
  SUBSCRIBE_AND_SAVE: 'subscribe_and_save',
  /** Order analytics tier — 'basic' / 'advanced' / 'advanced_api'. */
  ANALYTICS_LEVEL: 'analytics_level',
} as const

export type CreatorFeatureCode =
  (typeof CREATOR_FEATURES)[keyof typeof CREATOR_FEATURES]
export type PartnerFeatureCode =
  (typeof PARTNER_FEATURES)[keyof typeof PARTNER_FEATURES]
export type FeatureCode = CreatorFeatureCode | PartnerFeatureCode

// -----------------------------------------------------------------------------
// FEE TRIGGER EVENTS — what kind of money movement is being priced
// -----------------------------------------------------------------------------
//
// Each FeeRule row has a triggerEvent; the platform's billing helpers
// resolve which rate to apply by passing the trigger into lookupFeeRate().
// V1 only uses PRODUCTION_ORDER_SUBTOTAL (the take rate on production
// orders); the others are reserved for known V1.5+ surfaces so admin
// seed data has somewhere to land.

export const FEE_EVENTS = {
  /** Take-rate % on a creator production order subtotal (the main fee). */
  PRODUCTION_ORDER_SUBTOTAL: 'production_order_subtotal',
  /** Sample-order fee — usually = production rate but admin-overridable. */
  SAMPLE_ORDER: 'sample_order',
  /** Warehouse partner referral fee (V1.5+ pass-through-plus model). */
  WAREHOUSE_REFERRAL: 'warehouse_referral',
} as const

export type FeeEvent = (typeof FEE_EVENTS)[keyof typeof FEE_EVENTS]
