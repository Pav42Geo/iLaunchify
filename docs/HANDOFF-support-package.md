# Handoff — `@ilaunchify/support` package (W2-SUP2)

The shared support-ticket store. Schema (W2-SUP1) was already done — `Ticket`,
`TicketCategory`, `TicketReply`, `TicketEvent` models, all enums, the
`seed-ticket-categories.ts` (10 starter categories, wired into `seed.ts`), and
the `20260601090000_add_ticketing_system_2026_06_01` migration. This slice adds
the FSM + service layer every app surface will consume. **No UI yet** — that's
W2-SUP3 (admin inbox) and W2-SUP4 (creator/partner `/help`).

## What shipped (sandbox-verified)

New package `packages/support/`:

- **`ticket-fsm.ts`** — pure FSM. `TICKET_TRANSITIONS` table, `canTransitionTicket`,
  `assertTicketTransition` (+ `TicketTransitionError`), `eventKindForTransition`
  (labels RESOLVED / REOPENED edges), `isTerminalStatus`, `OPEN_STATUSES`. Plus
  SLA math: `SLA_DEFAULTS` (§4.1 table), `effectiveSlaWindow` (per-leg category
  override), `isResponseSlaBreached` (deterministic — caller passes `now`).
- **`entity-allowlist.ts`** — `LINKABLE_ENTITY_TYPES` (Order, OrderDispatch,
  OrderItem, Brand, CreatorProfile, Partner) + `assertLinkableEntityType`. An
  open `entityType` is a data-leak vector; the service allow-lists it.
- **`service.ts`** — the scope-aware store. `createTicket`, `listTickets(filters,
  scope)`, `getTicket(id, scope)`, `replyToTicket`, `transitionTicket`,
  `assignTicket`, `linkEntity`, `recordTicketEvent`. Every mutation writes a
  `TicketEvent` row **and** an `AuditLog` row, and fires a best-effort
  notification. **Scope is enforced here, not in the app layer:** a CREATOR /
  PARTNER viewer only ever sees their own tickets and never internal notes;
  ADMIN sees all.
- **`notify.ts`** — thin best-effort notification wrapper (the one cast point).
- **`ticket-fsm.test.ts`** — vitest, 17 assertions (transitions, reopen edges,
  illegal-jump rejection, SLA windows + breach). Also node-verified against the
  compiled module in the sandbox (17/17 pass).

Touched packages:

- **`packages/audit/src/types.ts`** — `'Ticket'` entity type + 9 `TICKET_*`
  actions.
- **`packages/notifications`** — schema enum + templates (see migration below).
- **root `tsconfig.json`** — `@ilaunchify/support` path alias.

Typecheck: `packages/support`, `packages/audit`, `packages/notifications` all
clean in the sandbox (only `vitest` module-not-found until `pnpm install`).

## Mac steps

### 1. `pnpm install`
Registers the new `packages/support` workspace package, links its deps (it is now
a dependency of **apps/admin, apps/creator, and apps/partner**), and installs its
`vitest` devDep. Until you run it, `tsc` reports `vitest` module-not-found in the
`*.test.ts` files (harmless) and the apps can't yet resolve `@ilaunchify/support`.

### 2. `pnpm db:push` (one push — additive)
Adds, in one push (all additive — decline any reset prompt):
- The **5 `SUPPORT_*` `NotificationEvent` enum values**: `SUPPORT_TICKET_CREATED`,
  `SUPPORT_TICKET_REPLIED`, `SUPPORT_TICKET_RESOLVED`, `SUPPORT_TICKET_REOPENED`,
  `SUPPORT_SLA_BREACHED`.
- **W2-SUP3.5 tier-policy:** the `SupportSettings` singleton model + two new
  nullable `Ticket` columns `slaResponseMinutes` / `slaResolveMinutes`.
- **Saved replies:** the `SupportCannedReply` model + `TicketCategory.cannedReplies`
  back-relation.

The `Ticket*` models and the `AuditLog` rows need no migration (models already
exist; AuditLog entityType/action are free-form columns).

```bash
pnpm install
pnpm db:push            # additive — 5 NotificationEvent values
pnpm db:generate
rm -rf apps/*/.next     # transpilePackages stale-client gotcha
pnpm --filter @ilaunchify/support test   # 17 assertions
```

### 3. Post-`db generate` cleanup (two casts to drop)
Once the generated client knows the new enum values + columns:
- `packages/support/src/notify.ts` (search **`SUPPORT-ENUM-CAST`**):
  `event: args.event as unknown as NotificationEvent` → `event: args.event`.
- `packages/support/src/service.ts` (search **`SUPPORT-SLA-CAST`** — two sites):
  drop the `createData as unknown as Prisma.TicketCreateInput` cast in
  `createTicket` AND the cast-guarded `prisma.ticket.findMany` in
  `runSlaBreachScan` — the generated client will know `slaResponseMinutes` /
  `slaResolveMinutes`.
- `apps/creator/src/app/(dashboard)/settings/notifications/page.tsx`: drop the
  `evt()` cast helper once the generated `NotificationEvent` enum knows
  `CREATOR_ORDER_CANCELLED` / `CREATOR_ORDER_DISPUTE_RESOLVED` / `SUPPORT_TICKET_*`
  (creator notification-preferences list, added with the notification center).
- `packages/db/src/canned-replies.ts` + `apps/admin/.../saved-replies/actions.ts`
  (search **`SUPPORT-CANNED-CAST`**): drop the `prisma as unknown as {…}` casts —
  the generated client will know `SupportCannedReply`.

Then `pnpm typecheck`.

Until then it's safe to ship: `dispatchNotification` is best-effort (never
throws; a write with an unknown enum is swallowed).

