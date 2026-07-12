'use client'

// Client-side analytics helpers (posthog-js). Thin, never-throws wrappers around
// posthog.capture/identify so behavioral events use the SAME curated event names
// as the server emitter (@ilaunchify/analytics) — import names from the
// client-safe '/events' subpath (no Prisma, no posthog-node).
//
// No-op when NEXT_PUBLIC_POSTHOG_KEY is unset (mirrors the server DSN-guard):
// the app behaves identically without a key. See docs/ANALYTICS_P1_POSTHOG_WIRING.md.

import posthog from 'posthog-js'
import { ANALYTICS_EVENTS } from '@ilaunchify/analytics/events'
import type { AnalyticsEventName } from '@ilaunchify/analytics/events'

export { ANALYTICS_EVENTS }
export type { AnalyticsEventName }

const enabled =
  typeof window !== 'undefined' && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)

/** Fire a behavioral event. Names must come from the shared registry. */
export function captureClient(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  if (!enabled) return
  try {
    posthog.capture(name, properties)
  } catch {
    /* analytics must never break the UI */
  }
}

/**
 * Bind the browser session to a stable distinct id. Pass the SAME id the server
 * uses (the creator's user.id) so client + server events stitch to one person.
 */
export function identifyClient(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!enabled) return
  try {
    posthog.identify(distinctId, properties)
  } catch {
    /* noop */
  }
}

/** Clear identity on logout so the next user isn't merged into this person. */
export function resetClient(): void {
  if (!enabled) return
  try {
    posthog.reset()
  } catch {
    /* noop */
  }
}
