// Dev-only sign-in shortcut for the admin app.
// Bypasses the Auth.js sign-in UI by directly encoding a JWT session cookie
// that matches what the rest of the app expects (auth config uses JWT
// strategy when no real providers are configured — see packages/auth/src/config.ts).
//
// Usage: visit /api/dev/login?email=georgiev.pavel@gmail.com → redirected to /leads
//
// SAFETY: refuses to run in production.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { encode } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COOKIE_NAME = 'authjs.session-token'
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Dev sign-in is disabled in production' },
      { status: 403 },
    )
  }

  const secret = process.env.AUTH_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'AUTH_SECRET is not set in .env.local' },
      { status: 500 },
    )
  }

  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  if (!email) {
    return NextResponse.json(
      {
        error: 'Missing ?email parameter',
        usage: '/api/dev/login?email=georgiev.pavel@gmail.com',
      },
      { status: 400 },
    )
  }

  let user
  try {
    user = await prisma.user.findUnique({ where: { email } })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Database query failed',
        detail: (err as Error).message,
        hint: 'Is CockroachDB running on the port in DATABASE_URL? Try: docker ps | grep cockroach',
      },
      { status: 500 },
    )
  }

  if (!user) {
    const allEmails = await prisma.user.findMany({
      select: { email: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(
      {
        error: `No user with email "${email}"`,
        availableUsers: allEmails,
      },
      { status: 404 },
    )
  }

  // The admin layout enforces requireRole('ADMIN') — refuse non-admins here
  // so they get a clean error instead of bouncing through a redirect.
  if (user.role !== 'ADMIN') {
    return NextResponse.json(
      {
        error: `User "${email}" is role ${user.role}, not ADMIN. Use the appropriate app's /api/dev/login.`,
        hint: 'Partner app on :3002, creator app on :3000.',
      },
      { status: 403 },
    )
  }

  let token: string
  try {
    token = await encode({
      token: {
        sub: user.id,
        email: user.email,
        name: user.name,
        picture: user.image,
      },
      secret,
      salt: COOKIE_NAME,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'JWT encoding failed',
        detail: (err as Error).message,
      },
      { status: 500 },
    )
  }

  // Admin lands on /leads (the inbox), not /dashboard — there's no admin dashboard yet.
  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') ?? '/leads'
  const res = NextResponse.redirect(new URL(callbackUrl, req.url))

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })

  return res
}
