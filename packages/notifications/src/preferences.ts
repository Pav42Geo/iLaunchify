// User notification preferences + quiet-hours helpers.

import { prisma } from '@ilaunchify/db'
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationPreference,
} from '@prisma/client'

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
