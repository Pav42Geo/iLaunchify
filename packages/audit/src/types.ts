// Audit log types — kept as string unions (not enums) so callers from any
// app can pass values without having to import a shared enum. The DB still
// stores them as strings; the AuditActorRole enum on the Prisma side enforces
// the small fixed set for actorRole only.

import type { AuditActorRole as PrismaActorRole, AuditLog } from '@ilaunchify/db'

/**
 * Canonical list of entity types that flow through the audit log.
 * Add a new value here when you start logging a new model — keeping the
 * list central makes the /admin/audit filter dropdown easy.
 */
export const AUDIT_ENTITY_TYPES = [
  'Partner',
  'PartnerService',
  'PartnerVerificationSection',
  'PartnerFile',
  'User',
  'Session', // Tier 1 Security & Access — admin session revocation (2026-06-05)
  'Lead',
  'Order',
  'OrderDispatch',
  'Charge',
  'Transfer',
  'Refund',
  'ProductTemplate',
  'Product',
  'PackagingSystem',
  'PackagingComponent',
  'AccessoryOffering',
  'CertificateType',
  'CertificateTypeRequest',
  'CertificateAssetVariant',
  'PackagingSymbol',
  'LabelingSymbol',
  'PartnerCertificateInstance',
  'RulePack',
  'LabelFormatRule',
  'MandatoryPhrase',
  // R15.c — admin tier management module
  'CreatorProfile',
  'SubscriptionPlan',
  'PlanFeature',
  'FeeRule',
  // G6.b — recurring production subscriptions
  'ProductionSubscription',
  // #140 — admin ingredient verification queue + library promotion
  'Ingredient',
  // Admin Category Management (marketplace taxonomy)
  'Category',
  'Subcategory',
  // 2026-06-02 V1.1 marketplace taxonomy — Layer 1 Niches, Layer 4 Lifestyle tags
  'Niche',
  'NicheRule',
  'LifestyleTag',
  // 2026-06-05 — per-product label-phrase suggestion engine (admin-managed rules)
  'PhraseRule',
  // B.4 — order cancellation
  'CancellationRequest',
  // C8 — admin-curated decoration × container compatibility matrix
  'PackagingDecorationCompatibility',
  // C8 — partner-owned packaging offerings (container × decoration tuples)
  'PartnerPackagingOffering',
  // C9 Phase 1 — partner-owned packaging dielines (file + structured spec)
  'PackagingDieline',
] as const
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

/**
 * Canonical list of audit actions. Free-form string in the DB so future
 * additions don't require a migration, but having a list makes review
 * dashboards consistent.
 */
