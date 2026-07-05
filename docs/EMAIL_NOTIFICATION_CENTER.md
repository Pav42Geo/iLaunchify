# Email & Notification Center — research, current-state fit, and plan

**Date:** 2026-07-05. Answers: (1) how major SaaS platforms surface partner-type job progress and
notify customers; (2) what iLaunchify does today and whether it matches partners' daily flow; (3) what
to build so partners can submit accurate, fully-detailed progress; (4) whether to build an Email
Management Center with branded templates that notify creators + all interested partners; (5) the plan
for that center covering every platform notification need.

## TL;DR

- **We already have a strong notification ENGINE, but no CONTROL PLANE.** `@ilaunchify/notifications` has a
  dispatcher, a 48-event typed template system, in-app + email dual-channel, quiet hours, daily digest
  batching, role-routed recipients, and a branded HTML email shell. What's missing: editable templates,
  DB-backed branding, a full preference matrix (only 8/48 events are user-togglable), deliverability
  tracking, and any admin UI. Templates + brand colors are **hardcoded in TypeScript**.
- **Our partner job-progress capture does NOT match the industry daily-flow.** Partners only flip FSM
  states on an action (`ACCEPTED → PRODUCING → READY → SHIPPED`). There's no interim progress, no
  partner-entered ETA mid-production, no notes/photos, and no per-dispatch timeline the creator watches.
  MES/MRP tools (MRPeasy, Katana) report at **two levels** — manufacturing-order AND operation/step — from
  the shop floor in real time; fulfillment (ShipBob) exposes fine sub-statuses + tracking sync. We're a
  level coarser than partners expect.
- **Yes — build the Email/Notification Management Center**, and add richer job-progress capture. The
  payload is already there; we're building the missing control plane + the finer progress signal.
- **Recommended template architecture (Shopify model):** keep the typed CODE templates as the default/
  fallback, and layer a DB OVERRIDE + a global BRANDING layer on top. Admin edits subject/body/CTA per
  event with a token palette; a singleton branding row holds logo + accent + footer. Nothing typed is
  thrown away; the center just overrides and brands.

## Part 1 — How major platforms do it

