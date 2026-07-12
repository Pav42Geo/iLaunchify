// The pluggable vendor seam. This is what makes P1 additive: PostHog (or
// Amplitude / Mixpanel) drops in here with NO call-site changes. Default is a
// no-op that logs in dev only.
//
// See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md §2.3 and BUILD_CHECKLIST_ANALYTICS.md P1.

import type { AnalyticsEventName } from './events'

export type AnalyticsActorRole =
  | 'CREATOR'
  | 'PARTNER'
  | 'ADMIN'
  | 'SYSTEM'
  | 'ANON'

export interface AnalyticsSinkEvent {
  name: AnalyticsEventName
  actorId?: string | null
  role: AnalyticsActorRole
  tenantId?: string | null
  orderId?: string | null
  sessionId?: string | null
  properties?: Record<string, unknown>
  occurredAt: Date
}

export interface AnalyticsSink {
  capture(event: AnalyticsSinkEvent): Promise<void> | void
}

// Default sink: no external vendor yet (pre-D1). Logs in non-prod when
// ANALYTICS_DEBUG is set so wiring is visible during development; silent in
// prod. Replaced in P1 by a PostHogSink via setAnalyticsSink().
class NoopSink implements AnalyticsSink {
  capture(event: AnalyticsSinkEvent): void {
    if (process.env.NODE_ENV !== 'production' && process.env.ANALYTICS_DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[analytics] event', event.name, event.properties ?? {})
    }
  }
}

let activeSink: AnalyticsSink = new NoopSink()

/**
 * P1: call once at app boot with a PostHogSink (or other vendor sink) to start
 * forwarding events externally. Until then the NoopSink is used and only the
 * durable AnalyticsEvent row is written.
 */
export function setAnalyticsSink(sink: AnalyticsSink): void {
  activeSink = sink
}

export function getAnalyticsSink(): AnalyticsSink {
  return activeSink
}
