'use client'

// Thin wrapper over the shared @ilaunchify/ui NotificationBell (in-app
// notifications P0, 2026-07-06) — admin uses info accent + danger badge.

import { NotificationBell as SharedBell } from '@ilaunchify/ui'
import { markNotificationRead, markAllNotificationsRead } from './actions'

export function NotificationBell() {
  return (
    <SharedBell
      accent="info"
      badgeTone="danger"
      emptyText="Inbox zero — nothing requires attention."
      markRead={markNotificationRead}
      markAllRead={markAllNotificationsRead}
    />
  )
}
