// Dev-only sign-in shortcut for the partner app.
// See apps/creator and apps/admin equivalents for the original. Identical
// behavior except this app enforces role=PARTNER.
//
// Usage: /api/dev/login?email=sample-manufacturer@ilaunchify.dev → /dashboard

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { encode } from 'next-auth/jwt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COOKIE_NAME = 'authjs.session-token'
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

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
        usage:
          '/api/dev/login?email=sample-manufacturer@ilaunchify.dev (or any seeded PARTNER role user)',
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
        hint: 'Is CockroachDB running on the port in DATABASE_URL?',
      },
      { status: 500 },
    )
  }

  if (!user) {
    const allEmails = await prisma.user.findMany({
      where: { role: 'PARTNER' },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(
      {
        error: `No user with email "${email}"`,
        availablePartners: allEmails,
      },
      { status: 404 },
    )
  }

  if (user.role !== 'PARTNER') {
    return NextResponse.json(
      {
        error: `User "${email}" is role ${user.role}, not PARTNER. Use the appropriate app's /api/dev/login.`,
        hint: 'Admin app on :3003, creator app on :3000.',
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
      { error: 'JWT encoding failed', detail: (err as Error).message },
      { status: 500 },
    )
  }

  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl') ?? '/dashboard'
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
