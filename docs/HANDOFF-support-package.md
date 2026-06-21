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
Registers the new `packages/support` workspace package, links its deps, and
installs its `vitest` devDep. Until you run it, `tsc` reports `vitest`
module-not-found in `ticket-fsm.test.ts` (harmless) and apps can't yet resolve
`@ilaunchify/support`.

### 2. `pnpm db:push` (one push — additive)
Adds, in one push (all additive — decline any reset prompt):
- The **5 `SUPPORT_*` `NotificationEvent` enum values**: `SUPPORT_TICKET_CREATED`,
  `SUPPORT_TICKET_REPLIED`, `SUPPORT_TICKET_RESOLVED`, `SUPPORT_TICKET_REOPENED`,
  `SUPPORT_SLA_BREACHED`.
- **W2-SUP3.5 tier-policy:** the `SupportSettings` singleton model + two new
  nullable `Ticket` columns `slaResponseMinutes` / `slaResolveMinutes`.

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
- `packages/support/src/service.ts` (search **`SUPPORT-SLA-CAST`**): drop the
  `createData as unknown as Prisma.TicketCreateInput` cast — the generated client
  will know `slaResponseMinutes` / `slaResolveMinutes`.

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
- **Still TODO:** an admin *editing surface* for `SupportSettings` (the row is
  tunable via DB now; a Settings page is a fast-follow — mirror
  `/order-settings`). The defaults are sensible, so this isn't blocking.

## Remaining build order (unchanged from the plan)

- **W2-SUP3** — `/admin/support` inbox (v2 surface: cream hero, KPI strip,
  chips, sortable table, RowActionsMenu) + `/admin/support/[ticketId]` detail
  (reply thread, internal notes, FSM chips, assign) + category CRUD + flip the
  sidebar `hiddenUntilBuilt` flag.
- **W2-SUP4** — creator + partner `/help` (list + new + detail) + deep links
  from order detail / account / application status.
- **W2-SUP5** — SLA-breach cron (new `/api/cron/sla-breach`, hourly or 10-min) +
  wire the 5 notification events through their dispatch sites.
