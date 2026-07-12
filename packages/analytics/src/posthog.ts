// P1 — PostHog server-side sink. Plugs into the setAnalyticsSink() seam with NO
// call-site changes: emitEvent() already forwards every event to the active sink.
//
// IMPORTANT: this module imports posthog-node (server-only) and is deliberately
// NOT re-exported from ./index. Import it from the '@ilaunchify/analytics/posthog'
// subpath in server-only boot code (each app's instrumentation.ts, nodejs
// runtime) so posthog-node never leaks into a client bundle.
//
// See docs/ANALYTICS_P1_POSTHOG_WIRING.md.

import { PostHog } from 'posthog-node'
import { setAnalyticsSink } from './sink'
import type { AnalyticsSink, AnalyticsSinkEvent } from './sink'

export interface PostHogSinkOptions {
  apiKey: string
  host?: string
  // Map tenantId → a PostHog "tenant" group. Requires group analytics enabled in
  // the PostHog project, so it's OFF by default to avoid surprise group creation.
  enableTenantGroups?: boolean
  // Serverless-friendly defaults: send eagerly (our emitEvent awaits capture, so
  // we favor immediate delivery over batching — SERVER events are the source of
  // truth and volume is modest). Override for high-volume client-relay use.
  flushAt?: number
  flushInterval?: number
}

// Roles that map to a real, identifiable person in PostHog. SYSTEM/ANON events
// suppress person-profile creation (cost + noise control).
const PERSON_ROLES: ReadonlySet<string> = new Set(['CREATOR', 'PARTNER', 'ADMIN'])

export class PostHogSink implements AnalyticsSink {
  private readonly client: PostHog
  private readonly enableTenantGroups: boolean

  constructor(opts: PostHogSinkOptions) {
    this.client = new PostHog(opts.apiKey, {
      host: opts.host ?? 'https://us.i.posthog.com',
      flushAt: opts.flushAt ?? 1,
      flushInterval: opts.flushInterval ?? 0,
    })
    this.enableTenantGroups = opts.enableTenantGroups ?? false
  }

  async capture(event: AnalyticsSinkEvent): Promise<void> {
    // PostHog requires a stable distinct id. Real users → actorId; anonymous →
    // sessionId; system/no-actor → a stable sentinel (person profile suppressed).
    const distinctId = event.actorId ?? event.sessionId ?? 'system'
    const isPerson = PERSON_ROLES.has(event.role) && Boolean(event.actorId)

    const properties: Record<string, unknown> = {
      ...event.properties,
      role: event.role,
      source: 'server',
      // Keep our business anchors queryable inside PostHog.
      tenant_id: event.tenantId ?? undefined,
      order_id: event.orderId ?? undefined,
      // Suppress phantom person profiles for system/anonymous backend events.
      $process_person_profile: isPerson,
    }

    const payload: Parameters<PostHog['capture']>[0] = {
      distinctId,
      event: event.name,
      properties,
      timestamp: event.occurredAt,
    }

    if (this.enableTenantGroups && event.tenantId) {
      ;(payload as { groups?: Record<string, string> }).groups = {
        tenant: event.tenantId,
      }
    }

    // Prefer the awaited path so the event is actually delivered within the
    // request lifecycle (serverless functions can freeze after the response).
    // captureImmediate exists in posthog-node v4; fall back to queued capture.
    const c = this.client as unknown as {
      captureImmediate?: (p: typeof payload) => Promise<void>
    }
    if (typeof c.captureImmediate === 'function') {
      await c.captureImmediate(payload)
    } else {
      this.client.capture(payload)
    }
  }

  /** Graceful drain — call on process shutdown (SIGTERM) to flush the queue. */
  async shutdown(): Promise<void> {
    await this.client.shutdown()
  }
}

/**
 * Construct a PostHogSink from env and install it as the active sink. No-op if
 * POSTHOG_KEY is unset (mirrors the Sentry DSN-guard pattern) — the NoopSink
 * stays active and only the durable AnalyticsEvent row is written.
 *
 * Call once at server boot (each app's instrumentation.ts, nodejs runtime).
 * Returns the sink (or null) so the caller can wire shutdown().
 *
 * Env:
 *   POSTHOG_KEY            project API key (phc_...). Unset = sink stays no-op.
 *   POSTHOG_HOST           ingestion host (default https://us.i.posthog.com;
 *                          EU → https://eu.i.posthog.com).
 *   POSTHOG_TENANT_GROUPS  "1" to map tenantId → PostHog "tenant" group.
 */
export function initAnalyticsFromEnv(): PostHogSink | null {
  const apiKey = process.env.POSTHOG_KEY
  if (!apiKey) return null
  const sink = new PostHogSink({
    apiKey,
    host: process.env.POSTHOG_HOST,
    enableTenantGroups: process.env.POSTHOG_TENANT_GROUPS === '1',
  })
  setAnalyticsSink(sink)
  return sink
}
