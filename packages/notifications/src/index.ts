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
  listNotificationsPage,
  countUnread,
  markRead,
  markAllRead,
  archiveNotification,
  autoArchiveRead,
} from './query'
export {
  getEffectivePreferences,
  setPreference,
  setQuietHours,
  // Category-keyed (Center) preference API — what the dispatcher + UI use.
  getEffectiveCategoryPreferences,
  getPreferenceMatrixView,
  setCategoryPreferenceChecked,
  type EffectiveCategoryPreference,
} from './preferences'
// Center control-plane DB access (cast-guarded until db:generate — center-db.ts).
export {
  getNotificationBranding,
  getNotificationSound,
  getTemplateOverride,
  getCategoryPreferenceRows,
  setCategoryPreference,
  recordEmailDelivery,
  isEmailSuppressed,
  EMAIL_SUPPRESSION_WINDOW_DAYS,
} from './center-db'
// One-click unsubscribe apply (route-handler engine, checklist E).
export { applyUnsubscribeToken, type ApplyUnsubscribeResult } from './unsubscribe-apply'
// Sample payloads for admin template preview + test-send (checklist D).
export { samplePayloadForEvent } from './sample-payload'
// Feedback module — pure engine (docs/FEEDBACK_MODULE.md, FB-A).
export {
  buildFeedbackToken,
  verifyFeedbackToken,
  buildFeedbackUrl,
  buildFeedbackLinkPair,
  FEEDBACK_TOKEN_MAX_AGE_MS,
  type FeedbackScoreValue,
  type FeedbackTokenPayload,
  type VerifyFeedbackResult,
} from './feedback-token'
export {
  FEEDBACK_PROMPTS,
  isFeedbackPromptKey,
  feedbackPrompt,
  promptWindowMs,
  promptTags,
  type FeedbackPromptKey,
  type FeedbackPromptConfig,
  type FeedbackSubjectType,
} from './feedback-prompts'
export {
  shouldRenderFeedbackBlock,
  FEEDBACK_USER_COOLDOWN_DAYS,
  type FeedbackEligibility,
  type FeedbackEligibilityInput,
} from './feedback-eligibility'
// Feedback DB layer (FB-B/C) — vote/enrich/account-form + dispatcher signals.
export {
  recordFeedbackVote,
  enrichFeedback,
  submitAccountFeedback,
  getFeedbackSignals,
  getPromptSetting,
  subjectIdFromPayload,
} from './feedback-db'
export type { EmailHeaderLink } from './center-types'
// Resend inbound webhook engine (checklist E) — Svix verify + parse + record.
export {
  verifyResendWebhook,
  parseResendEvent,
  recordResendEvent,
  type ParsedResendEvent,
  type ResendDeliveryStatus,
} from './resend-webhook'
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
// Daily digest for P2-severity events (dispatched with digest:true).
export { runNotificationDigest, type DigestResult } from './digest'
// Notification/Email Center — pure control-plane engine
// (docs/EMAIL_NOTIFICATION_CENTER.md, checklist section B).
export type {
  NotificationCategorySlug,
  NotificationCategoryConfig,
  CategoryPreferenceRow,
  NotificationBrandingConfig,
  NotificationTemplateOverride,
  NotificationTemplateVersionSnapshot,
  TemplateCtaMode,
  TemplateStatus,
  EmailDeliveryStatus,
  EmailDeliveryRecord,
} from './center-types'
export {
  NOTIFICATION_CATEGORIES,
  EVENT_CATEGORY,
  categoryForEvent,
  categoryConfig,
  isCategoryOptOutable,
  isValidCategorySlug,
  allCategories,
  eventsInCategory,
  resolveCategoryPreference,
  shouldDeliver,
  effectiveCategoryMatrix,
} from './categories'
export {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  buildOneClickUnsubscribeUrl,
  buildListUnsubscribeHeader,
  LIST_UNSUBSCRIBE_POST,
  UNSUBSCRIBE_TOKEN_MAX_AGE_MS,
  type VerifyUnsubscribeResult,
} from './unsubscribe'
export {
  substituteTokens,
  extractTokens,
  unknownTokens,
  tokenPaletteForEvent,
  EVENT_TOKEN_PALETTE,
} from './template-tokens'
export {
  resolveNotificationContent,
  renderEmailShell,
  markdownLiteToHtml,
  markdownLiteToText,
  DEFAULT_NOTIFICATION_BRANDING,
  type ResolveContentOptions,
  type ResolvedNotificationContent,
} from './resolve-content'
// P3 role-routed recipients (docs/PARTNER_ROLE_ACCOUNTS.md §6.3).
export {
  partnerServiceRecipients,
  partnerOrgAdminRecipients,
  dispatchToPartnerService,
  dispatchToPartnerAdmins,
} from './recipients'
