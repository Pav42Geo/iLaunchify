// Sentry server-side init for apps/admin (P6 — observability).
//
// DSN-guarded: when SENTRY_DSN is unset (local dev, or before Pavel provisions a
// project), Sentry.init() is never called and this is a no-op — nothing is sent.
// Imported lazily from instrumentation.ts#register() only when the DSN is set.

import * as Sentry from '@sentry/nextjs'

const APP = 'admin'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Cheap perf visibility into request-flow latency (P6 step 4).
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Tag every event with the app so a shared Sentry org can scope alerts.
      event.tags = { ...event.tags, app: APP }
      // Scrub PII before it leaves the server.
      if (event.user) {
        delete event.user.email
        delete event.user.username
        delete event.user.ip_address
      }
      // Drop Next's control-flow "errors" — redirect() / notFound() throw.
      const value = event.exception?.values?.[0]?.value ?? ''
      if (value.includes('NEXT_REDIRECT') || value.includes('NEXT_HTTP_ERROR_FALLBACK')) {
        return null
      }
      return event
    },
  })
}
