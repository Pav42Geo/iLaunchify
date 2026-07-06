// DB access for the Notification/Email Center control plane.
// De-cast 2026-07-05 after the Center migration ran (was the single
// cast-guard file per docs/POST_PUSH_CASTGUARD_CLEANUP.md pattern) — all
// calls now use the typed generated client directly.
//
// Every read degrades gracefully (null / [] / no-op) so notification
// plumbing can never break business operations — matching dispatcher policy.

import { prisma, resolveLogoForPlacement } from '@ilaunchify/db'
import type { NotificationChannel, NotificationEvent } from '@ilaunchify/db'
import type {
  CategoryPreferenceRow,
  NotificationBrandingConfig,
  NotificationCategorySlug,
  NotificationTemplateOverride,
} from './center-types'

// ---------------------------------------------------------------------------
// Branding singleton
// ---------------------------------------------------------------------------

/**
 * The Theme Studio 'emailHeader' placement logo (Theme Studio → Logos), or
 * null. Only ever a STABLE public URL — resolveLogoForPlacement goes through
 * getPublicBrandLogos, which returns publicUrl-only (signed URLs would expire
 * inside already-delivered emails).
 */
async function emailHeaderPlacementLogo(): Promise<string | null> {
  try {
    const resolved = await resolveLogoForPlacement('emailHeader', 'light')
    return resolved.src
  } catch {
    return null
  }
}

/**
 * The branding row, or null when unset/unreachable (resolver falls back to
 * defaults). Logo precedence: explicit NotificationBranding.logoUrl → the
 * Theme Studio 'emailHeader' placement → text header (brand name).
 */
export async function getNotificationBranding(): Promise<Partial<NotificationBrandingConfig> | null> {
  try {
    const row = await prisma.notificationBranding.findUnique({
      where: { singletonKey: 'default' },
    })
    const placementLogo = row?.logoUrl ? null : await emailHeaderPlacementLogo()
    if (!row) return placementLogo ? { logoUrl: placementLogo } : null
    return {
      logoUrl: row.logoUrl ?? placementLogo,
      headerLinks: (row.headerLinks as NotificationBrandingConfig['headerLinks'] | null) ?? null,
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

/**
 * In-app notification sound config (Pavel 2026-07-06) — read by the feed APIs
 * so the bell knows whether/what to play. url null = the app's bundled default
 * (/sounds/notification.mp3). Graceful default: enabled with default sound.
 * De-cast 2026-07-06 after push.
 */
export async function getNotificationSound(): Promise<{ enabled: boolean; url: string | null }> {
  try {
    const row = await prisma.notificationBranding.findUnique({
      where: { singletonKey: 'default' },
    })
    return { enabled: row?.soundEnabled ?? true, url: row?.soundUrl ?? null }
  } catch {
    return { enabled: true, url: null }
  }
}

/**
 * In-app behavior settings (admin → Notifications → In-app). Stored on the
 * same singleton row. De-cast 2026-07-06 after push.
 */
export async function getInAppSettings(): Promise<{
  autoArchiveDays: number
  digestEnabled: boolean
}> {
  try {
    const row = await prisma.notificationBranding.findUnique({
      where: { singletonKey: 'default' },
    })
    return {
      autoArchiveDays: row?.inAppAutoArchiveDays ?? 30,
      // Cast-guard (in-app digest): read directly after db:push + db:generate.
      digestEnabled:
        (row as { inAppDigestEnabled?: boolean } | null)?.inAppDigestEnabled ?? true,
    }
  } catch {
    return { autoArchiveDays: 30, digestEnabled: true }
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
    const row = await prisma.notificationTemplate.findUnique({ where: { event } })
    if (!row) return null
    return {
      event: row.event,
      enabled: row.enabled,
      subjectOverride: row.subjectOverride,
      bodyMarkdown: row.bodyMarkdown,
      ctaMode: row.ctaMode,
      ctaLabelOverride: row.ctaLabelOverride,
      feedbackPrompt: row.feedbackPrompt,
      coalesceWindowMinutes: row.coalesceWindowMinutes ?? null,
      inAppTitleOverride: row.inAppTitleOverride,
      inAppBodyOverride: row.inAppBodyOverride,
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
    const rows = await prisma.notificationPreference.findMany({
      where: { userId, category: { not: null } },
      select: { category: true, channel: true, enabled: true },
    })
    return rows
      .filter((r): r is typeof r & { category: string } => r.category != null)
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
  await prisma.notificationPreference.upsert({
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
    const hit = await prisma.emailDelivery.findFirst({
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
    const row = await prisma.emailDelivery.findFirst({
      where: { providerMessageId, status: 'SENT' },
      select: { notificationId: true, event: true, category: true, toEmail: true },
    })
    if (!row) return null
    return {
      notificationId: row.notificationId,
      event: row.event,
      category: row.category,
      toEmail: row.toEmail,
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
    await prisma.emailDelivery.create({
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
