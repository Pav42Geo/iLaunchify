// Thin, best-effort notification wrapper for the support domain.
//
// The 5 SUPPORT_* values are additive on the NotificationEvent enum but the
// generated Prisma client won't know them until the Mac runs `db push` +
// `db generate` (see HANDOFF-support-package.md). dispatchNotification is
// best-effort (never throws; a write with an unknown enum is swallowed), so
// these calls are safe to ship ahead of the migration. The single cast here
// is the only place the not-yet-generated literals cross into the typed API;
// drop it after the migration (search "SUPPORT-ENUM-CAST").

import { dispatchNotification } from '@ilaunchify/notifications'
import type { NotificationEvent } from '@ilaunchify/db'

export type SupportEvent =
  | 'SUPPORT_TICKET_CREATED'
  | 'SUPPORT_TICKET_REPLIED'
  | 'SUPPORT_TICKET_RESOLVED'
  | 'SUPPORT_TICKET_REOPENED'
  | 'SUPPORT_SLA_BREACHED'

export async function notifySupport(args: {
  userId: string
  event: SupportEvent
  data: Record<string, unknown>
  audience?: 'admin' | 'partner' | 'creator'
}): Promise<void> {
  await dispatchNotification({
    userId: args.userId,
    // SUPPORT-ENUM-CAST — remove after db push + generate adds the enum values.
    event: args.event as unknown as NotificationEvent,
    data: args.data,
    audience: args.audience,
  })
}
