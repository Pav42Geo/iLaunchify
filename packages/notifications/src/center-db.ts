// DB access for the Notification/Email Center control plane.
//
// CAST-GUARDED (repo pattern, see docs/POST_PUSH_CASTGUARD_CLEANUP.md): the
// Center models (NotificationBranding / NotificationTemplate / EmailDelivery /
// NotificationPreference.category) land with the 2026-07-05 schema push. Until
// `pnpm db:push` + `pnpm db:generate` run, the generated client doesn't type
// them, so every access goes through the typed shim below. ALL Center
// cast-guards live in THIS file — post-regenerate cleanup replaces `centerDb()`
// call sites with direct `prisma.<model>` calls here and nowhere else.
//
// Every function degrades gracefully (null / [] / no-op) so notification
// plumbing can never break business operations — matching dispatcher policy.

import { prisma } from '@ilaunchify/db'
import type { NotificationChannel, NotificationEvent } from '@ilaunchify/db'
import type {
  CategoryPreferenceRow,
  NotificationBrandingConfig,
  NotificationCategorySlug,
  NotificationTemplateOverride,
  TemplateCtaMode,
  TemplateStatus,
} from './center-types'

// ---------------------------------------------------------------------------
// Typed shim over the not-yet-generated client (cast-guard)
// ---------------------------------------------------------------------------

interface BrandingRow {
  logoUrl: string | null
  brandName: string
  accentHex: string
  inkHex: string
  footerText: string | null
  unsubscribeText: string
  preferencesText: string
  preferenceCenterUrl: string | null
  fromName: string | null
  replyToEmail: string | null
}

interface TemplateRow {
  event: NotificationEvent
  enabled: boolean
  subjectOverride: string | null
  bodyMarkdown: string | null
  ctaMode: TemplateCtaMode
  ctaLabelOverride: string | null
  status: TemplateStatus
  version: number
}

interface PreferenceRow {
  category: string | null
  channel: NotificationChannel
  enabled: boolean
}

function centerDb() {
  return prisma as unknown as {
    notificationBranding: {
      findUnique: (args: unknown) => Promise<BrandingRow | null>
      upsert: (args: unknown) => Promise<BrandingRow>
    }
    notificationTemplate: {
      findUnique: (args: unknown) => Promise<TemplateRow | null>
      findMany: (args: unknown) => Promise<TemplateRow[]>
    }
    notificationPreference: {
      findMany: (args: unknown) => Promise<PreferenceRow[]>
      upsert: (args: unknown) => Promise<unknown>
    }
    emailDelivery: {
      create: (args: unknown) => Promise<unknown>
      findFirst: (args: unknown) => Promise<{
        id: string
        notificationId?: string | null
        event?: NotificationEvent | null
        category?: string | null
        toEmail?: string
      } | null>
    }
  }
}

// ---------------------------------------------------------------------------
// Branding singleton
// ---------------------------------------------------------------------------

