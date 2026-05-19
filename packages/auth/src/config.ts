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

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: 'ADMIN' | 'CREATOR' | 'PARTNER'
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
const isDevSignInOnly =
  providers.length === 0 && process.env.NODE_ENV !== 'production'

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

if (providers.length === 0) {
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
    async session({ session, user, token }) {
      const userId = user?.id ?? (token?.sub as string | undefined)
      if (!userId || !session.user) return session
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      })
      if (dbUser) {
        session.user.id = dbUser.id
        session.user.role = dbUser.role
      }
      return session
    },
  },
})
