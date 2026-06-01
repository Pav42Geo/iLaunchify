# Support Ticketing System — Plan

**Status:** Spec / scaffold. 2026-06-01.
**Owner:** Pavel + Claude.
**Related:** docs/PLATFORM_SPEC.md (Tier 3 — Operational workflows),
docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md (the OTHER kind of in-app messaging —
structured workflow chrome, not free-form support).

Inspired by Pavel's reference dashboard ("Panze" support-management UI —
Total/Pending/Solved/Closed KPI cards · Tickets by User pie + monthly bar ·
Tickets by Category donut · Recent Publications table). This doc carries
that surface into the iLaunchify shell: same KPI rhythm, same sortable
inbox, but our entities are creators, partners, orders, and dispatches.

---

## §1 — Why this exists

Today, every non-workflow problem in iLaunchify lands somewhere it shouldn't:

- Creators DM the founder on Slack: "my order is stuck."
- Creators reply to Resend transactional emails: "package design uploaded
  wrong — please cancel the dispatch."
- Creators email billing-style questions: "why was my card charged twice?"
- Partners email manifest disputes: "the dispatch deadline doesn't match
  the lead time we agreed."
- Partners ask via the Onboarding Resend reply-to: "how does the new
  Operational Standards section work?"
- Admin replies are scattered across Pavel's personal inbox, Slack DMs,
  and the partner's Resend thread — and never linked back to the Order or
  Partner row.

There is **no system of record** for any of this. Threads go stale. New
admins joining the platform cannot see history. A creator who churned
because their dispatch was stuck for 11 days has no audit trail proving
when admin first heard about it.

V1 ships an internal ticketing system so every support touch:

1. Has one canonical home (`Ticket` row, threaded `TicketReply` rows).
2. Is linked to a real entity (Order, Brand, Partner, PartnerService,
   Dispatch, etc.) when applicable, so the inbox can sort by entity.
3. Triggers admin notifications via the existing
   `@ilaunchify/notifications` dispatcher — no new email pipeline.
4. Falls under SLA tracking so we can answer "are we keeping our promise
   of a 4-hour first response on URGENT?"

The bigger goal is operational trust (per
[[ilaunchify-operational-philosophy-v1]]): partners and creators must
believe their problem will be seen, tracked, and resolved on a known
timeline. A ticketing surface is that promise made structural.

### Out of scope (V1)

- **Live chat / Intercom-style widget.** Tickets only. Live chat is a
  V1.5+ conversation.
- **Public Knowledge Base / Help Center articles.** A separate workstream
  on `/help/articles`. The ticketing system links to articles when they
  exist, but does not build the CMS.
- **Email-in.** Creators and partners file tickets through the in-app
  `/help/new` form. Resend reply-to email-in is an §6 open question.
- **Partner-to-partner tickets.** All tickets in V1 are routed to admin.
  No partner-partner thread mode.

---

## §2 — Schema (the four-model core)

Four new models, all additive. No existing rows touched. Drops onto the
existing `User`, `AuditLog`, `Notification` substrate.

### 2.1 `Ticket` — the row of record

