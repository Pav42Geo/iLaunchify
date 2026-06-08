// Edge gate — docs/SECURITY_ARCHITECTURE.md Tier 0.1 (LOCKED 2026-06-05).
//
// Admin is the highest-value target: every route except login/auth requires a
// session cookie. PRESENCE check only (Auth.js database sessions; Prisma can't
// run at the edge) — requireRole('ADMIN') in pages/actions remains the real
// enforcement. No /api/webhooks here: admin has no webhook routes.
//
// Self-contained on purpose: do NOT import from @ilaunchify/auth here — it
// pulls in the Prisma client, which breaks the edge runtime.

import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = [
  '/login', // includes /login/check-email
  '/signup', // invite-only flow still needs the page reachable
  '/api/auth',
]

const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name))
  if (hasSessionCookie) return NextResponse.next()

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('callbackUrl', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)'],
}
