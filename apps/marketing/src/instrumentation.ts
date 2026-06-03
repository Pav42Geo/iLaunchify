// Next 15 instrumentation — structured server-error logging + Sentry capture
// (P6, observability). The structured JSON log ALWAYS runs (so we have signal
// without Sentry); Sentry capture is layered on top and only fires when
// SENTRY_DSN is configured (sentry.server.config.ts is DSN-guarded too).

import * as Sentry from '@sentry/nextjs'

const APP = 'marketing'

export async function register(): Promise<void> {
  if (process.env.SENTRY_DSN && process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
}

export function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string },
): void {
  const err =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) }
  console.error(
    JSON.stringify({
      level: 'error',
      app: APP,
      event: 'request_error',
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      error: err,
      time: new Date().toISOString(),
    }),
  )

  if (process.env.SENTRY_DSN) {
    type CRE = typeof Sentry.captureRequestError
    Sentry.captureRequestError(
      error,
      request as Parameters<CRE>[1],
      context as Parameters<CRE>[2],
    )
  }
}
