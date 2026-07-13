// Event → category mapping + category config + pure group-preference resolver
// (docs/EMAIL_NOTIFICATION_CENTER.md — "Group-level opt-out").
//
// Pure module: no I/O, no prisma. The dispatcher (Phase 2 wiring) fetches the
// user's category-keyed preference rows and asks `shouldDeliver` per channel.

import type { NotificationChannel, NotificationEvent } from '@ilaunchify/db'
import type {
  CategoryPreferenceRow,
  NotificationCategoryConfig,
  NotificationCategorySlug,
} from './center-types'

const BOTH: NotificationChannel[] = ['IN_APP', 'EMAIL']

/** Category registry — drives the preference matrix and the unsubscribe copy. */
export const NOTIFICATION_CATEGORIES: Record<
  NotificationCategorySlug,
  NotificationCategoryConfig
> = {
  account: {
    slug: 'account',
    label: 'Account & security',
    description: 'Application review, verification outcomes, and account status.',
    optOutable: false,
    defaultChannels: BOTH,
  },
  billing: {
    slug: 'billing',
    label: 'Billing',
    description: 'Payment failures, grace periods, and subscription changes.',
    optOutable: false,
    defaultChannels: BOTH,
  },
  orders: {
    slug: 'orders',
    label: 'Order & production updates',
    description: 'Dispatch activity, acceptance, changes, and production progress.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  proofs: {
    slug: 'proofs',
    label: 'Proofs & approvals',
    description: 'Pre-production proofs awaiting review and their outcomes.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  fulfillment: {
    slug: 'fulfillment',
    label: 'Fulfillment & receiving',
    description: 'Inbound receipts, receiving discrepancies, and release SLAs.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  cancellations: {
    slug: 'cancellations',
    label: 'Cancellations & disputes',
    description: 'Cancellation and dispute outcomes. These are mandatory notices.',
    optOutable: false,
    defaultChannels: BOTH,
  },
  compliance: {
    slug: 'compliance',
    label: 'Compliance reminders',
    description: 'Certificate and document expiry reminders.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  support: {
    slug: 'support',
    label: 'Support',
    description: 'Ticket activity, replies, resolutions, and SLA alerts.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  inventory: {
    slug: 'inventory',
    label: 'Inventory alerts',
    description: 'Channel stock level alerts and recoveries.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  reminders: {
    slug: 'reminders',
    label: 'Reminders & digests',
    description: 'Acceptance-deadline nudges, SLA-at-risk reminders, and daily digests.',
    optOutable: true,
    defaultChannels: BOTH,
  },
  marketing: {
    slug: 'marketing',
    label: 'Marketing & product updates',
    description:
      'Announcements and product news. Sent from a separate stream; consent recorded here.',
    optOutable: true,
    // Marketing is EMAIL-only and lives on the external ESP; no in-app rows.
    defaultChannels: ['EMAIL'],
  },
  legal: {
    slug: 'legal',
    label: 'Legal & policy updates',
    description: 'Changes to Terms, Privacy, and other legal documents. Mandatory notices.',
    optOutable: false,
    defaultChannels: BOTH,
  },
}

/**
 * Total event → category map. `Record<NotificationEvent, …>` makes the compiler
 * fail this file whenever a new event lands in the enum without a category —
 * that's intentional (every event MUST belong to exactly one group).
 */
