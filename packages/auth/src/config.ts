// Auth.js v5 (NextAuth) configuration.
//
// Providers: Google OAuth + Email magic links (via Resend).
// Session strategy: database-backed (matches Prisma adapter).
// Role: derived from User.role column at session callback time.

import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
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

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
    verifyRequest: '/login/check-email',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      // Lock to email scope; we don't need extra Google APIs
      authorization: { params: { scope: 'openid email profile' } },
    }),
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY!,
      from: process.env.AUTH_EMAIL_FROM!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Look up role from DB. Cached in session row; updated on next login if role changes.
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      })
      if (session.user && dbUser) {
        session.user.id = user.id
        session.user.role = dbUser.role
      }
      return session
    },
  },
})
