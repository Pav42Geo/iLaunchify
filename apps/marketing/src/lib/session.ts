// Marketing session helper (REBUILD R2).
//
// The marketing app reads the Auth.js v5 session cookie that's set by the
// creator app on localhost:3000. Because browsers don't include the port in
// cookie scope, the same `authjs.session-token` cookie is visible to
// localhost:3010 (marketing) — and because AUTH_SECRET is shared via the
// monorepo .env.local, the JWT decodes cleanly here too.
//
// In production, the same effect is achieved by setting AUTH_COOKIE_DOMAIN
// to `.ilaunchify.com` so the cookie is shared across all subdomains.
//
// This helper is the single safe entry point for marketing server
// components that need to know who's looking. Auth failures are swallowed
// — the marketing app never blocks rendering on a session error.

import { auth } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'

export interface MarketingSessionUser {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'CREATOR' | 'PARTNER'
}

export interface MarketingSessionBrand {
  id: string
  name: string
  handle: string
}

export interface MarketingSession {
  user: MarketingSessionUser
  brands: MarketingSessionBrand[]
  activeBrandId: string | null
}

/**
 * Read the current session. Returns null when there's no signed-in user
 * (guest path) or when reading the session fails for any reason.
 *
 * We short-circuit when AUTH_SECRET isn't in env — Auth.js would
 * otherwise log a noisy MissingSecret error before our try/catch
 * could swallow it. That state usually means the marketing dev server
 * was started without the dotenv wrapper (pre-R2 dev script); the fix
 * is to restart the dev server. Production deploys must have
 * AUTH_SECRET set or auth integration is broken anyway.
 */
export async function getMarketingSession(): Promise<MarketingSession | null> {
  if (!process.env.AUTH_SECRET) {
    return null
  }
  try {
    const session = await auth()
    if (!session?.user?.id) return null
    const user: MarketingSessionUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      role: session.user.role,
    }
    // Brand list — only relevant for CREATOR users. Admins viewing the
    // marketing app don't get a brand switcher.
    const brands =
      user.role === 'CREATOR'
        ? await loadCreatorBrands(user.id)
        : []
    // V1 active-brand-id is read from cookie in apps/creator. Marketing
    // doesn't read its own cookie yet; it just picks the first brand as
    // active. Cross-app cookie reading is V1.5+ if needed.
    const activeBrandId = brands[0]?.id ?? null
    return { user, brands, activeBrandId }
  } catch {
    return null
  }
}

async function loadCreatorBrands(userId: string): Promise<MarketingSessionBrand[]> {
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: {
      brands: {
        select: { id: true, name: true, handle: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  return profile?.brands ?? []
}

// -----------------------------------------------------------------------------
// Header-prop shaper — one-liner for every marketing page
// -----------------------------------------------------------------------------

export interface HeaderProps {
  user: { name: string | null; email: string } | null
  brands: { id: string; name: string; colorHex: string }[]
  activeBrandId: string
}

export function headerPropsFromSession(
  session: MarketingSession | null,
): HeaderProps {
  if (!session) return { user: null, brands: [], activeBrandId: '' }
  return {
    user: { name: session.user.name, email: session.user.email },
    brands: session.brands.map((b) => ({
      id: b.id,
      name: b.name,
      colorHex: '#FF2E63',
    })),
    activeBrandId: session.activeBrandId ?? '',
  }
}
