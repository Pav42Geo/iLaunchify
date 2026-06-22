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
// Branded transactional-email shell (reusable for one-off sends too).
export {
  renderEmailHtml,
  renderEmailText,
  ctaLabelForEvent,
  type EmailContent,
} from './email-html'
// One-off transactional email to an arbitrary address (e.g. admin invites).
export { sendTransactionalEmail, type SendEmailResult } from './email'
