# iLaunchify — Analytics P0 Substrate Spec (ready-to-apply)

**Status:** DRAFT for Pavel review · 2026-07-09
**Parent:** `ANALYTICS_STRATEGY.md` · **Tracker:** `BUILD_CHECKLIST_ANALYTICS.md` (P0 block)
**Goal:** land the *no-regret* foundations — a canonical event schema + single server emitter, the promised-date fields, and a real reliability backing store — so every later phase (behavioral SDK, warehouse, dbt, dashboards) is purely additive. **No vendor commitment required to ship P0.**

> This doc contains ready-to-apply code. It follows repo law: NEW models use `@default(uuid())` (FREEZE 2026-07-11, enforced by `check:invariants`); no `@db.Text` (Cockroach P1012); the emitter mirrors `@ilaunchify/audit` fire-and-forget semantics (never throws, never blocks the business op); money in cents.

---

## 0. Scope (what P0 is / isn't)

**In:** `packages/analytics` (event schema + emitter + curated name registry + pluggable sink), 3 additive schema changes (`AnalyticsEvent`, `CronRun`, promised-date fields on `OrderDispatch`), 5 server-side money/state events wired, and routing the latent "quality signal for analytics" stubs into the emitter.

**Out (later phases):** PostHog SDK + client events (P1), warehouse/ingestion/dbt (P1), Metabase + native Insights admin surface + alerting (P2), moat/pooling metrics (P3). The sink interface here is the seam PostHog drops into at P1 with **zero call-site changes**.

**Decisions this implements:** D3 (promised-date field), D7 (event schema + emitter package). D1/D2 (vendor/warehouse) are NOT needed for P0 — the sink stays a no-op logger until D1 lands.

---

## 1. Schema changes (additive — `packages/db/prisma/schema.prisma`)

### 1.1 New model — `AnalyticsEvent` (raw append-only event store)

Place near the AuditLog block (~L4709). **Uses `uuid()` per FREEZE.** This is the tenant-stamped source of truth that also fans to the vendor sink; it survives even before any warehouse exists.

```prisma
// ============================================================================
// Analytics P0 — canonical behavioral/state event store.
// See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md. Written ONLY via @ilaunchify/analytics
// emitEvent() — never prisma.analyticsEvent.create() directly. Append-only:
// no updates, no deletes (retention is a warehouse/cron concern, not app code).
// High-volume by design → deliberately few, well-chosen indexes.
// ============================================================================
model AnalyticsEvent {
  id         String              @id @default(uuid())
  // Curated name from ANALYTICS_EVENTS registry (packages/analytics/src/events.ts).
  // Stored as String (not enum) so adding a name is a code+PR change, not a migration —
  // same convention as AuditLog.action. The registry is the guard, review is the gate.
  name       String
  // Where it was emitted. SERVER events are the source of truth for anything
  // financial/state (survive ad-blockers); CLIENT events (P1+) are behavioral.
  source     AnalyticsSource     @default(SERVER)
  // Actor. Null = anonymous/pre-auth (marketing funnel). Soft FK (no relation)
  // so high-volume inserts never take a FK lock.
  actorId    String?
  role       AnalyticsActorRole  @default(SYSTEM)
  // Tenant stamp — no-regret for multi-tenant (docs: earn-the-right-to-multi-tenant).
  // Creator-side = CreatorProfile.id; partner-side = Partner.id; else null. Soft FK.
  tenantId   String?
  // Optional business anchors for joins (all soft FKs).
  orderId    String?
  // Client session id for funnel stitching (set by the P1 SDK; null for server events).
  sessionId  String?
  // Typed event payload — see the registry's per-event property contracts.
  properties Json?
  // Event time (when it happened), distinct from any ingest time.
  occurredAt DateTime            @default(now())

  @@index([name, occurredAt])   // "how many X in period"
  @@index([actorId, occurredAt]) // per-user funnel
  @@index([orderId])             // order-linked event timeline
  @@index([occurredAt])          // time-range scans / warehouse incremental pull
}

enum AnalyticsSource {
  SERVER
  CLIENT
}

enum AnalyticsActorRole {
  CREATOR
  PARTNER
  ADMIN
  SYSTEM
  ANON
}
```