export const EVENT_CATEGORY: Record<NotificationEvent, NotificationCategorySlug> = {
  // In-app P1 split of ORDER_NEEDS_ATTENTION (de-cast 2026-07-06 after push).
  ORDER_CANCELLATION_REQUESTED: 'cancellations',
  ORDER_DISPUTE_OPENED: 'cancellations',
  // Coverage batch 2026-07-06 (de-cast after push). 'account' (mandatory) on
  // purpose — team joins + channel connects are security-relevant confirmations.
  PARTNER_TEAM_MEMBER_JOINED: 'account',
  CREATOR_CHANNEL_CONNECTED: 'account',
  CREATOR_CHANNEL_DISCONNECTED: 'account',
  // Account & security (mandatory)
  SECTION_VERIFIED: 'account',
  SECTION_NEEDS_CHANGES: 'account',
  PARTNER_ACTIVATED: 'account',
  PARTNER_INVITED: 'account',
  NOMINATION_SERVICE_MISMATCH: 'account',
  PARTNER_APPLICATION_RECEIVED: 'account',
  // Co-creation marketplace (CO_CREATION_MARKETPLACE_SPEC §12)
  BRIEF_POSTED_MATCHED: 'orders',
  BRIEF_INTEREST_RECEIVED: 'orders',
  BRIEF_INTEREST_SHORTLISTED: 'orders',
  BRIEF_INTEREST_SELECTED: 'orders',
  BRIEF_INTEREST_PASSED: 'orders',
  BUILD_OBJECT_SUBMITTED: 'proofs',
  BUILD_OBJECT_CHANGES_REQUESTED: 'proofs',
  BUILD_OBJECT_APPROVED: 'proofs',
  // Milestone terms are money conversations → 'orders' like the brief events.
  MILESTONE_TERMS_PROPOSED: 'orders',
  MILESTONE_TERMS_AGREED: 'orders',
  MILESTONE_TERMS_DECLINED: 'orders',
  // Rooms & Messages hub — chat pings ride the proofs category (room work).
  ROOM_MESSAGE_RECEIVED: 'proofs',
  DIRECT_MESSAGE_RECEIVED: 'proofs',
  DESIGN_REVIEW_REQUESTED: 'proofs',
  DESIGN_REVIEW_DECISION: 'proofs',
  // Legal & policy updates (L4) — mandatory notice on material publish.
  LEGAL_DOCUMENT_UPDATED: 'legal',
  PARTNER_APPLIED: 'account',
  PARTNER_SUBMITTED: 'account',
  PACKAGING_APPROVED: 'account',
  PACKAGING_REJECTED: 'account',
  // Billing (mandatory)
  CREATOR_PAYMENT_FAILED: 'billing',
  CREATOR_SUBSCRIPTION_DOWNGRADED: 'billing',
  // Order & production updates
  DISPATCH_RECEIVED: 'orders',
  CREATOR_DISPATCH_ACCEPTED: 'orders',
  CREATOR_DISPATCH_CHANGES_REQUESTED: 'orders',
  CREATOR_DISPATCH_DECLINED: 'orders',
  CREATOR_DISPATCH_WITHDRAWN: 'orders',
  CREATOR_ORDER_FULLY_ACCEPTED: 'orders',
  ORDER_NEEDS_ATTENTION: 'orders',
  ADMIN_DISPATCH_WITHDRAWN: 'orders',
  // Proofs & approvals
  CREATOR_PROOF_AWAITING: 'proofs',
  PROOF_APPROVED: 'proofs',
  PROOF_REJECTED: 'proofs',
  // Fulfillment & receiving
  INBOUND_ASSIGNED: 'fulfillment',
  INBOUND_DELIVERED_UNCONFIRMED: 'fulfillment',
  RECEIVING_DISCREPANCY_OPENED: 'fulfillment',
  RECEIVING_DISCREPANCY_RESOLVED: 'fulfillment',
  RELEASE_SHIP_SLA_AT_RISK: 'fulfillment',
  // Cancellations & disputes (mandatory outcomes)
  CREATOR_ORDER_CANCELLED_BY_MANUFACTURER: 'cancellations',
  ADMIN_ORDER_CANCELLED_BY_MANUFACTURER: 'cancellations',
  CREATOR_ORDER_CANCELLED: 'cancellations',
  CREATOR_ORDER_DISPUTE_RESOLVED: 'cancellations',
  PARTNER_CANCELLATION_REVIEWED: 'cancellations',
  PARTNER_ORDER_DISPUTED: 'cancellations',
  // Compliance reminders
  CERT_EXPIRING_SOON: 'compliance',
  CERT_EXPIRED: 'compliance',
  ADMIN_CERT_EXPIRED_ON_PUBLISHED: 'compliance',
  DOC_EXPIRING_SOON: 'compliance',
  DOC_EXPIRED: 'compliance',
  // Support
  SUPPORT_TICKET_CREATED: 'support',
  SUPPORT_TICKET_REPLIED: 'support',
  SUPPORT_TICKET_RESOLVED: 'support',
  SUPPORT_TICKET_REOPENED: 'support',
  SUPPORT_SLA_BREACHED: 'support',
  SUPPORT_REFUND_REQUESTED: 'support',
  // Inventory alerts
  CREATOR_STOCK_ALERT: 'inventory',
  // Reminders & digests
  DISPATCH_ACCEPT_REMINDER: 'reminders',
  DISPATCH_SLA_AT_RISK: 'reminders',
  // F — job progress
  CREATOR_DISPATCH_PROGRESS: 'orders',
  // Feedback module — rating/review solicitation is a nudge, never mandatory.
  CREATOR_RATE_PARTNERS: 'reminders',
  // SR-2.2 — judge-your-sample prompt (verdict locks or reopens the chain).
  CREATOR_SAMPLE_VERDICT: 'reminders',
  // PS-8b — capability RFQ broadcast (a claimable job opportunity — a nudge).
  PARTNER_CAPABILITY_RFQ: 'reminders',
  // PS-8 follow-up — paused-for-coverage template is orderable again.
  COVERAGE_RESTORED: 'orders',
  MANUFACTURER_TEMPLATE_PAUSED: 'orders',
  // MM-7 — fee grace/promo started (positive change to their platform fee).
  MANUFACTURER_FEE_GRANT_STARTED: 'billing',
}