### Partner → customer job-progress + notifications
- **Printful / Printify (POD production partners).** The production platform pushes each status transition
  (order received → in production → shipped/fulfilled, plus on-hold/canceled) to the merchant in real time
  via **webhooks**, and syncs tracking straight onto the merchant's channel order. Status taxonomy is
  coarse but strictly event-driven; the merchant decides whether end-buyers get emails.
  ([Printify webhooks](https://developers.printify.com/) · [Printful webhooks](https://www.printful.com/docs/webhooks) · [Printify order statuses](https://help.printify.com/hc/en-us/articles/15076632315665-What-does-the-status-of-my-order-mean))
- **MRPeasy / Katana (MES/MRP).** Two granularities: **manufacturing-order level** for high-level progress
  and **production-operation level** for step-by-step tracking. Statuses are auto-derived from operation
  start/finish (New → Scheduled → In progress → Done), and shop-floor workers report progress, material
  usage, and deviations from a phone/tablet in real time.
  ([MRPeasy MOs](https://www.mrpeasy.com/resources/user-manual/production-planning/manufacturing-orders/) · [MRPeasy production reporting](https://www.mrpeasy.com/blog/production-reporting/) · [Katana operation statuses](https://support.katanamrp.com/en/articles/5914345-production-operation-statuses))
- **ShipBob (fulfillment).** Fine-grained sub-statuses (inventory allocated → picking → labeled → tracking
  uploaded), tracking auto-synced to the merchant's channel, a **Notifications Panel** of action items,
  merchant email subscriptions, and webhooks for shipment events. Proactive shipment notifications are
  framed as a CX lever.
  ([ShipBob order status](https://support.shipbob.com/s/article/Order-Status) · [status reference](https://developer.shipbob.com/status-reference) · [notifications panel](https://support.shipbob.com/s/article/Notifications-Panel) · [shipment notifications](https://www.shipbob.com/blog/shipping-notifications/))

**Pattern:** an event-driven status model with per-status auto-notification, a portal/webhook, an
action-item panel, tracking sync — and, crucially, **real-time operation-level progress reported by the
partner from the floor**, not just a state that flips when a job is already done.

### Transactional email / template management
- **Shopify (the gold standard for self-serve).** Settings → Notifications: one editable template per
  event, Liquid variables, a **global branding layer** (logo + accent color applied to every template),
  a `{{ custom_message }}` injection point, and preview.
  ([customizing templates](https://help.shopify.com/en/manual/fulfillment/setup/notifications/customizing-notification-template) · [variables reference](https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables))
- **Postmark.** Layouts + partials + variables (Mustachio), pre-built templates for common types, inline
  CSS for client compatibility, tagging + per-type delivery/open analytics.
  ([best practices](https://postmarkapp.com/guides/transactional-email-best-practices) · [templates](https://postmarkapp.com/email-templates))
- **Resend (our provider).** Built on **React Email** — code-based templates, which matches our current
  in-code rendering. ([Resend vs Postmark](https://postmarkapp.com/compare/resend-alternative))
- **Customer.io.** Edit message contents via UI or API; a transactional API.
  ([transactional email](https://docs.customer.io/journeys/send/transactional/email/))
- **Best-practice notes:** light branding on high-frequency notifications, full branding on account
  emails; personalize (name, recipient timezone); version/draft templates; review delivery stats per type.

## Part 2 — What iLaunchify has today (from the audit)

Engine (`@ilaunchify/notifications`) — architecturally sound:
- `dispatchNotification({ userId, event, data, audience, digest })` writes an IN_APP row (always) + an
  EMAIL row (respects quiet hours), best-effort Resend send, `emailSentAt`/`emailError` stamped.
- **48 typed events** (`NotificationEvent` enum) covering onboarding, dispatch workflow (creator/partner/
  admin), billing, cancellation/dispute, cert/doc expiry, support, FC receiving, proof loop, stock alerts.
- `renderTemplate(event, data) → { title, body, link }` — one typed branch per event.
- `renderEmailHtml` — table-based inline-CSS shell with the LOCKED brand colors **hardcoded** (`#FF2E63`
  etc.), pink accent bar, CTA button, unsubscribe footer, preheader; `renderEmailText` for multipart.
- Daily digest batching (`digest:true` payload tag → one summary email/user via cron).
- Role-routed recipients (`partnerServiceRecipients`, `partnerOrgAdminRecipients`, `dispatchToPartnerService`).
- `Notification` + `NotificationPreference` models; quiet-hours on `User`.

Dispatch FSM (`packages/orders/src/dispatch-fsm.ts`): `PENDING_ACCEPT → ACCEPTED → PRODUCING →
QUALITY_CHECK → READY → SHIPPED → IN_TRANSIT → DELIVERED` (+ DECLINED/TIMED_OUT/FAILED_QC/CANCELLED).
`OrderDispatch` has per-state timestamps, tracking fields, proof rounds, production lots, inbound receipts,
delay proposal, change request, decline/withdraw reasons.

## Part 3 — Does this match partners' daily-basis flow?

**Email/notification plumbing: yes.** Dual-channel, digest, role-routing, and a branded shell are all
present and fire on the right events (manufacturer/printer/co-packer get `DISPATCH_RECEIVED` in-app+email;
proof loop, FC receiving, and creator dispatch events are wired).

**Partner job-progress capture: no — this is the real gap.** Compared to the MES/ShipBob norm:

| Industry norm | iLaunchify today |
|---|---|
| Operation/step-level progress reported from the floor in real time | Only FSM state flips on an action; no sub-steps |
| Partner-entered ETA updated mid-production | ETA only via a one-time delay proposal at start |
| Interim notes / deviations / photos on the job | Notes only on decline/QC-fail/change-request; photos only on proofs/QC |
| A live per-order timeline the customer watches | Creator sees a 4-phase bar + per-dispatch status pill; no interim timestamps, notes, or ETA changes |
| Tracking sub-statuses + sync | Tracking only after SHIPPED; no pre-ship "picking/labeled" signal |

So partners can't currently give creators the accurate, detailed, running progress that Printful/ShipBob-
style customers expect, and creators have thin visibility between "accepted" and "shipped."

### What to build for accurate, detailed progress submission
1. **`DispatchProgressUpdate`** — a partner-authored, creator-visible timeline entry: `kind`
   (NOTE / ETA / PHOTO / MILESTONE), `body`, `etaAt`, `photoAssetId`, `milestone`, author, timestamp. This
   is the operation-level signal, without forcing a full MES.
2. **Running ETA on the dispatch** (`currentEtaAt`) that a partner can revise, with each revision emitting a
   creator notification (a new `CREATOR_DISPATCH_PROGRESS` event) — matching the "proactive update" norm.
3. **Creator order timeline** fed by state timestamps + `DispatchProgressUpdate` (the piece creators are
   missing), so the running story is visible per dispatch.
4. Optional V1.5: lightweight **milestone checklist** per dispatch type (e.g. printer: proof → plates →
   printing → finishing → ready), the closest low-cost analog to operation-level tracking.

## Part 4 — The Email & Notification Management Center

**Verdict: build it.** The engine exists; we're adding the control plane so admins author beautiful branded
templates and automate every platform notification, and so creators + all interested partners are reliably
and consistently notified.

### Template composition — global Header + per-event Body + global Footer
Every email is assembled from three parts so the chrome is set once and the message is set per event:
- **Header (global):** logo, accent bar, from-name — one setting for all emails.
- **Body (per event):** the message — subject + body + CTA, editable per `NotificationEvent`.
- **Footer (global):** brand footer text, the **unsubscribe line**, and a **"Manage your email
  preferences" link** to the control center. One setting for all emails.

The header/footer live on the branding singleton; only the body is per-event. This is exactly the
Shopify "global branding + per-notification body" split.

### Group-level opt-out (unsubscribe → preference center)
Users opt out of a **group of messages, not one event at a time.** Each event belongs to a
**notification category** (group); the footer's unsubscribe link opts the user out of *that email's
category* in one click, and the "Manage preferences" link opens the full control center where they
toggle any group × channel.

Proposed categories (each event maps to exactly one):

| Category | Example events | Opt-outable? |
|---|---|---|
| Account & security | partner activation, section verified/needs-changes | No (mandatory) |
| Billing | payment failed, subscription downgraded | No (mandatory) |
| Order & production updates | dispatch received/accepted/declined, progress, fully-accepted | Creator/partner: **yes** |
| Proofs & approvals | proof awaiting/approved/rejected | Yes |
| Fulfillment & receiving | inbound unconfirmed, receiving discrepancy, release SLA | Yes |
| Cancellations & disputes | order cancelled, dispute resolved, cancellation reviewed | **Mandatory for outcomes**, optional for reminders |
| Compliance reminders | cert/doc expiring/expired | Yes |
| Support | ticket created/replied/resolved/SLA | Yes |
| Inventory alerts | creator stock alert | Yes |
| Reminders & digests | accept reminders, daily digest | Yes |

**Transactional vs optional:** mandatory categories (account/security, billing, legally-required
cancellation/dispute *outcomes*) still show a "Manage preferences" link but no unsubscribe toggle —
they're transactional. Only optional categories carry a working unsubscribe. Every email footer carries
both links regardless (best practice + CAN-SPAM-safe).

### Architecture — DB override over code fallback (Shopify model)
Keep the typed CODE templates as the **default + fallback** (they're git-versioned, type-checked, and
React-Email-compatible with Resend). Layer on:
- **`NotificationBranding`** (singleton): `logoUrl`, `accentHex` (default `#FF2E63`), `inkHex`,
  **`headerHtml`/header settings**, **`footerText`**, **`unsubscribeText`**, **`preferenceCenterUrl`**,
  `fromName`, `replyToEmail`. The email shell reads these instead of the hardcoded constants and injects
  the resolved unsubscribe + preferences links into the footer.
- **`NotificationTemplate`** (one optional row per event — the BODY only): `enabled`, `subjectOverride`,
  `bodyMarkdown`, `ctaMode` (AUTO / CUSTOM / NONE) + `ctaLabelOverride`, `status` (DRAFT / PUBLISHED),
  `version`, audit. When a PUBLISHED row exists it overrides the code template's subject/body/CTA;
  otherwise the code template renders. Tokens are the event's **typed payload keys**, surfaced to the
  admin as a click-to-insert palette (e.g. `{{orderRef}}`, `{{partnerName}}`) — our Liquid-variable
  equivalent, safely substituted.
- **`NotificationCategory`** (config/table): `slug`, `label`, `description`, `optOutable`, `defaultChannels`;
  plus a pure **event → category** lookup. Drives grouping + the opt-out matrix.
- **`NotificationPreference`** keyed by **(userId, category, channel)** — group-level, replacing the
  current 8-event-only per-event list. `dispatchNotification` checks the recipient's category preference
  before writing the EMAIL row (mandatory categories bypass the check).
- **`NotificationTemplateVersion`** (optional): snapshot on publish for rollback.
- **`EmailDelivery`**: mirror Resend delivery/bounce/complaint/open webhooks → per-event deliverability +
  a bounce/complaint suppression signal.

Resolution order at send time: resolve the event's category → check the recipient's group preference
(skip if opted out & optOutable) → `PUBLISHED NotificationTemplate override` else `code renderTemplate`
→ substitute payload tokens → compose **global header + body + global footer** (footer gets the signed
per-(user, category) unsubscribe link + preference-center link).

### One-click unsubscribe link
Each email's footer unsubscribe URL is a **signed token over (userId, category)** — no login required,
one click sets that group's preference off, and it powers the `List-Unsubscribe` header (one-click
unsubscribe, Gmail/Yahoo requirement). Token build/verify is a pure HMAC function (secret passed in at
runtime; never read or logged) — Cowork-ownable.

### Admin surfaces (v2 pattern — `v2-admin-surface-builder`)
- **Notifications → Templates**: list of all 48 events (source: code default / customized), edit drawer
  (subject, body with token palette, CTA), live preview (email + in-app), **test send**, publish/rollback,
  per-event enable/disable.
- **Notifications → Branding**: logo, accent, ink, footer, from-name, reply-to; one preview.
- **Notifications → Deliverability**: per-event sent/delivered/bounced/complained/opened from `EmailDelivery`;
  suppression list.
- **Notifications → Log**: recipient audit (who got what, when, channel, status) — filter the `Notification`
  + `EmailDelivery` join.
- **Full 48-event preference matrix** on the user side (today only 8 are togglable).

### Automation / triggers
No new trigger wiring needed for existing events — they already `dispatchNotification`. The center changes
only how each notification is RENDERED and BRANDED, plus adds the new job-progress event
(`CREATOR_DISPATCH_PROGRESS`) and the "all interested partners" fan-out (ensure every dispatch's partner —
incl. the FC once its leg exists per docs/PARTNER_ORDER_PACKETS.md G2 — is a recipient on shared-order
events). Optional: admin-triggered broadcast (e.g. "maintenance window") as a one-off transactional send to
a role segment, reusing `sendTransactionalEmail`.

### Phasing
1. **Cowork (pure, collision-free — buildable now):**
   - `resolveNotificationContent(event, payload, { templateOverride?, branding? }) → { subject, html, text }`
     — composes **global header + per-event body + global footer**, applies the template override or code
     fallback, and substitutes payload tokens.
   - token substitution + a **token-palette extractor** (available `{{vars}}` per event).
   - the **event → category** lookup + category config, and a pure `isCategoryOptOutable` / group-preference
     resolver.
   - the **signed unsubscribe token** build/verify (HMAC; secret passed in, never read/logged) + the
     `List-Unsubscribe` header value builder.
   - TS types for the new models. All unit-tested in `@ilaunchify/notifications`.
2. **Code / prisma-migrator:** the `NotificationBranding` (header/footer/unsubscribe/preference-url) /
   `NotificationTemplate` / `NotificationCategory` / `NotificationTemplateVersion` / `EmailDelivery` models
   (additive) + `NotificationPreference` re-key to (userId, category, channel); wire `dispatchNotification`
   → the resolver + group-preference check.
3. **Code (admin v2):** the four Notifications surfaces + the **group × channel** preference matrix + the
   category editor.
4. **Code:** the Resend inbound webhook → `EmailDelivery` + suppression; the one-click unsubscribe route.
5. **Code / prisma-migrator + partner UI:** `DispatchProgressUpdate` + `currentEtaAt` +
   `CREATOR_DISPATCH_PROGRESS` + the creator order timeline (the job-progress gap).

### What's Cowork vs Code
- **Cowork owns (pure, new files):** the resolver engine (header/body/footer composition), token
  substitution/extraction, category lookup + group-preference resolver, unsubscribe-token build/verify +
  `List-Unsubscribe` builder, branding merge, model TS types, and pure job-progress helpers (e.g. building
  the creator timeline from state timestamps + progress updates). Presentational admin/partner components
  (template preview card, preference matrix, timeline view) are Cowork-ownable too.
- **Code owns (hot files / schema / wiring):** the Prisma models, `dispatchNotification`/`renderEmailHtml`
  wiring, the group-preference gate, the admin server actions, the Resend + unsubscribe routes, and the
  partner progress-submit action.

## Part 5 — Marketing email (scope + platform boundary)

**Marketing does NOT belong in this transactional center.** Keep the two streams separate:
- **Transactional** (order/production/account/billing/support) → this Center, in-house on Resend, its own
  subdomain (e.g. `notifications.ilaunchify.com`). Time-sensitive; must never be at risk.
- **Marketing / lifecycle** (announcements, newsletters, activation drips, winback, partner recruitment)
  → a **dedicated external platform on a separate subdomain** (e.g. `news.ilaunchify.com`). Mixing the two
  on one identity risks a promo's complaints dragging down transactional deliverability — the emails a
  partner needs to fulfill an order. ([separation best practice](https://messageflow.com/blog/email-deliverability-2026/) · [transactional vs marketing](https://www.mailjet.com/blog/email-best-practices/transactional-vs-marketing-email/))

**Buy marketing tooling, don't build it.** Segmentation, journeys, A/B, send-time optimization, campaign
analytics, and a builder are a whole product; in 2026 AI-native platforms do agentic campaign
orchestration, predictive winback, and content/subject generation natively — not worth rebuilding in our
transactional stack. ([Klaviyo 2026 trends](https://www.klaviyo.com/blog/marketing-automation-trends) · [AI email tools for SaaS](https://www.sequenzy.com/blog/best-ai-email-marketing-tools))

**Audience = iLaunchify → creators & partners only** (B2B SaaS lifecycle). **Not end-buyers** — they never
touch iLaunchify (business model); creators market to their own buyers via their own channels. This keeps
the choice firmly B2B.

**Platform recommendation:**
- **Now (low-lift):** Resend Broadcasts (no new vendor / one less domain to warm) or Loops (AI-native,
  dev-friendly) for announcements + simple newsletters.
- **Graduate to:** **Customer.io** for real behavioral automation — B2B/product-led, triggers journeys off
  the product events we already emit (order placed, product published, tier upgrade), with an AI content
  layer. ([Customer.io for B2B SaaS](https://aiproductivity.ai/blog/best-email-marketing-tools-2026/))
- **Skip** Klaviyo (B2C/e-commerce-shaped) and classic Mailchimp for this audience.

**The one integration point — consent.** This Center's category model is the **source of truth for
opt-in**. Add a **"Marketing & product updates"** category (genuinely opt-outable, unlike transactional),
and sync opt-in/out **bidirectionally** with the ESP so an unsubscribe anywhere is honored everywhere —
one consent record, one preference center. Everything else about the marketing platform stays external.

## Sources
- Printify webhooks — https://developers.printify.com/
- Printful webhooks — https://www.printful.com/docs/webhooks
- Printify order statuses — https://help.printify.com/hc/en-us/articles/15076632315665-What-does-the-status-of-my-order-mean
- MRPeasy manufacturing orders — https://www.mrpeasy.com/resources/user-manual/production-planning/manufacturing-orders/
- MRPeasy production reporting — https://www.mrpeasy.com/blog/production-reporting/
- Katana operation statuses — https://support.katanamrp.com/en/articles/5914345-production-operation-statuses
- ShipBob order status — https://support.shipbob.com/s/article/Order-Status
- ShipBob status reference — https://developer.shipbob.com/status-reference
- ShipBob notifications panel — https://support.shipbob.com/s/article/Notifications-Panel
- ShipBob shipment notifications — https://www.shipbob.com/blog/shipping-notifications/
- Shopify customizing templates — https://help.shopify.com/en/manual/fulfillment/setup/notifications/customizing-notification-template
- Shopify notification variables — https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables
- Postmark best practices — https://postmarkapp.com/guides/transactional-email-best-practices
- Postmark templates — https://postmarkapp.com/email-templates
- Resend vs Postmark — https://postmarkapp.com/compare/resend-alternative
- Customer.io transactional email — https://docs.customer.io/journeys/send/transactional/email/
