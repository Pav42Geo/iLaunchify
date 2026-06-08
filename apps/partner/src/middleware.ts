// Edge gate — docs/SECURITY_ARCHITECTURE.md Tier 0.1 (LOCKED 2026-06-05).
//
// Defense-in-depth ONLY: checks session-cookie PRESENCE, not validity (Auth.js
// database sessions; Prisma can't run at the edge). Real validation + role
// checks stay with requireUser()/requireRole() in pages and server actions.
//
// Self-contained on purpose: do NOT import from @ilaunchify/auth here — it
// pulls in the Prisma client, which breaks the edge runtime.

import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = [
  '/login', // includes /login/check-email
  '/signup',
  '/api/auth',
  '/api/webhooks', // Stripe posts here with a signature, not a cookie
]

const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Expose the resolved pathname to server components. Layouts read it to adapt
  // chrome (e.g. the product builder hides the dashboard sidebar). The layout
  // already falls back to this header, so setting it here makes that reliable.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', pathname)
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } })

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return pass()
  }

  const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name))
  if (hasSessionCookie) return pass()

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('callbackUrl', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)'],
}