```
Ticket {
  id                  String   @id @default(cuid())
  // Who filed it
  requesterUserId     String                          // FK → User.id
  requesterRole       TicketRequesterRole             // CREATOR | PARTNER
  // Who owns the resolution (nullable until first triage)
  assigneeUserId      String?                         // FK → User.id (an ADMIN)
  // What it's about
  categoryId          String                          // FK → TicketCategory.id
  subject             String                          // @db.String(180)
  body                String                          // initial description, markdown allowed
  // Where it lives in the FSM
  status              TicketStatus    @default(NEW)   // NEW → TRIAGED → IN_PROGRESS → WAITING_ON_REQUESTER → RESOLVED → CLOSED
  priority            TicketPriority  @default(MEDIUM)// LOW | MEDIUM | HIGH | URGENT
  // Optional entity link — wires the ticket to a row anywhere in the platform
  entityType          String?                         // "Order" | "OrderDispatch" | "Brand" | "Partner" | "PartnerService" | "Product" | etc.
  entityId            String?                         // matching row id
  // SLA timestamps (filled by triage + cron)
  firstResponseAt     DateTime?                       // first admin reply (not internal note)
  resolvedAt          DateTime?                       // moved to RESOLVED
  closedAt            DateTime?                       // moved to CLOSED (terminal)
  slaBreachedAt       DateTime?                       // cron sets when SLA window elapses unanswered
  // Free-form admin scratchpad — visible only to admin, not to requester
  internalNotes       String?                         // markdown
  // Activity
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  // Relations
  requester           User           @relation("RequesterTickets", fields: [requesterUserId], references: [id])
  assignee            User?          @relation("AssigneeTickets", fields: [assigneeUserId], references: [id])
  category            TicketCategory @relation(fields: [categoryId], references: [id])
  replies             TicketReply[]
  events              TicketEvent[]

  @@index([status, priority, createdAt])           // primary inbox sort
  @@index([assigneeUserId, status])                // "my queue"
  @@index([requesterUserId, createdAt])            // "my tickets"
  @@index([categoryId, status])                    // category dashboards
  @@index([entityType, entityId])                  // "show tickets attached to this Order"
  @@index([slaBreachedAt])                         // "SLA-breaching" KPI card
}
```

Design notes:

- `entityType` is a free-form string, not an enum. We add new entity
  types over time; an enum would force a migration every time. The
  invariants are enforced at the service layer (allow-list in
  `packages/support`).
- No `tags` field in V1. Categories carry enough taxonomy weight; tags
  are a V1.5+ add when admins ask for them.
- `internalNotes` is a single text blob, NOT a separate "thread of
  internal notes". For a per-reply internal note thread, use
  `TicketReply.isInternalNote = true` (see §2.3). The blob is for the
  triaging admin's brain-dump.
- `priority` cascades from `TicketCategory.defaultPriority` at create
  time but is editable.

### 2.2 `TicketCategory` — typed bucket + SLA + default routing

```
TicketCategory {
  id                       String   @id @default(cuid())
  slug                     String   @unique               // "order-issue", "payment-payout", ...
  name                     String                         // "Order issue", "Payment / payout", ...
  description              String?
  defaultPriority          TicketPriority @default(MEDIUM)
  defaultAssigneeUserId    String?                        // optional auto-assign to admin teammate
  slaResponseMinutes       Int?                           // overrides global default
  slaResolveMinutes        Int?                           // overrides global default
  isActive                 Boolean  @default(true)
  sortOrder                Int      @default(0)           // display order in pickers
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  tickets                  Ticket[]
  @@index([isActive, sortOrder])
}
```

Starter seed (10 categories — see §2.5):

| slug                  | name                  | defaultPriority |
|-----------------------|-----------------------|-----------------|
| order-issue           | Order issue           | HIGH            |
| payment-payout        | Payment / payout      | HIGH            |
| product-approval      | Product approval      | MEDIUM          |
| partner-verification  | Partner verification  | MEDIUM          |
| design-studio-bug     | Design Studio bug     | MEDIUM          |
| account-billing       | Account / billing     | HIGH            |
| compliance-question   | Compliance question   | MEDIUM          |
| feature-request       | Feature request       | LOW             |
| dispatch-deadline     | Dispatch deadline     | URGENT          |
| other                 | Other                 | LOW             |

### 2.3 `TicketReply` — threaded conversation + internal-note flag

```
TicketReply {
  id              String   @id @default(cuid())
  ticketId        String
  authorUserId    String
  authorRole      TicketAuthorRole          // CREATOR | PARTNER | ADMIN
  body            String                    // markdown allowed; sanitized server-side
  attachments     Json?                     // [{ key, name, mimeType, size }] — R2 keys, optional
  isInternalNote  Boolean  @default(false)  // when true, hidden from requester
  createdAt       DateTime @default(now())
  ticket          Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author          User     @relation("TicketReplyAuthor", fields: [authorUserId], references: [id])
  @@index([ticketId, createdAt])
  @@index([authorUserId])
}
```

