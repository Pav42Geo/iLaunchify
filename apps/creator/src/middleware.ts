// Edge gate — docs/SECURITY_ARCHITECTURE.md Tier 0.1 (LOCKED 2026-06-05).
//
// Defense-in-depth ONLY: this checks session-cookie PRESENCE, not validity —
// Auth.js uses database sessions and Prisma can't run at the edge. Real
// validation + role checks stay with requireUser()/requireRole() in every
// page and server action. This layer just stops anonymous traffic from ever
// reaching an authed route if someone forgets a guard.
//
// Self-contained on purpose: do NOT import from @ilaunchify/auth here — it
// pulls in the Prisma client, which breaks the edge runtime.

import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = [
  '/login', // includes /login/check-email
  '/signup',
  '/api/auth', // Auth.js handlers must stay reachable
  '/api/webhooks', // Stripe posts here with a signature, not a cookie
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
  // Skip Next internals + static assets; everything else goes through the gate.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)'],
}
