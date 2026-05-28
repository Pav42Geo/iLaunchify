/**
 * URL helpers for cross-app navigation.
 *
 * apps/marketing (port 3010 in dev) routes guests through to apps/creator
 * (port 3000 in dev, same domain in prod via subdomain or path routing) for
 * signup, login, dashboard, and Design Studio destinations.
 *
 * NEXT_PUBLIC_APP_URL is set in .env.local — defaults to http://localhost:3000
 * so dev works without env config.
 */

const CREATOR_BASE =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

const PARTNER_BASE =
  process.env.NEXT_PUBLIC_PARTNER_URL ?? 'http://localhost:3002'

function withQuery(
  base: string,
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  if (!params) return `${base}${path}`
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join('&')
  return qs ? `${base}${path}?${qs}` : `${base}${path}`
}

/** URL for an apps/creator route. */
export function creatorUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  return withQuery(CREATOR_BASE, path, params)
}

/** URL for an apps/partner route. */
export function partnerUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): string {
  return withQuery(PARTNER_BASE, path, params)
}
