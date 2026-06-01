/**
 * URL helper for cross-app navigation to the public marketing site.
 *
 * apps/admin (port 3003) and apps/marketing (port 3010) are different
 * Next.js apps; in prod they share a domain via subdomain or path routing.
 * Cross-app links must use a full URL — a plain Next `<Link>` would 404 in
 * dev because the admin app doesn't carry the marketing routes.
 *
 * Pattern matches apps/creator/src/lib/marketing-url.ts.
 */

const MARKETING_BASE =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'

export function marketingUrl(path: string = '/'): string {
  return `${MARKETING_BASE}${path}`
}
