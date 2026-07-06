'use client'

// Thin wrapper over the shared @ilaunchify/ui NotificationBell (in-app
// notifications P0, 2026-07-06) — partner uses the info-blue accent.

import { NotificationBell as SharedBell } from '@ilaunchify/ui'
import { markNotificationRead, markAllNotificationsRead } from './actions'

export function NotificationBell() {
  return (
    <SharedBell
      accent="info"
      emptyText="You're all caught up."
      markRead={markNotificationRead}
      markAllRead={markAllNotificationsRead}
    />
  )
}
