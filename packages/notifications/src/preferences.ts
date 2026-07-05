// User notification preferences + quiet-hours helpers.
//
// 2026-07-05 — the Center re-keys preferences to (userId, CATEGORY, channel)
// (docs/EMAIL_NOTIFICATION_CENTER.md, group-level opt-out). The category-keyed
// API below is what the dispatcher + preference-center UI use; the legacy
// per-event functions remain for the old 8-event settings page until D-phase
// replaces it, but the dispatcher no longer consults them.

import { prisma } from '@ilaunchify/db'
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationPreference,
} from '@ilaunchify/db'
import {
  NOTIFICATION_CATEGORIES,
  effectiveCategoryMatrix,
  isValidCategorySlug,
} from './categories'
import { getCategoryPreferenceRows, setCategoryPreference } from './center-db'
import type { NotificationCategorySlug } from './center-types'

export interface EffectivePreference {
  event: NotificationEvent
  channel: NotificationChannel
  enabled: boolean       // default true unless an explicit row says otherwise
}

const ALL_EVENTS: NotificationEvent[] = [
  'SECTION_VERIFIED',
  'SECTION_NEEDS_CHANGES',
  'PARTNER_ACTIVATED',
  'DISPATCH_RECEIVED',
  'DISPATCH_ACCEPT_REMINDER',
  'PARTNER_APPLIED',
  'PARTNER_SUBMITTED',
  'ORDER_NEEDS_ATTENTION',
]

const ALL_CHANNELS: NotificationChannel[] = ['EMAIL', 'IN_APP']

/**
 * Return the user's effective preference matrix — one entry per
 * (event, channel) pair, with rows from NotificationPreference overlaid
 * on top of the default (enabled).
 */
export async function getEffectivePreferences(
  userId: string,
): Promise<EffectivePreference[]> {
  const explicit = await prisma.notificationPreference.findMany({
    where: { userId },
  })
  const byKey = new Map<string, NotificationPreference>(
    explicit.map((p) => [`${p.event}:${p.channel}`, p]),
  )

  const out: EffectivePreference[] = []
  for (const event of ALL_EVENTS) {
    for (const channel of ALL_CHANNELS) {
      const row = byKey.get(`${event}:${channel}`)
      out.push({
        event,
        channel,
        enabled: row?.enabled ?? true,
      })
    }
  }
  return out
}

/**
 * Upsert a single preference toggle. Use enabled=true to remove an opt-out;
 * we keep the row but flip the boolean for audit clarity.
 */
export async function setPreference(params: {
  userId: string
  event: NotificationEvent
  channel: NotificationChannel
  enabled: boolean
}): Promise<void> {
  await prisma.notificationPreference.upsert({
    where: {
      userId_event_channel: {
        userId: params.userId,
        event: params.event,
        channel: params.channel,
      },
    },
    create: {
      userId: params.userId,
      event: params.event,
      channel: params.channel,
      enabled: params.enabled,
    },
    update: { enabled: params.enabled },
  })
}

/**
 * Read whether a specific event+channel is enabled for a user.
 * Default: enabled unless an explicit row says otherwise.
 */
export async function isEnabled(
  userId: string,
  event: NotificationEvent,
  channel: NotificationChannel,
): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_event_channel: { userId, event, channel } },
  })
  return row?.enabled ?? true
}

// ---------------------------------------------------------------------------
// Category-keyed preferences (the Center's group-level opt-out)
// ---------------------------------------------------------------------------

export interface EffectiveCategoryPreference {
  category: NotificationCategorySlug
  channel: NotificationChannel
  enabled: boolean
  /** Mandatory categories — rendered on + disabled in the matrix UI. */
  locked: boolean
}

/**
 * Full category × channel matrix for the preference-center UI: every category
 * with the user's explicit rows overlaid on the defaults (mandatory categories
 * report enabled + locked).
 */
export async function getEffectiveCategoryPreferences(
  userId: string,
): Promise<EffectiveCategoryPreference[]> {
  const rows = await getCategoryPreferenceRows(userId)
  return effectiveCategoryMatrix(rows)
}

/**
 * View-model for the preference-center UI (all three apps): the category
 * descriptors + the user's effective cells, shaped for
 * `<NotificationPreferenceMatrix />` (@ilaunchify/ui).
 */
export async function getPreferenceMatrixView(userId: string): Promise<{
  categories: Array<{
    slug: string
    label: string
    description: string
    locked: boolean
    channels: NotificationChannel[]
  }>
  cells: Array<{ category: string; channel: NotificationChannel; enabled: boolean }>
}> {
  const effective = await getEffectiveCategoryPreferences(userId)
  return {
    categories: Object.values(NOTIFICATION_CATEGORIES).map((c) => ({
      slug: c.slug,
      label: c.label,
      description: c.description,
      locked: !c.optOutable,
      channels: c.defaultChannels,
    })),
    cells: effective.map((e) => ({
      category: e.category,
      channel: e.channel,
      enabled: e.enabled,
    })),
  }
}

/**
 * Toggle one (category, channel). Rejects unknown slugs; mandatory categories
 * are rejected too — the dispatcher would ignore the row anyway, and storing
 * it would misrepresent the user's actual deliveries.
 */
export async function setCategoryPreferenceChecked(params: {
  userId: string
  category: string
  channel: NotificationChannel
  enabled: boolean
}): Promise<{ ok: true } | { ok: false; reason: 'unknown-category' | 'not-opt-outable' }> {
  if (!isValidCategorySlug(params.category)) return { ok: false, reason: 'unknown-category' }
  if (!NOTIFICATION_CATEGORIES[params.category].optOutable) {
    return { ok: false, reason: 'not-opt-outable' }
  }
  await setCategoryPreference({
    userId: params.userId,
    category: params.category,
    channel: params.channel,
    enabled: params.enabled,
  })
  return { ok: true }
}

export async function setQuietHours(params: {
  userId: string
  startUtc: number | null     // minutes since UTC midnight, 0..1439
  endUtc: number | null
}): Promise<void> {
  await prisma.user.update({
    where: { id: params.userId },
    data: {
      quietHoursStartUtc: params.startUtc,
      quietHoursEndUtc: params.endUtc,
    },
  })
}

/**
 * True if the current UTC time falls within the user's quiet hours window.
 * Handles wraparound (e.g. start=22:00, end=07:00).
 */
export function isInQuietHours(
  quietHoursStartUtc: number | null,
  quietHoursEndUtc: number | null,
  now: Date = new Date(),
): boolean {
  if (quietHoursStartUtc == null || quietHoursEndUtc == null) return false
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (quietHoursStartUtc <= quietHoursEndUtc) {
    // Same-day window (e.g. 13:00 → 17:00)
    return nowMin >= quietHoursStartUtc && nowMin < quietHoursEndUtc
  }
  // Overnight window (e.g. 22:00 → 07:00)
  return nowMin >= quietHoursStartUtc || nowMin < quietHoursEndUtc
}