export function categoryForEvent(event: NotificationEvent): NotificationCategorySlug {
  return EVENT_CATEGORY[event]
}

export function categoryConfig(slug: NotificationCategorySlug): NotificationCategoryConfig {
  return NOTIFICATION_CATEGORIES[slug]
}

export function isCategoryOptOutable(slug: NotificationCategorySlug): boolean {
  return NOTIFICATION_CATEGORIES[slug].optOutable
}

export function isValidCategorySlug(slug: string): slug is NotificationCategorySlug {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_CATEGORIES, slug)
}

export function allCategories(): NotificationCategoryConfig[] {
  return Object.values(NOTIFICATION_CATEGORIES)
}

export function eventsInCategory(slug: NotificationCategorySlug): NotificationEvent[] {
  return (Object.keys(EVENT_CATEGORY) as NotificationEvent[]).filter(
    (e) => EVENT_CATEGORY[e] === slug,
  )
}

// ---------------------------------------------------------------------------
// Group-preference resolution (pure)
// ---------------------------------------------------------------------------

/**
 * Effective enabled/disabled for one (category, channel) given the user's
 * explicit rows. Rules, in order:
 *   1. Mandatory (non-opt-outable) categories are ALWAYS enabled — explicit
 *      rows cannot turn them off.
 *   2. An explicit row wins.
 *   3. Default: enabled iff the channel is in the category's defaultChannels.
 */
export function resolveCategoryPreference(
  category: NotificationCategorySlug,
  channel: NotificationChannel,
  rows: readonly CategoryPreferenceRow[],
): boolean {
  const cfg = NOTIFICATION_CATEGORIES[category]
  if (!cfg.optOutable) return true
  const row = rows.find((r) => r.category === category && r.channel === channel)
  if (row) return row.enabled
  return cfg.defaultChannels.includes(channel)
}

/** Event-level convenience: resolve the event's category, then its preference. */
export function shouldDeliver(
  event: NotificationEvent,
  channel: NotificationChannel,
  rows: readonly CategoryPreferenceRow[],
): boolean {
  return resolveCategoryPreference(categoryForEvent(event), channel, rows)
}

/**
 * Full matrix for the preference-center UI: every category × channel with the
 * user's rows overlaid (mandatory categories reported enabled + locked).
 */
export function effectiveCategoryMatrix(rows: readonly CategoryPreferenceRow[]): Array<{
  category: NotificationCategorySlug
  channel: NotificationChannel
  enabled: boolean
  locked: boolean
}> {
  const out: Array<{
    category: NotificationCategorySlug
    channel: NotificationChannel
    enabled: boolean
    locked: boolean
  }> = []
  for (const cfg of allCategories()) {
    for (const channel of BOTH) {
      // Marketing has no IN_APP surface — skip cells outside defaultChannels
      // only when the category can never use the channel.
      if (cfg.slug === 'marketing' && channel === 'IN_APP') continue
      out.push({
        category: cfg.slug,
        channel,
        enabled: resolveCategoryPreference(cfg.slug, channel, rows),
        locked: !cfg.optOutable,
      })
    }
  }
  return out
}