/** The branding row, or null when unset/unreachable (resolver falls back to defaults). */
export async function getNotificationBranding(): Promise<Partial<NotificationBrandingConfig> | null> {
  try {
    const row = await centerDb().notificationBranding.findUnique({
      where: { singletonKey: 'default' },
    })
    if (!row) return null
    return {
      logoUrl: row.logoUrl,
      brandName: row.brandName,
      accentHex: row.accentHex,
      inkHex: row.inkHex,
      footerText: row.footerText,
      unsubscribeText: row.unsubscribeText,
      preferencesText: row.preferencesText,
      preferenceCenterUrl: row.preferenceCenterUrl,
      fromName: row.fromName,
      replyToEmail: row.replyToEmail,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Template override
// ---------------------------------------------------------------------------

/** The event's override row (any status — resolver decides what applies). */
export async function getTemplateOverride(
  event: NotificationEvent,
): Promise<NotificationTemplateOverride | null> {
  try {
    const row = await centerDb().notificationTemplate.findUnique({ where: { event } })
    if (!row) return null
    return {
      event: row.event,
      enabled: row.enabled,
      subjectOverride: row.subjectOverride,
      bodyMarkdown: row.bodyMarkdown,
      ctaMode: row.ctaMode,
      ctaLabelOverride: row.ctaLabelOverride,
      status: row.status,
      version: row.version,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Category preferences (the re-keyed NotificationPreference rows)
// ---------------------------------------------------------------------------

/** The user's explicit category rows ([] on error → defaults apply). */
export async function getCategoryPreferenceRows(
  userId: string,
): Promise<CategoryPreferenceRow[]> {
  try {
    const rows = await centerDb().notificationPreference.findMany({
      where: { userId, category: { not: null } },
      select: { category: true, channel: true, enabled: true },
    })
    return rows
      .filter((r): r is PreferenceRow & { category: string } => r.category != null)
      .map((r) => ({
        userId,
        category: r.category as NotificationCategorySlug,
        channel: r.channel,
        enabled: r.enabled,
      }))
  } catch {
    return []
  }
}

/** Upsert one (userId, category, channel) toggle. */
export async function setCategoryPreference(params: {
  userId: string
  category: NotificationCategorySlug
  channel: NotificationChannel
  enabled: boolean
}): Promise<void> {
  await centerDb().notificationPreference.upsert({
    where: {
      userId_category_channel: {
        userId: params.userId,
        category: params.category,
        channel: params.channel,
      },
    },
    create: {
      userId: params.userId,
      category: params.category,
      channel: params.channel,
      enabled: params.enabled,
    },
    update: { enabled: params.enabled },
  })
}

// ---------------------------------------------------------------------------
// Deliverability
// ---------------------------------------------------------------------------

/** How long a bounce/complaint suppresses sends to an address. */
export const EMAIL_SUPPRESSION_WINDOW_DAYS = 90

/**
 * True when the address had a bounce or spam complaint inside the suppression
 * window — the dispatcher skips the send (row written, emailError stamped).
 * Fails open (false) on error: a broken deliverability table must not block
 * transactional email.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - EMAIL_SUPPRESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const hit = await centerDb().emailDelivery.findFirst({
      where: {
        toEmail: email,
        status: { in: ['BOUNCED', 'COMPLAINED'] },
        occurredAt: { gte: since },
      },
      select: { id: true },
    })
    return hit != null
  } catch {
    return false
  }
}

/**
 * The SENT row's context for a provider message id — lets webhook lifecycle
 * events inherit event/category for per-event deliverability aggregates.
 */
export async function findDeliveryContext(providerMessageId: string): Promise<{
  notificationId: string | null
  event: NotificationEvent | null
  category: string | null
  toEmail: string
} | null> {
  try {
    const row = await centerDb().emailDelivery.findFirst({
      where: { providerMessageId, status: 'SENT' },
      select: { id: true, notificationId: true, event: true, category: true, toEmail: true },
    })
    if (!row) return null
    return {
      notificationId: row.notificationId ?? null,
      event: row.event ?? null,
      category: row.category ?? null,
      toEmail: row.toEmail ?? '',
    }
  } catch {
    return null
  }
}

/** Best-effort EmailDelivery row (never throws — deliverability is advisory). */
export async function recordEmailDelivery(params: {
  notificationId?: string | null
  // Nullable: webhook events for uncorrelated sends still get a row.
  event: NotificationEvent | null
  category: NotificationCategorySlug | string | null
  toEmail: string
  providerMessageId?: string | null
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'OPENED'
  detail?: string | null
}): Promise<void> {
  try {
    await centerDb().emailDelivery.create({
      data: {
        notificationId: params.notificationId ?? null,
        event: params.event ?? null,
        category: params.category ?? null,
        toEmail: params.toEmail,
        providerMessageId: params.providerMessageId ?? null,
        status: params.status,
        detail: params.detail ?? null,
      },
    })
  } catch {
    // advisory only
  }
}