### 1.2 New model — `CronRun` (real reliability backing store)

Fixes the synthetic "System Health" (today cron health is *inferred* from `AuditLog` action prefixes). **Webhook health reuses the existing `ProcessedWebhookEvent` model** — do NOT add a second webhook table; §1.4 covers the thin extension instead.

```prisma
// Analytics P0 — cron execution ledger. Replaces the audit-prefix inference in
// the admin dashboard's "System Health". One row per run. Written via
// @ilaunchify/analytics recordCronRun() (start) + finishCronRun() (end).
model CronRun {
  id         String        @id @default(uuid())
  name       String        // e.g. "sla-sweep", "merit-recompute", "storage-accrual"
  status     CronRunStatus @default(RUNNING)
  startedAt  DateTime      @default(now())
  finishedAt DateTime?
  durationMs Int?
  error      String?       // failure message (bare String — no @db.Text on Cockroach)
  payload    Json?         // counts processed, dedupe stats, etc.

  @@index([name, startedAt])
  @@index([status, startedAt]) // "any failed crons in last 24h"
}

enum CronRunStatus {
  RUNNING
  OK
  FAILED
}
```

### 1.3 `OrderDispatch` — promised-date fields (D3, highest-leverage change)

Add to `model OrderDispatch` (~L3320, beside the existing per-state timestamps). **This is the single change that unblocks `onTimeRate` for BOTH analytics AND the Merit Engine** (`merit-signals.ts` currently returns `onTimeRate: null` because there's no promised date to measure against).

```prisma
  // Analytics/Merit P0 (docs/ANALYTICS_P0_SUBSTRATE_SPEC.md §1.3). The dates this
  // leg was PROMISED, snapshotted at routing (or revised on approved delay-accept).
  // On-time = (readyAt <= promisedShipBy) / (deliveredAt <= promisedDeliverBy).
  // Feeds OTIF + cycle-time analytics AND unblocks merit-signals.onTimeRate.
  // Additive + nullable; legacy rows stay null and are excluded from on-time math.
  promisedShipBy    DateTime?
  promisedDeliverBy DateTime?
```

**Population points** (do in the same PR so the field isn't dead on arrival):
- Set `promisedShipBy` / `promisedDeliverBy` in `createDispatches` (routing) from the quoted lead time — the same lead-time math already used to compute `acceptDeadlineAt` / the creator-facing ETA.
- On an **approved delay-accept** (`proposedDeadlineAt` path, §7 of ROUTING_BINDING_MODEL), overwrite with the revised date so on-time is judged against the promise the creator agreed to.
- Leave null on legacy/pre-migration rows; all on-time aggregates must `WHERE promisedShipBy IS NOT NULL`.

### 1.4 `ProcessedWebhookEvent` — thin health extension (reuse, don't duplicate)

The idempotency/forensics store already exists. If it lacks a clean success/failure status for health rollups, add only:

```prisma
  // Analytics P0 — health signal for the admin "System Health" row.
  handledOk Boolean? // true=processed, false=handler errored, null=received-only
```

Then the dashboard reads real webhook health from this column instead of `action.startsWith('stripe.webhook.')`. (Confirm the current columns first; if an equivalent status already exists, skip this and just point the dashboard at it.)

---

## 2. `packages/analytics` — full source

New workspace package, structured exactly like `packages/audit` (single-writer discipline, `@ilaunchify/db` dep only).

### 2.1 `packages/analytics/package.json`

```json
{
  "name": "@ilaunchify/analytics",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit",
    "clean": "rm -rf node_modules .turbo dist"
  },
  "dependencies": {
    "@ilaunchify/db": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

### 2.2 `packages/analytics/src/events.ts` — the curated registry

The taxonomy IS the product. Start with ~24 names (P0 server events are marked; the rest are P1 client wiring targets — declaring them now fixes the vocabulary). Adding a name is a reviewed PR, never ad-hoc.

```typescript
// Canonical analytics event registry. Names are stored as strings in
// AnalyticsEvent.name; this const is the single source of allowed names +
// their property contracts. Treat like the marketplace taxonomy: curated,
// reviewed, small. Group by funnel/domain, not by app.

export const ANALYTICS_EVENTS = {
  // --- Creator activation funnel ---
  SIGNUP_COMPLETED:            'signup_completed',
  ONBOARDING_STEP_COMPLETED:   'onboarding_step_completed', // props: { step }
  PRODUCT_CREATED:             'product_created',
  STUDIO_OPENED:               'studio_opened',
  DESIGN_SAVED:                'design_saved',
  DESIGN_PUBLISHED:            'design_published',
  CHECKOUT_STARTED:            'checkout_started',
  ORDER_PAID:                  'order_paid',            // ★ P0 server
  ORDER_DELIVERED:             'order_delivered',       // ★ P0 server

  // --- Design Studio engagement ---
  TEMPLATE_APPLIED:            'template_applied',
  FLAVOR_ADDED:                'flavor_added',
  AI_GENERATION_REQUESTED:     'ai_generation_requested',
  AI_CONCEPT_ACCEPTED:         'ai_concept_accepted',
  PACKAGING_3D_PREVIEWED:      'packaging_3d_previewed',
  MOCKUP_PUBLISHED:            'mockup_published',

  // --- Partner side ---
  PARTNER_ONBOARDING_STEP:     'partner_onboarding_step', // props: { step }
  PRODUCT_EDITOR_OPENED:       'product_editor_opened',
  DISPATCH_ACCEPTED:           'dispatch_accepted',     // ★ P0 server
  DISPATCH_DECLINED:           'dispatch_declined',     // ★ P0 server
  PROOF_UPLOADED:              'proof_uploaded',

  // --- Financial (server-only source of truth) ---
  REFUND_ISSUED:               'refund_issued',         // ★ P0 server

  // --- Checkout quality signals (retire the latent stubs, §4) ---
  CHECKOUT_OFFER_SEEN:         'checkout_offer_seen',   // props: { step, offerId }
  CHECKOUT_STEP_VIEWED:        'checkout_step_viewed',  // props: { step }
} as const

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

// The 6 P0 events that MUST be emitted server-side (money/state — cannot be
// lost to ad-blockers). Kept explicit so a test can assert they're wired.
export const P0_SERVER_EVENTS: AnalyticsEventName[] = [
  ANALYTICS_EVENTS.ORDER_PAID,
  ANALYTICS_EVENTS.ORDER_DELIVERED,
  ANALYTICS_EVENTS.DISPATCH_ACCEPTED,
  ANALYTICS_EVENTS.DISPATCH_DECLINED,
  ANALYTICS_EVENTS.REFUND_ISSUED,
]
```

### 2.3 `packages/analytics/src/sink.ts` — the pluggable vendor seam

This is the seam that makes P1 additive: PostHog (or Amplitude/Mixpanel) drops in here with **no call-site changes**. Default = a no-op that logs in dev.

```typescript
import type { AnalyticsEventName } from './events'

export interface AnalyticsSinkEvent {
  name: AnalyticsEventName
  actorId?: string | null
  role: 'CREATOR' | 'PARTNER' | 'ADMIN' | 'SYSTEM' | 'ANON'
  tenantId?: string | null
  orderId?: string | null
  sessionId?: string | null
  properties?: Record<string, unknown>
  occurredAt: Date
}

export interface AnalyticsSink {
  capture(event: AnalyticsSinkEvent): Promise<void> | void
}

// Default sink: no external vendor yet (pre-D1). Logs in non-prod so wiring is
// visible during development; silent in prod. Replaced in P1 by PostHogSink.
class NoopSink implements AnalyticsSink {
  capture(event: AnalyticsSinkEvent): void {
    if (process.env.NODE_ENV !== 'production' && process.env.ANALYTICS_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[analytics] event', event.name, event.properties ?? {})
    }
  }
}

let activeSink: AnalyticsSink = new NoopSink()

/** P1: call once at app boot with a PostHogSink to start forwarding. */
export function setAnalyticsSink(sink: AnalyticsSink): void {
  activeSink = sink
}

export function getAnalyticsSink(): AnalyticsSink {
  return activeSink
}
```

### 2.4 `packages/analytics/src/emit.ts` — the single writer

Mirrors `@ilaunchify/audit`: **never throws, never blocks the business op.** Writes the durable `AnalyticsEvent` row AND forwards to the sink; either failing is swallowed and logged.

```typescript
import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import type { AnalyticsEventName } from './events'
import { getAnalyticsSink } from './sink'

type Role = 'CREATOR' | 'PARTNER' | 'ADMIN' | 'SYSTEM' | 'ANON'

export interface EmitEventInput {
  name: AnalyticsEventName
  source?: 'SERVER' | 'CLIENT'
  actorId?: string | null
  role?: Role
  tenantId?: string | null
  orderId?: string | null
  sessionId?: string | null
  properties?: Record<string, unknown>
  occurredAt?: Date
}

/**
 * Emit an analytics event. Fire-and-forget by contract: a failure here NEVER
 * propagates to the caller (analytics must not break checkout). Durable row +
 * vendor sink are attempted independently.
 */
export async function emitEvent(input: EmitEventInput): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date()
  const role: Role = input.role ?? 'SYSTEM'

  // 1) durable store (source of truth)
  try {
    await prisma.analyticsEvent.create({
      data: {
        name: input.name,
        source: input.source ?? 'SERVER',
        actorId: input.actorId ?? null,
        role,
        tenantId: input.tenantId ?? null,
        orderId: input.orderId ?? null,
        sessionId: input.sessionId ?? null,
        properties: (input.properties ?? undefined) as
          | Prisma.InputJsonObject
          | undefined,
        occurredAt,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] failed to persist event', {
      name: input.name,
      err: (err as Error).message,
    })
  }

  // 2) vendor sink (no-op until P1)
  try {
    await getAnalyticsSink().capture({
      name: input.name,
      actorId: input.actorId ?? null,
      role,
      tenantId: input.tenantId ?? null,
      orderId: input.orderId ?? null,
      sessionId: input.sessionId ?? null,
      properties: input.properties,
      occurredAt,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] sink capture failed', {
      name: input.name,
      err: (err as Error).message,
    })
  }
}

