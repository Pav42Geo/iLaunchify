/**
 * URL helper for cross-app navigation to the partner app.
 *
 * apps/admin (port 3003) and apps/partner (port 3002) are different Next.js
 * apps; in prod they share a domain via subdomain or path routing. Cross-app
 * links must use a full URL — a plain Next `<Link>` would 404 in dev because
 * the admin app doesn't carry the partner routes.
 *
 * Pattern matches apps/admin/src/lib/marketing-url.ts + apps/marketing app-urls.
 */

const PARTNER_BASE =
  process.env.NEXT_PUBLIC_PARTNER_URL ?? 'http://localhost:3002'

export function partnerUrl(path: string = '/'): string {
  return `${PARTNER_BASE}${path}`
}
