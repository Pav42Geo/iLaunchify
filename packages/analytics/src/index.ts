// @ilaunchify/analytics — canonical event schema + single-writer emitter.
//
// Write path: emitEvent / emitEventAs / emitSystemEvent (NEVER touch
// prisma.analyticsEvent directly). Vendor forwarding via a pluggable sink
// (no-op until PostHog lands in P1). Cron reliability ledger:
// recordCronRun / finishCronRun.
//
// See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md.

export { emitEvent, emitEventAs, emitSystemEvent } from './emit'
export type { EmitEventInput } from './emit'
export { recordCronRun, finishCronRun } from './cron'
export { setAnalyticsSink, getAnalyticsSink } from './sink'
export type { AnalyticsSink, AnalyticsSinkEvent, AnalyticsActorRole } from './sink'
export {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_NAMES,
  P0_SERVER_EVENTS,
} from './events'
export type { AnalyticsEventName } from './events'
