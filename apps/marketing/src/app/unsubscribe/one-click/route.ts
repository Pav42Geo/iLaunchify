// RFC 8058 one-click unsubscribe endpoint (checklist E).
//
// Mail clients (Gmail/Yahoo bulk-sender requirement) POST here with body
// `List-Unsubscribe=One-Click` — the URL comes from the `List-Unsubscribe`
// header the dispatcher emits. No auth, no CSRF: the signed token IS the
// authorization. Must respond 2xx without redirects per spec.

import { NextResponse, type NextRequest } from 'next/server'
import { applyUnsubscribeToken } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET
  if (!token || !secret) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const result = await applyUnsubscribeToken(token, { secret })
  if (!result.ok) {
    // Expired/invalid tokens are the caller's problem; don't leak detail.
    const status = result.reason === 'persist-failed' ? 500 : 400
    return NextResponse.json({ ok: false }, { status })
  }
  return NextResponse.json({ ok: true })
}
