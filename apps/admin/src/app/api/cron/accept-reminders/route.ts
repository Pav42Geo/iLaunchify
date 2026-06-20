// POST /api/cron/accept-reminders
//
// Cron-triggered: warns partners whose dispatch acceptance deadline is approaching
// (before runAutoCancel times them out). Mirrors the auto-cancel-dispatches route's
// shared-secret auth. The runner stamps + returns who to notify; this route dispatches
// the DISPATCH_ACCEPT_REMINDER notification (keeps notifications out of @ilaunchify/orders).
//
// Schedule example (vercel.json): { "path": "/api/cron/accept-reminders", "schedule": "0 * * * *" }

import { NextRequest, NextResponse } from 'next/server'
import { runAcceptReminders } from '@ilaunchify/orders'
import { dispatchNotification } from '@ilaunchify/notifications'

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
    const { scanned, reminders } = await runAcceptReminders()
    const results = await Promise.allSettled(
      reminders.map((r) =>
        dispatchNotification({
          userId: r.userId,
          event: 'DISPATCH_ACCEPT_REMINDER',
          data: { dispatchId: r.dispatchId, hoursRemaining: r.hoursRemaining },
          audience: 'partner',
        }),
      ),
    )
    const sent = results.filter((x) => x.status === 'fulfilled').length
    return NextResponse.json({ ok: true, scanned, reminded: reminders.length, sent, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Accept-reminders failed', detail: (err as Error).message },
      { status: 500 },
    )
  }
}

// Dev-only GET for browser testing (disabled in production).
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
