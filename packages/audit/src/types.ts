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
  'ThemeTokenOverride', // Theme Studio runtime design-token overrides (2026-06-25)
  'Partner',
  'PartnerService',
  'PartnerVerificationSection',
  'PartnerFile',
  'User',
  'AdminRole', // RBAC role→capability matrix edits (docs/ADMIN_RBAC.md P5)
  'AdminInvite', // admin team invites (docs/ADMIN_RBAC.md)
  'IntegrationMeta', // integration key rotation tracking (docs/INTEGRATIONS.md)
  'Session', // Tier 1 Security & Access — admin session revocation (2026-06-05)
  'Lead',
  'SampleSettings', // Sample-policy admin settings (2026-06-11)
  'OrderSettings', // Order-policy admin settings (2026-06-11)
  'IngredientSourceConfig', // Ingredient data-source admin settings (2026-06-11)
  'DomainSetting', // Product-domain on/off admin settings (2026-06-14)
  'LogisticsSetting', // Logistics gate on/off admin settings (Phase L1, 2026-07-02)
  'StorageAgreement', // Hold-at-manufacturer storage agreements (Phase L1, 2026-07-02)
  'ShipmentLeg', // Platform-booked shipment legs (Phase L1, 2026-07-02)
  // Phase L2/L3 (2026-07-02). NOTE: earlier L2/L3 writes logged these under
  // 'User'/'Product'/'Order'/'Partner' with real row ids in the payload (the
  // types below didn't exist yet) — those rows stay valid; new writes should
  // use the dedicated types.
  'CarrierAccount', // EasyPost child / BYO carrier accounts (Phase L2)
  'CarrierServiceRule', // Carrier eligibility matrix rows (Phase L2)
  'StorageReleaseOrder', // Stock releases out of hold-at-manufacturer (Phase L1.2)
  'Channel', // Channel registry rows — enable/pause kill switches (admin ops console)
  'ChannelConnection', // Creator sales-channel connections (Phase L3)
  'ChannelProductLink', // Channel-scoped product identifiers incl. FNSKU (Phase L3)
  'ChannelInboundPlan', // Factory→channel-FC inbound plans (Phase L3)
  'ChannelOrder', // Imported consumer orders (CHANNEL_MANAGEMENT_SPEC C2)
  'OnDemandEnablement', // Manufacturer approval to accept on-demand orders (C2.3)
  'InventoryPool', // Bulk available-to-sell pools + ledger movements (C2.4)
  // Partner Role Accounts P0 (docs/PARTNER_ROLE_ACCOUNTS.md, 2026-07-02)
  'InboundReceipt', // First-class FC receipt records (immutable lot capture, D2)
  'ReceivingDiscrepancy', // FC short/over/damaged exceptions + adjudication
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
  // Admin-curated container taxonomy — owns mockup templates (MOCKUP_STRATEGY.md)
  'PackagingType',
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
  // Creator-opened post-delivery dispute (OrderSettings.disputeWindowDays)
  'OrderDispute',
  // C8 — admin-curated decoration × container compatibility matrix
  'PackagingDecorationCompatibility',
  // C8 — partner-owned packaging offerings (container × decoration tuples)
  'PartnerPackagingOffering',
  // C9 Phase 1 — partner-owned packaging dielines (file + structured spec)
  'PackagingDieline',
  // C9 Phase 2 — partner-owned prepress output spec (one per PartnerService)
  'PartnerPrintOutputSpec',
  // iLaunchify Academy (Phase A) — admin-managed learning content (ACADEMY_SPEC §9)
  'AcademyCategory',
  'AcademyCourse',
  'AcademyLesson',
  // W2-SUP — internal support ticketing (SUPPORT_TICKETING_PLAN.md)
  'Ticket',
  'SupportSettings', // admin-tunable tier policy (W2-SUP3.5)
  'TicketCategory', // admin-managed category taxonomy
  'SupportCannedReply', // admin-curated canned/macro replies
  'BillingProfile', // invoice/tax contact details (docs/BILLING_AND_ACCOUNTING.md)
  'PaymentMethod', // Stripe payment-method mirror (docs/BILLING_AND_ACCOUNTING.md slice 2)
  'TaxDocument', // 1099 pointer + Express-dashboard access (docs/BILLING_AND_ACCOUNTING.md)
  'Brand', // brand kit edits (docs/BRAND_KIT_PROPOSAL.md)
  'BrandTemplate', // reusable brand design templates (docs/BRAND_KIT_PROPOSAL.md)
  'AiGeneratorSettings', // AI generator admin config (docs/AI_PACKAGING_GENERATOR.md §7/§13/§16)
  'AiOutputPreset', // admin-authored output presets (docs/AI_PACKAGING_GENERATOR.md §16)
  'AiDesignGeneration', // a generation run — draft/finalize (docs/AI_PACKAGING_GENERATOR.md §5)
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
  // Creator self-cancel of an unpaid order before routing (auto-approved)
  'ORDER_CREATOR_CANCELLED',
  // Restricted-category eligibility gate (labeling ≠ licensing)
  'ORDER_BLOCKED_RESTRICTED',
  // Die-line label-frame compliance hard gate at checkout (a required regulatory
  // frame is missing from the saved design) — DIELINE_FRAME_EDITOR_SPEC §5.
  'ORDER_BLOCKED_LABEL_FRAMES',
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
  'DISPATCH_REPRINT_CREATED', // admin resolved a LABEL dispute → reprint dispatch
  'ORDER_AUTO_CANCEL_UNPAID',
  // Product template lifecycle (admin review queue, #133)
  'PRODUCT_TEMPLATE_CREATE',
  'PRODUCT_TEMPLATE_SUBMIT_FOR_REVIEW',
  'PRODUCT_TEMPLATE_PUBLISH',
  'PRODUCT_TEMPLATE_REQUEST_CHANGES',
  'PRODUCT_TEMPLATE_REJECT',
  'PRODUCT_TEMPLATE_PAUSE',
  'PRODUCT_TEMPLATE_REACTIVATE',
  'PRODUCT_TEMPLATE_ARCHIVE',
  'PRODUCT_TEMPLATE_MARKETING_EDIT',
  // Mockup templates (admin curation — docs/MOCKUP_STRATEGY.md)
  'MOCKUP_TEMPLATE_CREATE',
  'MOCKUP_TEMPLATE_UPDATE',
  'MOCKUP_TEMPLATE_STATUS',
  'MOCKUP_TEMPLATE_DELETE',
  // Packaging catalog review (docs/PACKAGING_REVIEW.md)
  'PACKAGING_SUBMIT_REVIEW',
  'PACKAGING_REVIEW_APPROVE',
  'PACKAGING_REVIEW_REJECT',
  // §7 marketplace filter attributes set by the partner builder (format /
  // process / allergen-free claims / markets).
  'MARKETPLACE_ATTRIBUTES_SET',
  'INTENDED_AGE_GROUP_SET',
  // Banned-ingredient runtime enforcement (FDA_REGULATORY_POSTURE §5)
  'PRODUCT_TEMPLATE_BANNED_BLOCK',
  // Banned-product-category gate (FDA_REGULATORY_POSTURE §5 item 14 / risk #9)
  'PRODUCT_BANNED_CATEGORY_BLOCK',
  // Restricted-category gate at submit (labeling ≠ licensing): facts
  // (alcohol/hemp-CBD/tobacco) + OTC labeling type that the term/ingredient
  // dictionaries can't see. Blocks the DRAFT → PENDING_REVIEW transition.
  'PRODUCT_TEMPLATE_RESTRICTED_BLOCK',
  // iLaunchify Academy — content status FSM (DRAFT→IN_REVIEW→PUBLISHED→ARCHIVED)
  'ACADEMY_STATUS_CHANGE',
  // Payments (mostly SYSTEM actor from webhooks)
  'CHARGE_SUCCEEDED',
  'TRANSFER_QUEUED',
  'TRANSFER_PAID',
  'REFUND_ISSUED',
  // Refund executor (docs/REFUND_EXECUTION.md) — planned intent / execution failure
  'REFUND_PLANNED',
  'REFUND_FAILED',
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
  // C9 Phase 2 — partner prepress output spec (one per PartnerService)
  'PARTNER_PRINT_SPEC_UPDATED',
  // W2-SUP — internal support ticketing (SUPPORT_TICKETING_PLAN.md)
  'TICKET_CREATED',
  'TICKET_REPLIED',
  'TICKET_INTERNAL_NOTE',
  'TICKET_STATUS_CHANGED',
  'TICKET_RESOLVED',
  'TICKET_REOPENED',
  'TICKET_ASSIGNED',
  'TICKET_LINK_ENTITY',
  'TICKET_SLA_BREACHED',
  'SUPPORT_SETTINGS_UPDATED',
  // Brand Kit — reusable Studio templates (docs/BRAND_KIT_PROPOSAL.md)
  'BRAND_TEMPLATE_CREATED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {})

export type AuditActorRole = PrismaActorRole // re-export Prisma enum

export interface AuditEntryInput {
  actorId: string | null
  actorRole: AuditActorRole
  /** Admin RBAC sub-role (docs/ADMIN_RBAC.md P4.1). Typed loosely as string to
      avoid a cross-package enum dependency; values match the AdminRole enum. */
  actorAdminRole?: string | null
  entityType: AuditEntityType
  entityId: string
  action: AuditAction
  fromValue?: string | null
  toValue?: string | null
  payload?: Record<string, unknown> | null
}

export type AuditEntry = AuditLog