- `isInternalNote = true` is admin-only. The creator/partner-side ticket
  detail page filters out these rows in the loader.
- `attachments` deliberately stays a Json column in V1 — the same
  R2-keyed shape we use in `OrderDispatch.changeRequest.attachments`.
  Promote to a typed `TicketAttachment` model in V1.5+ if we need DB
  queries over attachments (e.g., admin-side "files uploaded last
  week").

### 2.4 `TicketEvent` — ticket-scoped activity log

Distinct from `AuditLog`. `AuditLog` is platform-wide forensic trail
(every entity, every state change). `TicketEvent` is the per-ticket
"history" timeline the detail page renders inline. We log to both:
`AuditLog` for compliance, `TicketEvent` for the human-readable
sidebar.

```
TicketEvent {
  id           String           @id @default(cuid())
  ticketId     String
  kind         TicketEventKind  // CREATED | ASSIGNED | STATUS_CHANGED | PRIORITY_CHANGED | REPLIED | RESOLVED | REOPENED | MERGED | SPLIT | SLA_BREACHED | INTERNAL_NOTE_ADDED
  payload      Json             // { from, to, mergedFromTicketId, ... }
  actorUserId  String?          // null for SYSTEM events (cron-driven SLA_BREACHED)
  createdAt    DateTime         @default(now())
  ticket       Ticket           @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  actor        User?            @relation("TicketEventActor", fields: [actorUserId], references: [id])
  @@index([ticketId, createdAt])
}
```

### 2.5 New enums

```
enum TicketStatus {
  NEW                  // just filed
  TRIAGED              // admin has read it, assigned, set priority
  IN_PROGRESS          // admin is actively working it
  WAITING_ON_REQUESTER // admin replied; awaiting requester response
  RESOLVED             // admin marked done; not yet closed
  CLOSED               // terminal; no further replies allowed
}

enum TicketPriority { LOW MEDIUM HIGH URGENT }

enum TicketRequesterRole { CREATOR PARTNER }

enum TicketAuthorRole { CREATOR PARTNER ADMIN }

enum TicketEventKind {
  CREATED
  ASSIGNED
  STATUS_CHANGED
  PRIORITY_CHANGED
  REPLIED
  RESOLVED
  REOPENED
  MERGED
  SPLIT
  SLA_BREACHED
  INTERNAL_NOTE_ADDED
}
```

### 2.6 Back-relations on `User`

```
User {
  ...
  requestedTickets   Ticket[]        @relation("RequesterTickets")
  assignedTickets    Ticket[]        @relation("AssigneeTickets")
  ticketReplies      TicketReply[]   @relation("TicketReplyAuthor")
  ticketEvents       TicketEvent[]   @relation("TicketEventActor")
}
```

---

## §3 — Surfaces

### 3.1 `/admin/support` — the inbox

Follows the locked admin v2 pattern
([[ilaunchify-admin-surface-pattern]]):

- Cream `#F3EFE8` hero band.
- 5-card KPI strip:
  1. **Total tickets** (this period — defaults to last 30 days)
  2. **Pending** (status in NEW or TRIAGED)
  3. **Solved** (status in RESOLVED)
  4. **Closed** (status = CLOSED)
  5. **SLA-breaching** (`slaBreachedAt IS NOT NULL AND status NOT IN (RESOLVED, CLOSED)`)
- URL-driven filter chips: status, category, priority, assignee.
- Sortable plain `<table>` with columns: subject + requester avatar +
  category pill + status pill + priority pill + assignee + age + last
  reply.
- RowActionsMenu per row (3-dot dropdown) — open, assign to me,
  change status, change priority, close.

### 3.2 `/admin/support/[ticketId]` — the detail

Three columns:

1. **Left (8 cols)** — thread. Original `Ticket.body`, then
   `TicketReply` rows interleaved with `TicketEvent` rows in chronological
   order. Internal notes badged in amber.
2. **Right (4 cols, sticky)** — meta + actions card.
   - Status FSM controls (chip group respecting valid transitions)
   - Priority dropdown
   - Assignee picker (admins only)
   - Category change
   - Link-to-entity quick action — paste an Order/Dispatch/Brand id;
     server validates against the allow-list and stores `entityType +
     entityId`. Detail view renders a card linking out.
   - Internal-notes editor (the `Ticket.internalNotes` blob).

Below the right-rail card: "Resolve" and "Close" buttons separated to
avoid confusion. Reopen button appears when status = RESOLVED.

### 3.3 Admin category management

Two acceptable shapes (Pavel picks during build):

- **Extension:** add a `?tab=support` to `/admin/categories` if such a
  surface exists.
- **Standalone:** `/admin/support/categories` — same v2 pattern as
  `/admin/markets`, full CRUD over `TicketCategory`.

Either way, only ADMIN role can mutate categories.

### 3.4 Creator side — `/help`

Routes:

- `/help` — landing. Two-column: "File a new ticket" CTA + recent-tickets
  list ("My tickets").
- `/help/new?category=...&entityType=...&entityId=...` — file form. The
  query-param pre-fill is how other surfaces deep-link in. Examples:
  - Order detail "Need help?" button →
    `/help/new?category=order-issue&entityType=Order&entityId=...`
  - `/account/billing` "Dispute this charge" →
    `/help/new?category=account-billing`
- `/help/[ticketId]` — thread view. Internal notes hidden.

### 3.5 Partner side — `/help`

Same shape as creator side, just in `apps/partner`. Tickets list
reused; file form pre-fills `category=partner-verification` when
deep-linked from the Application Status page.

### 3.6 Shared store

A new package `@ilaunchify/support` exposes:

- `createTicket(input)`
- `listTickets(filters, viewerScope)` — `viewerScope` enforces
  creator/partner only sees their own, admin sees all.
- `replyToTicket({ ticketId, body, isInternalNote })`
- `transitionTicket({ ticketId, toStatus })` — FSM-validated
- `assignTicket({ ticketId, toUserId })`
- `linkEntity({ ticketId, entityType, entityId })`
- `recordTicketEvent(...)` — writes to `TicketEvent` + `AuditLog`.

All three apps (creator/partner/admin) import from this package. No
duplicated data access.

---

## §4 — SLA + notifications

### 4.1 SLA defaults

| Priority | First response | Resolution |
|----------|----------------|------------|
| URGENT   | 1 hour         | 8 hours    |
| HIGH     | 4 hours        | 24 hours   |
| MEDIUM   | 8 hours        | 48 hours   |
| LOW      | 24 hours       | 5 days     |

`TicketCategory.slaResponseMinutes` / `slaResolveMinutes` override these
when present.

### 4.2 SLA-breach cron

Extend the existing auto-cancel-dispatches cron in
`packages/jobs` (same job runner as
`acceptDeadlineAt` enforcement, per task B7). Every 10 minutes:

```
SELECT id, priority, categoryId, createdAt, firstResponseAt
FROM "Ticket"
WHERE status IN ('NEW','TRIAGED','IN_PROGRESS','WAITING_ON_REQUESTER')
  AND slaBreachedAt IS NULL;
```

For each row, compute the effective SLA window from the
`TicketCategory` override or priority default, and `UPDATE` to set
`slaBreachedAt = now()`. Log a `TicketEvent { kind: SLA_BREACHED }` and
fire `SUPPORT_SLA_BREACHED` notification to the assignee (or category
default assignee if unassigned).

The status pill in the inbox renders a separate "SLA breached" badge
based on the column; we don't introduce a sixth status enum value.

### 4.3 Notification events

Add to the `NotificationEvent` enum (additive, no enum drops):

- `SUPPORT_TICKET_CREATED` — fires to `category.defaultAssigneeUserId`
  if set, else to all admins (or admin distribution-list user).
- `SUPPORT_TICKET_REPLIED` — fires to the **other** side. Admin replies
  notify requester; requester replies notify assignee + category default.
- `SUPPORT_TICKET_RESOLVED` — fires to requester. Body links to the
  reopen action.
- `SUPPORT_TICKET_REOPENED` — fires to assignee (and category default
  if unassigned).
- `SUPPORT_SLA_BREACHED` — fires to assignee (or category default
  assignee).

All wired through `@ilaunchify/notifications` exactly as the existing
dispatch-flow events are. Template strings live in
`packages/notifications/src/templates.ts`.

Per-user opt-out follows the same `NotificationPreference` pattern —
no extra work required.

---

## §5 — Build order (5 steps)

Each step targets a single PR / task id in our W2-XX cadence.

| # | Task id           | Slice                                                      | Touches |
|---|-------------------|------------------------------------------------------------|---------|
| 1 | **W2-SUP1**       | Schema migration + Prisma client + seed 10 starter categories | `packages/db/prisma/schema.prisma`, new migration, `seed-ticket-categories.ts`, append to `seed.ts` |
| 2 | **W2-SUP2**       | `@ilaunchify/support` package — createTicket, listTickets (scope-aware), reply, transition, FSM helpers, entity allow-list | new `packages/support/` |
| 3 | **W2-SUP3**       | `/admin/support` inbox + `/admin/support/[ticketId]` detail + category CRUD + sidebar wiring (`hiddenUntilBuilt: false`) | `apps/admin/src/app/support/...`, `apps/admin/src/components/nav/sidebar-config.ts` (flip flag) |
| 4 | **W2-SUP4**       | Creator + partner `/help` surfaces (list + new + detail) + deep-link helpers from order detail / account / application status | `apps/creator/src/app/help/...`, `apps/partner/src/app/help/...` |
| 5 | **W2-SUP5**       | SLA cron extension + 5 NotificationEvent values + templates + dispatcher wiring | `packages/jobs/`, `packages/notifications/src/events.ts`, `packages/notifications/src/templates.ts`, migration for the enum-value additions |

Sequencing rationale: schema first (#1) so every other step compiles
against real types; then the shared package (#2) so all three app
surfaces consume the same store; admin (#3) before creator/partner (#4)
because admin needs to manage categories and respond to tickets before
end users start filing them; SLA + notifications (#5) last because
they're additive over a stable surface.

---

## §6 — Open questions

1. **Email-in via Resend reply-to?** When `SUPPORT_TICKET_REPLIED`
   sends an email, do we set a reply-to that pipes back into the
   ticket via a Resend inbound webhook? Saves the requester one click
   but adds an inbound parsing surface. Lean V1: NO. Email is one-way
   send-only; replies happen in-app. Revisit V1.5+.
2. **Partner-to-partner tickets?** Today every ticket terminates at
   admin. When two partners share an Order (manufacturer + label
   printer), should there be a partner-partner thread mode that admin
   only sees if escalated? Probably no for V1 — workflow chrome
   already covers structured partner-partner communication via
   `OrderDispatch.changeRequest`. Open in V1.5+ if partners ask.
3. **Auto-close idle tickets?** A `WAITING_ON_REQUESTER` ticket with
   no requester reply in 14 days — auto-close, or leave for admin?
   Probably auto-close with a "we're closing this — reply to reopen"
   notification 24 hours prior. Punt to V1.5+ unless admin starts
   drowning in stale tickets.
4. **Internal collaboration on a single ticket — `@mentions`?**
   Mention a teammate inside `internalNotes` or a reply, ping them
   via the existing in-app bell. Nice-to-have V1.5+. V1 skips.
5. **Merge / split flow?** The FSM enum already lists `MERGED` and
   `SPLIT` events because they're cheap to declare, but we don't ship
   the UI in V1. First time admin hits a true duplicate, build the
   merge action then. Until then, admins close-with-note pointing to
   the canonical ticket.

---

## Appendix — entity-link allow-list (V1)

The values `entityType` may take, enforced by `linkEntity` in
`@ilaunchify/support`:

- `Order`
- `OrderDispatch`
- `OrderItem`
- `Brand`
- `CreatorProfile`
- `Partner`
- `PartnerService`
- `ProductTemplate`
- `Product`
- `ProductionSubscription`

Any other value is rejected. New rows added as we link new surfaces.
