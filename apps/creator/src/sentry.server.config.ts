// Sentry server-side init for apps/creator (P6 — observability).
//
// DSN-guarded: when SENTRY_DSN is unset (local dev, or before Pavel provisions a
// project), Sentry.init() is never called and this is a no-op — nothing is sent.
// Imported lazily from instrumentation.ts#register() only when the DSN is set.

import * as Sentry from '@sentry/nextjs'

const APP = 'creator'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.2,
    beforeSend(event) {
      event.tags = { ...event.tags, app: APP }
      if (event.user) {
        delete event.user.email
        delete event.user.username
        delete event.user.ip_address
      }
      const value = event.exception?.values?.[0]?.value ?? ''
      if (value.includes('NEXT_REDIRECT') || value.includes('NEXT_HTTP_ERROR_FALLBACK')) {
        return null
      }
      return event
    },
  })
}
