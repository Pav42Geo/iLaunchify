---
name: ilaunchify-notification-center
description: "Notification/Email Center architecture (built 2026-07-05). Code registry is source of truth for categories; DB override + branding layer over typed code templates (Shopify model); category-keyed opt-outs; signed one-click unsubscribe; Resend webhook deliverability + auto-suppression; job-progress timeline. Where everything lives and the invariants that must hold."
metadata:
  node_type: memory
  type: project
---

Built end-to-end by Cowork 2026-07-05 (Pavel decision: CW built all phases,
including former CODE items). Spec: `docs/EMAIL_NOTIFICATION_CENTER.md` ·
checklist: `docs/EMAIL_NOTIFICATION_CENTER_CHECKLIST.md`.

## Architecture (Shopify model — override, never replace)

Resolution at send time, all inside `dispatchNotification`:
category → recipient's group preference (mandatory bypasses) → suppression
check → `resolveNotificationContent` = PUBLISHED `NotificationTemplate` row
else typed code template → `{{token}}` substitution → global branded header +
body + global footer (+ signed unsubscribe link) → Resend send with
`List-Unsubscribe`/`List-Unsubscribe-Post` headers → `EmailDelivery` SENT row.

**Absent control-plane rows degrade to pre-Center behavior exactly** (code
template, locked-brand shell, default-on). Every control-plane read fails
soft — notification plumbing must never break business operations.

## Invariants (do not violate)

1. **The CODE registry is the source of truth for categories** —
   `packages/notifications/src/categories.ts`. `EVENT_CATEGORY` is a total
   `Record<NotificationEvent, slug>`: adding an enum value WITHOUT a category
   fails compile, on purpose. The `NotificationCategory` DB table only mirrors
   display copy (seed: `seed-notification-categories.ts` — keep in sync
   manually; db can't import notifications, circular dep).
2. **Every new event needs 3 registrations**: `TemplateData` + `renderTemplate`
   case (templates.ts), `EVENT_CATEGORY` entry, `EVENT_TOKEN_PALETTE` entry
   (type-checked against the payload keys).
3. **Mandatory categories** (`account`, `billing`, `cancellations`) can NEVER
   be opted out: resolver skips their unsubscribe link, token verify rejects
   them, `setCategoryPreferenceChecked` refuses to store rows, matrix renders
   them locked. All four layers must stay in agreement.
4. **Code templates are never deleted** — they're the git-versioned fallback.
   Admin "Revert to code" just deletes the override row.
5. **Payload values are escaped AFTER token substitution** — payloads can never
   inject HTML. Preview path === send path (same resolver), so previews are
   trustworthy.
6. **ETA/calendar dates format in UTC** (`timeZone:'UTC'`) — a midnight-UTC ETA
   must not read as the previous day in the Americas. Applies to
   dispatch-timeline, OrderTimelineView, ProgressUpdatePanel.
7. **`NotificationPreference` is category-keyed** (userId, category, channel);
   `event` column is nullable legacy, dispatcher ignores it. Don't resurrect
   per-event preferences.

## Where things live

- **Pure engine** (`packages/notifications/src/`): `categories.ts`,
  `template-tokens.ts`, `unsubscribe.ts` (HMAC v1 tokens, 90-day max age,
  secret always passed in — never read/logged), `resolve-content.ts`
  (+ `renderEmailShell` used by admin previews), `sample-payload.ts`,
  `resend-webhook.ts` (Svix verify, no svix dep). Selftest:
  `notification-center.selftest.ts` (tsx/compiled-node; vitest can't run in
  Cowork's sandbox — darwin esbuild).
- **IO layer**: `center-db.ts` (all control-plane DB access, graceful-degrade),
  `preferences.ts` (category API + `getPreferenceMatrixView`),
  `unsubscribe-apply.ts`, `dispatcher.ts`.
- **Schema**: `NotificationBranding` (singletonKey "default"),
  `NotificationTemplate` (@unique event, DRAFT/PUBLISHED + version),
  `NotificationTemplateVersion` (publish snapshots), `NotificationCategory`,
  `EmailDelivery` (nullable event/category for uncorrelated webhook rows),
  `DispatchProgressUpdate` + `OrderDispatch.currentEtaAt`.
- **Admin control plane**: `/notifications-center/{templates,branding,
  deliverability,log}` — sidebar Settings → Notifications group. Personal
  matrix: `settings/notifications` in ALL THREE apps (shared
  `CategoryPreferencesForm` copies + `getPreferenceMatrixView`).
- **Public routes**: marketing `/unsubscribe` (GET landing, applies token) +
  `/unsubscribe/one-click` (RFC 8058 POST — this URL goes in the header);
  creator `/api/webhooks/resend` (public `/api/webhooks` middleware prefix).
- **Job progress (F)**: partner `orders/[dispatchId]/progress-actions.ts` +
  `ProgressUpdatePanel` → creator order page renders `buildOrderTimeline`
  (`@ilaunchify/orders` dispatch-timeline.ts) via `OrderTimelineView`
  (`@ilaunchify/ui`). PHOTO kind modeled, upload UI not built yet.
- **Email header logo** (2026-07-05): precedence is explicit
  `NotificationBranding.logoUrl` → Theme Studio `emailHeader` placement
  (`/theme-studio/logos`, resolved via `resolveLogoForPlacement` →
  `getPublicBrandLogos`, PUBLIC URLs only — signed URLs expire in inboxes;
  needs `R2_PUBLIC_BASE_URL`) → text header. Applied identically in
  `getNotificationBranding`, the Branding page preview, and `previewBranding`.
- **Secrets** (registered in admin `/developer`): `AUTH_RESEND_KEY`,
  `AUTH_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `NOTIFICATION_UNSUBSCRIBE_SECRET`
  (rotating it expires links in already-sent emails), `NEXT_PUBLIC_MARKETING_URL`
  (unsubscribe host, default localhost:3010).

## Deliverability + suppression

Dispatcher writes SENT rows with the Resend message id; the webhook correlates
lifecycle events back via `findDeliveryContext`. Any BOUNCED/COMPLAINED within
90 days (`EMAIL_SUPPRESSION_WINDOW_DAYS`) auto-suppresses the address — send
skipped, Notification row kept with `emailError: 'suppressed: …'`. Suppression
check fails OPEN (broken deliverability table must not block email).

## Marketing boundary (G — still open)

Marketing email stays EXTERNAL (separate ESP + subdomain; Resend Broadcasts/
Loops → Customer.io). The `marketing` category (EMAIL-only, no in-app) already
exists as the consent record — the only integration point is bidirectional
opt-in sync with whatever ESP Pavel picks. Do NOT build campaign tooling into
this Center.

## Audit entity types added

`NotificationTemplate`, `NotificationBranding`, `NotificationPreference`
(packages/audit types.ts). Every admin mutation + preference toggle writes one.
