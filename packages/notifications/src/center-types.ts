// TS types for the Notification/Email Center control-plane models
// (docs/EMAIL_NOTIFICATION_CENTER.md Part 4). These are the PURE shapes the
// resolver/category/unsubscribe engines consume. Phase 2 adds matching Prisma
// models; until then admin code can hydrate these from wherever it likes.
//
// Naming note: the DB model is `NotificationTemplate`, but this package already
// exports a `NotificationTemplate` type (the rendered {title,body,link} from
// templates.ts). The model types below use *Override / *Config suffixes to stay
// collision-free.

import type { NotificationChannel, NotificationEvent } from '@ilaunchify/db'

// ---------------------------------------------------------------------------
// Categories (the group-level opt-out unit)
// ---------------------------------------------------------------------------

/** Every event maps to exactly one category; unsubscribe operates per category. */
export type NotificationCategorySlug =
  | 'account' // Account & security — mandatory
  | 'billing' // Billing — mandatory
  | 'orders' // Order & production updates
  | 'proofs' // Proofs & approvals
  | 'fulfillment' // Fulfillment & receiving
  | 'cancellations' // Cancellations & disputes — outcomes are mandatory
  | 'compliance' // Cert/doc expiry reminders
  | 'support' // Support tickets
  | 'inventory' // Stock alerts
  | 'reminders' // Accept reminders, SLA nudges, daily digest
  | 'marketing' // Marketing & product updates (external ESP; consent lives here)

export interface NotificationCategoryConfig {
  slug: NotificationCategorySlug
  label: string
  description: string
  /** false = transactional/mandatory — no unsubscribe toggle, sends bypass opt-outs. */
  optOutable: boolean
  /** Channels enabled by default when the user has no explicit preference row. */
  defaultChannels: NotificationChannel[]
}

/**
 * Group-level preference row — the shape `NotificationPreference` takes after
 * the Phase 2 re-key to (userId, category, channel).
 */
export interface CategoryPreferenceRow {
  userId?: string
  category: NotificationCategorySlug
  channel: NotificationChannel
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Branding singleton (global header + footer chrome)
// ---------------------------------------------------------------------------

/** One audience's header nav links (Amazon-style row under the logo). */
export interface EmailHeaderLink {
  label: string
  url: string
}

export interface NotificationBrandingConfig {
  /** Absolute URL of the logo image; when absent the header renders the brand name. */
  logoUrl: string | null
  /**
   * Audience-aware header nav links (docs/FEEDBACK_MODULE.md §3.3), e.g.
   * creator: My orders / Products / Support. Null = no link row (default).
   */
  headerLinks: Partial<Record<'creator' | 'partner' | 'admin', EmailHeaderLink[]>> | null
  /** Brand display name in the header (and fallback when no logo). */
  brandName: string
  /** Accent bar / highlight color. */
  accentHex: string
  /** Primary text color. */
  inkHex: string
  /** Extra footer text (address, legal line). Rendered above the unsubscribe line. */
  footerText: string | null
  /** Copy for the unsubscribe line; `{{unsubscribeUrl}}` NOT required — link is appended. */
  unsubscribeText: string
  /** Copy for the manage-preferences line. */
  preferencesText: string
  /** Absolute URL of the user-facing preference center. */
  preferenceCenterUrl: string | null
  fromName: string | null
  replyToEmail: string | null
}

// ---------------------------------------------------------------------------
// Per-event body override (DB layer over the typed code template)
// ---------------------------------------------------------------------------

export type TemplateCtaMode = 'AUTO' | 'CUSTOM' | 'NONE'
export type TemplateStatus = 'DRAFT' | 'PUBLISHED'

export interface NotificationTemplateOverride {
  event: NotificationEvent
  /** false disables the EMAIL channel for this event entirely (in-app unaffected). */
  enabled: boolean
  /** Overrides the subject; supports `{{token}}` substitution. Null = code subject. */
  subjectOverride: string | null
  /**
   * Overrides the body; markdown-lite (`**bold**`, `[label](url)`, blank-line
   * paragraphs) + `{{token}}` substitution. Null = code body.
   */
  bodyMarkdown: string | null
  ctaMode: TemplateCtaMode
  /** Used when ctaMode is CUSTOM. */
  ctaLabelOverride: string | null
  /**
   * FEEDBACK_PROMPTS key — renders the one-click thumbs block on this event's
   * emails, eligibility-gated at send (docs/FEEDBACK_MODULE.md §3.3). Null = none.
   */
  feedbackPrompt: string | null
  /** Only PUBLISHED rows take effect; DRAFT rows are preview-only. */
  status: TemplateStatus
  version: number
}

/** Snapshot taken on publish, for rollback. */
export interface NotificationTemplateVersionSnapshot {
  event: NotificationEvent
  version: number
  subjectOverride: string | null
  bodyMarkdown: string | null
  ctaMode: TemplateCtaMode
  ctaLabelOverride: string | null
  publishedAt: string // ISO
  publishedByUserId: string | null
}

// ---------------------------------------------------------------------------
// Deliverability (mirror of Resend webhooks)
// ---------------------------------------------------------------------------

export type EmailDeliveryStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'OPENED'

export interface EmailDeliveryRecord {
  id: string
  event: NotificationEvent
  category: NotificationCategorySlug
  toEmail: string
  /** Resend message id (webhook correlation key). */
  providerMessageId: string | null
  status: EmailDeliveryStatus
  occurredAt: string // ISO
  /** Bounce/complaint detail from the provider, if any. */
  detail: string | null
}