## Design notes for the UI slices

- **Notification links are recipient-correct.** The service passes an `href` in
  each payload: admins → `/support/[id]`, requesters → `/help/[id]`. The
  dispatcher resolves the host from the recipient's audience, so the path must
  match where that audience reads tickets. Keep `/admin/support` and the app
  `/help` routes at those paths (W2-SUP3 / W2-SUP4).
- **First-response SLA** is stamped by `replyToTicket` on the first non-internal
  ADMIN reply (`firstResponseAt`). The breach cron (W2-SUP5) only needs to scan
  open tickets with `firstResponseAt IS NULL` and set `slaBreachedAt`.
- **Reopen** (`transitionTicket` into IN_PROGRESS from RESOLVED/CLOSED) clears
  `resolvedAt` / `closedAt` / `slaBreachedAt` so the ticket re-enters the open
  population cleanly.
- **Inbox sort** in `listTickets`: status asc, priority desc, createdAt desc;
  `take` capped at 100. `slaBreachedOnly` filter backs the "SLA breached" KPI.

## Tier-aware intake (W2-SUP3.5 — Pavel 2026-06-20)

Pavel's decision: **tier sets an SLA target + a priority floor, admin-tunable**;
**creators are bound** (PLATFORM_SPEC §Tier 1) but **partners stay info-only**
(partner-tier meaning undecided → badge only, never auto-prioritized).

- `SupportSettings` singleton (admin-tunable) + `getSupportSettings()` in
  `@ilaunchify/db`. Seeded defaults: Maker 48h/LOW · Builder 24h/MEDIUM ·
  Agency 4h/HIGH. Two master switches (`priorityFloorEnabled`,
  `slaTargetsEnabled`) toggle each binding independently.
- Pure `resolveCreatorIntake()` (`packages/support/src/intake-policy.ts`,
  7 assertions) → priority floor + first-response SLA target. `createTicket`
  applies it **only for CREATOR** requesters, stamping `Ticket.slaResponseMinutes`
  (the SLA-breach cron W2-SUP5 reads this directly — no re-derivation).
- **Tier badge** surfaced info-only on the admin inbox + detail for both creator
  (MAKER/BUILDER/AGENCY) and partner (VERIFIED/TRUSTED/PREMIER) requesters.
- **Admin editing surface:** `/settings/support-policy` (Settings → Support Policy)
  — two binding toggles + a per-creator-tier table (SLA preset dropdown + min-priority).
  `saveSupportSettings` upserts the singleton, audited (`SupportSettings` entity).

## Remaining build order

- ✅ **W2-SUP3** — `/support-tickets` inbox + `[ticketId]` detail (commit 73d14a6).
- ✅ **W2-SUP3.5** — tier-aware intake + admin Support Policy page (9b70543, 356c08d).
- ✅ **W2-SUP4** — creator `/help` (8a2a0b2) + partner `/help` (d55df61).
- ✅ **W2-SUP5** — SLA-breach cron. `runSlaBreachScan(now)` (`@ilaunchify/support`):
  scans open tickets where `slaBreachedAt IS NULL` + `firstResponseAt IS NULL`,
  computes the effective window via `resolveResponseMinutes` (ticket → category →
  priority default), and for each elapsed one stamps `slaBreachedAt`, logs a
  `SLA_BREACHED` event, and fires `SUPPORT_SLA_BREACHED` to the owner. Route
  `/api/cron/sla-breach` (CRON_SECRET-gated) + `*/10 * * * *` in
  `apps/admin/vercel.json`. Idempotent; node-verified. **All five `SUPPORT_*`
  events now fire.**
- ✅ **Optional extra** — admin category CRUD at `/support-tickets/categories`
  (list + create/edit form + active toggle; audited; 'Manage categories' link from
  the inbox). Commit 7ad8aed.
- ✅ **Optional extra** — deep-link prefill: `/help/new?category=…` (+ creator
  `&orderId=…`) prefills the form (params validated server-side); creator order
  detail has a 'Report an issue with this order' link. Commit 292bb51.

- ✅ **Optional extra** — saved / macro replies: `SupportCannedReply` model +
  admin CRUD at `/support-tickets/saved-replies` + "Insert saved reply…" in the
  composer (commit ac93ed1). **SUPPORT-CANNED-CAST** cleanup after `db push`.
- ✅ **Optional extra** — reply attachments (end-to-end, all three apps). Files
  upload to R2 via `@ilaunchify/storage` (`ticketAttachmentKey`), are stored on the
  existing `TicketReply.attachments` Json column (**no migration**), and download
  through an **access-checked** signed-URL route (`/api/ticket-attachment` in each
  app — `getTicket` scope-check + `attachmentKeyAllowed`, so a crafted key can't
  pull an arbitrary object). 15 MB/file, ≤5 files, MIME allow-list (PDF + common
  images + text). Admin attaches in the detail composer; creator/partner attach in
  their `/help` reply form; all three threads render download cards. Shared
  `parseAttachments` / `AttachmentMeta` in `@ilaunchify/support`. **No casts, no
  migration** — fully typecheck-clean today (admin/creator/partner 0 errors).
  - *Deferred:* attaching files on the **initial** ticket submit (opening message
    is `Ticket.body`, not a reply, and has no Json attachments column) — would need
    `Ticket.attachments` or an auto-first-reply. Replies cover the conversation case.

**Nothing outstanding** — the entire W2 support-ticketing epic (plan + all optional
extras incl. saved replies + reply attachments) is built and typecheck-clean. Only
the standard Mac steps above remain.

**The W2 support-ticketing plan is complete.**
