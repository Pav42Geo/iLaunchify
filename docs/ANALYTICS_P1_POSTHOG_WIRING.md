# iLaunchify — Analytics P1: PostHog Wiring

**Status:** DRAFT · 2026-07-09
**Parent:** `ANALYTICS_STRATEGY.md` (D1 = PostHog) · `ANALYTICS_P0_SUBSTRATE_SPEC.md` (the seam)
**Depends on:** P0 shipped (`@ilaunchify/analytics` + `AnalyticsEvent` store live).

> The whole point of the P0 sink seam: turning PostHog **on** is additive. `emitEvent()` already forwards every event to the active sink. Installing `PostHogSink` at boot flips forwarding on with **zero call-site changes**. Until `POSTHOG_KEY` is set, the NoopSink stays active and only the durable `AnalyticsEvent` row is written — same DSN-guard discipline as Sentry.

---

## 1. What shipped in this drop

- `packages/analytics/src/posthog.ts` — `PostHogSink` (server-side, `posthog-node`) + `initAnalyticsFromEnv()`.
- `packages/analytics/package.json` — adds `posthog-node` and a subpath `exports` map. **`PostHogSink` is intentionally NOT re-exported from `./index`** — import it from `@ilaunchify/analytics/posthog` in server-only boot code so `posthog-node` never leaks into a client bundle. A client-safe `@ilaunchify/analytics/events` subpath exposes just the event-name constants.
- `packages/analytics/src/__tests__/posthog.test.ts` — mapping tests (mocked, network-free).

**Server sink behavior (decisions baked in):**
- **Serverless-safe delivery** — awaits `captureImmediate` (posthog-node v4) so the event actually leaves before the function freezes; `flushAt: 1, flushInterval: 0`. Volume is modest; correctness > batching for SERVER events.
- **Phantom-person suppression** — `CREATOR/PARTNER/ADMIN` with an `actorId` become identified persons; `SYSTEM/ANON` set `$process_person_profile: false` (cost + noise control).
- **Stable distinct id** — `actorId → sessionId → "system"`.
- **Anchors preserved** — `tenant_id` / `order_id` / `role` land as PostHog properties; optional `tenant` group behind `POSTHOG_TENANT_GROUPS=1`.

---

## 2. Env vars (add to each app's `.env` + `.env.example`)

```bash
POSTHOG_KEY=                 # phc_...  project API key. Unset ⇒ sink stays no-op.
POSTHOG_HOST=https://us.i.posthog.com   # EU cloud ⇒ https://eu.i.posthog.com
POSTHOG_TENANT_GROUPS=       # "1" to map tenantId → PostHog "tenant" group (optional)

# Client-side behavioral capture (browser SDK, §4). NEXT_PUBLIC_ = shipped to client.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Keep the server `POSTHOG_KEY` and the `NEXT_PUBLIC_POSTHOG_KEY` as the **same** project key — server + client events land in one project and stitch on distinct id.

---

## 3. Server boot wiring (each app's `instrumentation.ts`)

Sentry already initializes here under the nodejs runtime guard. Add the analytics init beside it — **nodejs runtime only** (posthog-node is server-only; the edge runtime must not import it).

```typescript
// apps/<app>/src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ... existing Sentry server init ...

    // Analytics P1 — install the PostHog sink (no-op if POSTHOG_KEY unset).
    const { initAnalyticsFromEnv } = await import('@ilaunchify/analytics/posthog')
    const sink = initAnalyticsFromEnv()

    // Graceful drain so queued events flush on shutdown (SIGTERM).
    if (sink) {
      const drain = () => { void sink.shutdown() }
      process.once('SIGTERM', drain)
      process.once('SIGINT', drain)
    }
  }
}
```

`await import(...)` (dynamic) keeps `posthog-node` out of the edge/client compilation entirely. Do this in all four apps (`marketing`, `creator`, `partner`, `admin`) so server events from any app forward.

Add the dep where boot lives:

```bash
pnpm --filter @ilaunchify/marketing add @ilaunchify/analytics@workspace:*
pnpm --filter @ilaunchify/creator   add @ilaunchify/analytics@workspace:*
pnpm --filter @ilaunchify/partner   add @ilaunchify/analytics@workspace:*
pnpm --filter @ilaunchify/admin     add @ilaunchify/analytics@workspace:*
pnpm install
```

---

## 4. Client-side behavioral capture (`posthog-js`) — the other half of P1

The server sink covers money/state (source of truth). Behavioral funnel events (`studio_opened`, `template_applied`, `checkout_step_viewed`, …) fire from the browser via `posthog-js`. Two rules so client + server reconcile:

1. **Same event names** — import from the client-safe subpath: `import { ANALYTICS_EVENTS } from '@ilaunchify/analytics/events'`. Never hand-type a name string.
2. **Same distinct id** — call `posthog.identify(userId, { role })` on login and `posthog.reset()` on logout, so browser events join server events on the same person.

Minimal provider (add once per app root layout, client component):

```tsx
'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    capture_pageview: true,
    person_profiles: 'identified_only', // mirror server: no phantom persons
  })
}

export function Analytics({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
```

Then fire behavioral events at the source, e.g. in the Studio:

```tsx
import posthog from 'posthog-js'
import { ANALYTICS_EVENTS } from '@ilaunchify/analytics/events'
posthog.capture(ANALYTICS_EVENTS.STUDIO_OPENED, { productId })
```

> Client events do NOT go through `emitEvent()` (that's server + Prisma). They go straight to PostHog. If you later want a durable copy of key client events, relay them through a thin `/api/analytics` route that calls `emitEvent({ source: 'CLIENT', ... })` — defer unless needed.

---

## 5. PostHog project setup (one-time, in the PostHog UI)

1. Create a project → copy the **Project API key** (`phc_...`) into `POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_KEY`; note US vs EU host.
2. **Data management → set person profiles to "identified only"** (matches our `$process_person_profile` policy — avoids paying for anonymous/system persons).
3. Build the **activation funnel** insight from the registry names: `signup_completed → product_created → design_published → checkout_started → order_paid`. This is the first thing to watch.
4. (Optional) enable **group analytics** and create a `tenant` group type if you set `POSTHOG_TENANT_GROUPS=1` — lets you view metrics per creator/partner org.
5. (P2) point warehouse ingestion at PostHog's export (BigQuery/Snowflake) so behavioral joins transactional in dbt.

---

## 6. Verification

```bash
pnpm install
pnpm --filter @ilaunchify/analytics vitest run   # posthog.test.ts + emit.test.ts green
pnpm typecheck
```

Runtime smoke: set `POSTHOG_KEY` in one app's `.env.local`, trigger an `order_paid` (or set `ANALYTICS_DEBUG=1` with the NoopSink first), and confirm the event appears in PostHog → Activity within ~30s. Confirm no `posthog-node` import shows up in a client bundle (`next build` → check the client chunks don't reference it).

---

## 7. Rollout note

Ship the sink **installed but keyless** first (P0 already merged; this just adds the code path). Flip `POSTHOG_KEY` on in staging, watch one funnel, then production. Because forwarding is env-gated and fire-and-forget, a PostHog outage can never affect checkout — worst case, the durable `AnalyticsEvent` rows still capture everything and PostHog backfills from the warehouse export.
