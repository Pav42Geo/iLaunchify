/**
 * URL helper for cross-app navigation back to the public marketing site.
 *
 * apps/creator (port 3000 in dev) and apps/marketing (port 3010 in dev) are
 * different apps; in prod they share a domain via subdomain or path routing.
 *
 * The iLaunchify logo on auth pages (/signup, /login) should always return
 * the visitor to the public marketing home — NOT to /dashboard or /login or
 * /marketplace.
 *
 * NEXT_PUBLIC_MARKETING_URL overrides the default. Defaults to localhost:3010
 * so dev works without env config.
 */

const MARKETING_BASE =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'

export function marketingUrl(path: string = '/'): string {
  return `${MARKETING_BASE}${path}`
}
