// @ilaunchify/notifications — fan-out helper for user-facing events.
//
// Use dispatchNotification() from server actions / webhook handlers / cron
// jobs. The dispatcher handles:
//   - Looking up user preferences (default-on per event + channel)
//   - Respecting quiet-hours window for EMAIL (IN_APP delivers regardless)
//   - Writing Notification rows (one per channel)
//   - Sending email via Resend (or no-op if AUTH_RESEND_KEY isn't set)
//
// The dispatcher never throws — failures degrade gracefully so notification
// problems don't break business operations.

export { dispatchNotification, type DispatchInput } from './dispatcher'
export {
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
} from './query'
export {
  getEffectivePreferences,
  setPreference,
  setQuietHours,
} from './preferences'
export { renderTemplate } from './templates'
export type { NotificationTemplate } from './templates'