/** Convenience: emit as a known user (maps role, stamps tenant). */
export async function emitEventAs(
  user: { id: string; role: 'CREATOR' | 'PARTNER' | 'ADMIN'; tenantId?: string | null },
  entry: Omit<EmitEventInput, 'actorId' | 'role'>,
): Promise<void> {
  return emitEvent({
    ...entry,
    actorId: user.id,
    role: user.role,
    tenantId: entry.tenantId ?? user.tenantId ?? null,
  })
}

/** Convenience: platform-initiated event (webhooks, cron, FSM transitions). */
export async function emitSystemEvent(
  entry: Omit<EmitEventInput, 'actorId' | 'role'>,
): Promise<void> {
  return emitEvent({ ...entry, actorId: null, role: 'SYSTEM' })
}
```

### 2.5 `packages/analytics/src/cron.ts` — reliability ledger writers

```typescript
import { prisma } from '@ilaunchify/db'

/** Start a cron run; returns the row id to pass to finishCronRun. */
export async function recordCronRun(name: string): Promise<string | null> {
  try {
    const row = await prisma.cronRun.create({ data: { name, status: 'RUNNING' } })
    return row.id
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] recordCronRun failed', { name, err: (err as Error).message })
    return null
  }
}

export async function finishCronRun(
  id: string | null,
  result: { ok: boolean; error?: string; payload?: Record<string, unknown> },
): Promise<void> {
  if (!id) return
  try {
    const row = await prisma.cronRun.findUnique({ where: { id }, select: { startedAt: true } })
    const finishedAt = new Date()
    await prisma.cronRun.update({
      where: { id },
      data: {
        status: result.ok ? 'OK' : 'FAILED',
        finishedAt,
        durationMs: row ? finishedAt.getTime() - row.startedAt.getTime() : null,
        error: result.error ?? null,
        payload: result.payload as never,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[analytics] finishCronRun failed', { id, err: (err as Error).message })
  }
}
```

### 2.6 `packages/analytics/src/index.ts`

```typescript
// @ilaunchify/analytics — canonical event schema + single-writer emitter.
// Write path: emitEvent / emitEventAs / emitSystemEvent (NEVER touch
// prisma.analyticsEvent directly). Vendor forwarding via a pluggable sink
// (no-op until PostHog lands in P1). Cron reliability ledger: recordCronRun /
// finishCronRun. See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md.

export { emitEvent, emitEventAs, emitSystemEvent } from './emit'
export type { EmitEventInput } from './emit'
export { recordCronRun, finishCronRun } from './cron'
export { setAnalyticsSink, getAnalyticsSink } from './sink'
export type { AnalyticsSink, AnalyticsSinkEvent } from './sink'
export { ANALYTICS_EVENTS, P0_SERVER_EVENTS } from './events'
export type { AnalyticsEventName } from './events'
```

---

## 3. Wire the 5 P0 server events

Emit inside the existing FSM/action paths (right after the state change commits — analytics is a side effect, not a gate). Add `@ilaunchify/analytics` to each app's `package.json` where the call site lives.

| Event | Emit site | Key properties |
|---|---|---|
| `ORDER_PAID` | Stripe `payment_intent.succeeded` / `charge.succeeded` webhook handler, after `Order → PAID` | `{ totalCents, subtotalCents, feeCents: applicationFeeCents, creatorTier }` · `orderId`, `tenantId=creatorProfileId` |
| `ORDER_DELIVERED` | `order-fsm` transition to `DELIVERED` | `{ deliveredAt, lateVsPromised: boolean }` · `orderId` |
| `DISPATCH_ACCEPTED` | `dispatch-fsm` accept path (sets `acceptedAt`) | `{ dispatchType, partnerServiceId, acceptLatencyMs, onTimeAccept }` · `tenantId=partnerId`, `orderId` |
| `DISPATCH_DECLINED` | `dispatch-fsm` decline/timeout path | `{ dispatchType, partnerServiceId, declineReason }` · `tenantId=partnerId`, `orderId` |
| `REFUND_ISSUED` | refund action / Stripe `refund` webhook | `{ amountCents, reason }` · `orderId`, `tenantId=creatorProfileId` |

**Pattern (do NOT let emit block the transaction):**

```typescript
// inside dispatch-fsm accept, after the status update + audit write:
await logAuditAs(user, { entityType: 'OrderDispatch', entityId: dispatch.id, action: 'ACCEPT', /* ... */ })
void emitEventAs(
  { id: user.id, role: 'PARTNER', tenantId: partnerId },
  {
    name: ANALYTICS_EVENTS.DISPATCH_ACCEPTED,
    orderId: dispatch.orderId,
    properties: { dispatchType: dispatch.type, partnerServiceId: dispatch.partnerServiceId },
  },
)
```

> Emit is `void`-ed (not awaited into the critical path) OR awaited only if you want ordering guarantees — either is safe because it never throws. Keep it AFTER the audit write and the business commit.

---

## 4. Retire the latent stubs

`apps/creator/src/app/(checkout)/products/[productId]/checkout/types.ts` has fields commented *"Quality signal for analytics"* (e.g. whether the creator saw Step 3's offer card) that currently dead-end on the checkout draft. Route them through the emitter instead:

- When the offer card renders → `emitEventAs(creator, { name: CHECKOUT_OFFER_SEEN, orderId?, properties: { step: 3, offerId } })`.
- On each checkout step view → `CHECKOUT_STEP_VIEWED { step }`.
- `ProductTemplate.recipeEntryMode` (annotated "(analytics)") → emit `PRODUCT_CREATED { recipeEntryMode }` at creation.

These are the first "quality signal" events and validate the whole pipe end-to-end before the P1 SDK arrives.

---

## 5. Apply steps (exact order — CLAUDE.md stale-client gotcha)

```bash
# 1. add the package
#    packages/analytics/{package.json, src/*}  (from §2)
pnpm install                     # link the new workspace package

# 2. apply schema (this repo uses db push, NOT migrate — see CLAUDE.md)
pnpm db:push                     # AnalyticsEvent, CronRun, enums, OrderDispatch fields
pnpm db:generate                 # regenerate client (REQUIRED after push)
rm -rf apps/*/.next              # old client is bundled into .next (transpilePackages)
# restart next dev

# 3. verify guards
pnpm check:invariants            # must stay green — new models use uuid() ✔
pnpm typecheck
pnpm lint
```

---

## 6. Verification / tests (P0 done = these pass)

- [ ] **Emitter is network-free + never throws** — `packages/analytics/src/__tests__/emit.test.ts`: with a stubbed `prisma.analyticsEvent.create` that rejects, `emitEvent` resolves (no throw) and logs. With a throwing sink, still resolves. (Pure vitest, run in `run-vitest-suites.mjs`.)
- [ ] **P0 server events registered** — assert every name in `P0_SERVER_EVENTS` exists in `ANALYTICS_EVENTS` and each has a wired call site (grep test or a manifest assertion).
- [ ] **uuid invariant** — `check:invariants` green (no new `cuid()` model).
- [ ] **promised-date populated** — a routing test asserts `createDispatches` sets `promisedShipBy` non-null on new dispatches.
- [ ] **on-time unblock** — `merit-signals.ts` `onTimeRate` returns a number (not null) for a dispatch with `promisedShipBy` + `readyAt`. *(This is the proof the D3 field paid off — wiring the merit calc itself is a P2 item, but the field must be readable now.)*
- [ ] **CronRun smoke** — pick one existing cron (e.g. SLA sweep), wrap in `recordCronRun`/`finishCronRun`, confirm a row lands OK; point the dashboard "System Health" cron tile at `CronRun` instead of audit-prefix inference.

---

## 7. Two-agent handoff (Cowork ⇄ Code)

Per CLAUDE.md multi-agent rules — **single writer per file, commit immediately.** Ownership proposal for this P0:

- **`packages/analytics/*` (all new files)** — collision-safe (net-new). Either agent can create; whoever does, commit immediately.
- **`packages/db/prisma/schema.prisma`** — HOT (both agents touch it). Coordinate: one writer adds the three blocks (§1.1–1.3) in a single edit + `db:push` + commit before the other touches the file. Announce ownership first.
- **`dispatch-fsm.ts` / `order-fsm.ts` / refund action / Stripe webhook** — these are Code's routing/payments zone. Recommend **Code wires §3 + the `createDispatches` promised-date population**; Cowork owns `packages/analytics` + the checkout stub retirement (§4) in the creator app. Clean split, no shared files.
- Because Cowork's sandbox can't write `.git`, the human runs each `git add … && git commit && git push` promptly after a change so nothing sits uncommitted while the other agent is active.

---

## 8. Why this is the right P0 (recap)

- **Additive, no vendor lock** — ships value (durable events + real cron health + on-time unblock) with zero external commitment; D1/D2 decide later and slot into the sink seam.
- **One substrate, two consumers** — the promised-date field + event store feed *both* analytics and the Merit Engine; nothing is computed twice.
- **Fixes today's synthetic health** — `CronRun` replaces audit-prefix guessing; the "System Health" row stops lying.
- **Vocabulary locked early** — the 24-name registry is the taxonomy decision made once, so P1 client wiring is mechanical.
- **Fire-and-forget safety** — analytics can never break checkout; it mirrors the audit contract the codebase already trusts.
```

