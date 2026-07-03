// POST /api/cron/notification-digest
//
// Daily cron — bundles digest-tagged EMAIL notifications (dispatched with
// digest:true, P2 severity per docs/PARTNER_ROLE_ACCOUNTS.md §6.1) into one
// summary email per user. Idempotent: included rows get emailSentAt stamped.
// Mirrors the other cron routes' shared-secret auth.
//
// Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/cron/notification-digest", "schedule": "0 13 * * *" }] }
//
// Manual test:
//   curl -X POST http://localhost:3003/api/cron/notification-digest \
//     -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { runNotificationDigest } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set on the server' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runNotificationDigest()
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Notification digest failed', detail: (err as Error).message },
      { status: 500 },
    )
  }
}

// Dev-only GET for click-to-test from a browser.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
