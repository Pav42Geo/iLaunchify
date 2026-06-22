// Thin, best-effort notification wrapper for the support domain.
//
// The 5 SUPPORT_* values are members of the NotificationEvent enum, so
// SupportEvent is a subset and assignable directly. dispatchNotification is
// best-effort (never throws).

import { dispatchNotification } from '@ilaunchify/notifications'

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
    event: args.event,
    data: args.data,
    audience: args.audience,
  })
}
