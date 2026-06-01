// Next 15 instrumentation — structured server-error logging (PLATFORM_SPEC
// §Tier 4 #19, observability foundation). This is the Sentry integration point:
// once a SENTRY_DSN is configured + @sentry/nextjs added, replace the
// console.error with `Sentry.captureRequestError(error, request, context)`.

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
      app: 'admin',
      event: 'request_error',
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      error: err,
      time: new Date().toISOString(),
    }),
  )
}
