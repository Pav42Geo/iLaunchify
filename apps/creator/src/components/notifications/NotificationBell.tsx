'use client'

// Thin wrapper over the shared @ilaunchify/ui NotificationBell (in-app
// notifications P0, 2026-07-06) — passes the creator server actions + pink
// accent. Kept at this path so topbar imports don't change.

import { NotificationBell as SharedBell } from '@ilaunchify/ui'
import { markNotificationRead, markAllNotificationsRead } from './actions'

export function NotificationBell() {
  return (
    <SharedBell
      accent="pink"
      markRead={markNotificationRead}
      markAllRead={markAllNotificationsRead}
    />
  )
}