export const AUDIT_ACTIONS = [
  // Partner lifecycle
  'PARTNER_APPLY',
  'PARTNER_SUBMIT_FOR_REVIEW',
  'PARTNER_ACTIVATE',
  'PARTNER_SUSPEND',
  'PARTNER_REACTIVATE',
  'PARTNER_REQUEST_CHANGES',
  // Verification
  'VERIFICATION_SECTION_VERIFY',
  'VERIFICATION_SECTION_NEEDS_CHANGES',
  'VERIFICATION_SECTION_REJECT',
  'VERIFICATION_SECTION_RESET',
  // Files
  'FILE_UPLOAD',
  'FILE_DELETE',
  // Service / capability edits
  'SERVICE_UPDATE',
  // Lead lifecycle
  'LEAD_QUALIFY',
  'LEAD_DISQUALIFY',
  // Creator production orders
  'ORDER_CREATED',
  'ORDER_PAID',
  'ORDER_CANCELLED',
  // B.4 — order cancellation paths (locked 2026-05-19)
  'CANCELLATION_REQUESTED',
  'CANCELLATION_APPROVED',
  'CANCELLATION_DENIED',
  // Order / dispatch
  'DISPATCH_ACCEPT',
  'DISPATCH_DECLINE',
  'DISPATCH_PRODUCING',
  'DISPATCH_READY',
  'DISPATCH_SHIPPED',
  'DISPATCH_DELIVERED',
  'DISPATCH_AUTO_CANCEL',
  // Product template lifecycle (admin review queue, #133)
  'PRODUCT_TEMPLATE_CREATE',
  'PRODUCT_TEMPLATE_SUBMIT_FOR_REVIEW',
  'PRODUCT_TEMPLATE_PUBLISH',
  'PRODUCT_TEMPLATE_REQUEST_CHANGES',
  'PRODUCT_TEMPLATE_REJECT',
  'PRODUCT_TEMPLATE_PAUSE',
  'PRODUCT_TEMPLATE_REACTIVATE',
  'PRODUCT_TEMPLATE_ARCHIVE',
  // Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5)
  'PRODUCT_TEMPLATE_BANNED_BLOCK',
  // Banned-product-category gate (FDA_REGULATORY_POSTURE §5 item 14 / risk #9)
  'PRODUCT_BANNED_CATEGORY_BLOCK',
  // Payments (mostly SYSTEM actor from webhooks)
  'CHARGE_SUCCEEDED',
  'TRANSFER_QUEUED',
  'TRANSFER_PAID',
  'REFUND_ISSUED',
  // R15.c — admin tier management module
  'CREATOR_TIER_CHANGE',
  'PARTNER_TIER_CHANGE',
  'FEE_OVERRIDE_SET',
  'FEE_OVERRIDE_CLEAR',
  'PLAN_UPDATE',
  'PLAN_FEATURE_UPDATE',
  'FEE_RULE_UPDATE',
  // G6 — recurring production subscriptions
  'PRODUCTION_SUBSCRIPTION_CREATED',
  'PRODUCTION_SUBSCRIPTION_CANCELLED',
  'PRODUCTION_SUBSCRIPTION_CYCLE',
  // #140 — admin ingredient verification queue + library promotion
  'INGREDIENT_VERIFY',
  'INGREDIENT_LIBRARY_PROMOTE',
  // Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5)
  'INGREDIENT_BANNED_BLOCK',
  // Recipe builder — Slice 2 mode chooser + Slice 3 AI parser (Mode 2)
  'RECIPE_ENTRY_MODE_SET',
  'RECIPE_PARSE_RUN',
  'RECIPE_PARSE_FAILED',
  'RECIPE_PARSE_RATE_LIMITED',
  'RECIPE_PARSE_COMMIT',
  'DECLARE_NUTRITION_PANEL',
  // 2026-06-05 — per-product label-phrase suggestion engine (partner card)
  'PRODUCT_TEMPLATE_PHRASES_UPDATED',
  'PRODUCT_TEMPLATE_PHRASE_FACTS_UPDATED',
  // C8 — partner packaging offering CRUD (container × decoration tuples)
  'PARTNER_PACKAGING_OFFERING_CREATED',
  'PARTNER_PACKAGING_OFFERING_UPDATED',
  'PARTNER_PACKAGING_OFFERING_DELETED',
  'PARTNER_PACKAGING_OFFERING_STATUS_CHANGED',
  // C9 Phase 1 — partner packaging dieline CRUD (file + structured prepress spec)
  'PARTNER_DIELINE_CREATED',
  'PARTNER_DIELINE_UPDATED',
  'PARTNER_DIELINE_CONFIRMED',
  'PARTNER_DIELINE_STATUS_CHANGED',
  'PARTNER_DIELINE_DELETED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {})

export type AuditActorRole = PrismaActorRole // re-export Prisma enum

export interface AuditEntryInput {
  actorId: string | null
  actorRole: AuditActorRole
  entityType: AuditEntityType
  entityId: string
  action: AuditAction
  fromValue?: string | null
  toValue?: string | null
  payload?: Record<string, unknown> | null
}

export type AuditEntry = AuditLog
