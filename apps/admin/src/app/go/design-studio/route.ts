// Admin → Design Studio (Admin Mode) bridge.
//
// The Studio lives in the CREATOR app (:3000) because CanvasLayoutShell can't be
// imported cross-app. This endpoint is the single, reliable entry point from the
// admin top bar's "Design Studio" icon: it verifies the admin's capability, then
// redirects to the creator Studio.
//
// In local dev it hops through the creator app's dev-login first (carrying the
// admin's email) so the :3000 session is ESTABLISHED automatically — no more
// "no access" when you were only signed in on :3003. In production it goes
// straight to /studio and relies on the real shared session.

import { NextResponse } from 'next/server'
import { requireCapability } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // Redirects to /login?error=… if the caller isn't an admin with catalog:write.
  const user = await requireCapability('catalog:write')

  const base = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'
  const isDev = process.env.NODE_ENV !== 'production'

  const target =
    isDev && user.email
      ? `${base}/api/dev/login?email=${encodeURIComponent(user.email)}&callbackUrl=${encodeURIComponent('/studio')}`
      : `${base}/studio`

  return NextResponse.redirect(target)
}
