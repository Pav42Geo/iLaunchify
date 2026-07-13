// Auth.js v5 (NextAuth) configuration.
//
// Providers are conditionally registered based on env presence so local dev
// works without third-party credentials. At minimum AUTH_SECRET is required.
// If no auth providers are configured AND NODE_ENV !== 'production', a
// dev-only Credentials provider is added that lets you sign in by typing
// just an email (must match a seeded User row).

import NextAuth, { type NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@ilaunchify/db'
import { checkRateLimit } from './rate-limit'
import { isDevSignInAllowed } from './dev-guard'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: 'ADMIN' | 'CREATOR' | 'PARTNER' | 'DESIGNER'
      // Admin RBAC sub-role (docs/ADMIN_RBAC.md). Null for non-admins or an
      // admin not yet assigned a role. Authorization still resolves live via
      // requireCapability — this is for UI display only.
      adminRole?: 'SUPPORT_AGENT' | 'SUPPORT_LEAD' | 'BILLING_ADMIN' | 'SUPER_ADMIN' | null
    }
  }
}

const providers: NextAuthConfig['providers'] = []

// Google OAuth — only if credentials are present
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { scope: 'openid email profile' } },
    }),
  )
}

// Resend email magic links — only if API key is present
if (process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
  )
}

// Dev-only fallback: sign in by email (must match a seeded User row).
// Only loads when no real provider is configured AND not in production.
// Credentials provider requires JWT sessions (not database).
// Predicate lives in ./dev-guard (unit-tested SSOT) so this can't silently drift. (H5 A3)
const isDevSignInOnly = isDevSignInAllowed(providers.length)

// Fail-closed (H5 A3): the dev Credentials provider must NEVER exist in a production
// runtime. isDevSignInAllowed already excludes prod by construction, but assert it
// explicitly at boot so a future refactor of that predicate can't re-open the bypass
// in prod without tripping this. Skipped during `next build` (isDevSignInOnly is false
// there regardless — NODE_ENV=production — so this never fires at build time).
if (process.env.NODE_ENV === 'production' && isDevSignInOnly) {
  throw new Error(
    'FATAL: dev credentials sign-in resolved active in a production runtime. ' +
      'This must never happen — configure a real provider (AUTH_RESEND_KEY / AUTH_GOOGLE_*).',
  )
}

if (isDevSignInOnly) {
  providers.push(
    Credentials({
      name: 'Dev sign-in (email only)',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.toLowerCase().trim()
        if (!email) return null
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          console.warn(
            `[dev sign-in] No user with email "${email}". Seeded users include:\n` +
              `  - georgiev.pavel@gmail.com (admin)\n` +
              `  - sample-creator@ilaunchify.dev\n` +
              `  - sample-manufacturer@ilaunchify.dev\n` +
              `  - sample-print@ilaunchify.dev`,
          )
          return null
        }
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  )
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  Auth.js: no Google or Resend credentials found. Dev-only credentials sign-in enabled.\n' +
      '    Visit /login and enter a seeded user email (no password). Set AUTH_GOOGLE_* or AUTH_RESEND_KEY to disable.\n',
  )
}

// Guard RUNTIME, not the build. `next build` imports every route to collect page
// data with NODE_ENV=production (so the dev-credentials fallback above is skipped);
// throwing here at import time would fail the build in any env without provider keys.
// During the build phase (NEXT_PHASE=phase-production-build) we skip the throw — the
// same check still fires when the server actually boots to serve requests.
if (providers.length === 0 && process.env.NEXT_PHASE !== 'phase-production-build') {
  throw new Error(
    'No auth providers configured. Set AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET, or AUTH_RESEND_KEY + AUTH_EMAIL_FROM in your env.',
  )
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Database sessions for real providers; JWT for dev credentials fallback.
  session: { strategy: isDevSignInOnly ? 'jwt' : 'database' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login/check-email',
    error: '/login',
  },
  providers,
  callbacks: {
    // Tier 0.3 (docs/SECURITY_ARCHITECTURE.md) — throttle sign-in attempts per
    // identifier. Covers Resend magic-link request spam (each attempt sends an
    // email) and the dev credentials provider. 10 attempts / 15 min.
    async signIn({ user, credentials }) {
      const identifier =
        user?.email ??
        (typeof credentials?.email === 'string' ? credentials.email : null)
      if (!identifier) return true
      const limit = await checkRateLimit({
        scope: 'signin:id',
        id: identifier.toLowerCase().trim(),
        limit: 10,
        windowSec: 15 * 60,
      })
      return limit.ok
    },
    async session({ session, user, token }) {
      const userId = user?.id ?? (token?.sub as string | undefined)
      if (!userId || !session.user) return session
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, adminRole: true },
      })
      if (dbUser) {
        session.user.id = dbUser.id
        session.user.role = dbUser.role
        session.user.adminRole = dbUser.adminRole ?? null
      }
      return session
    },
  },
})
