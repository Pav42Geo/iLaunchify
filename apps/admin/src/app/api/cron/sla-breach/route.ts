// POST /api/cron/sla-breach
//
// Cron-triggered (W2-SUP5): flags open support tickets whose first-response SLA
// window has elapsed. runSlaBreachScan (@ilaunchify/support) does the work —
// stamps Ticket.slaBreachedAt, logs a SLA_BREACHED event, and fires the
// SUPPORT_SLA_BREACHED notification to the owner (assignee → category default →
// all admins). Idempotent: already-flagged or already-answered tickets are
// skipped, so re-running is safe. Mirrors the accept-reminders route's shared-
// secret auth.
//
// Schedule (vercel.json): { "path": "/api/cron/sla-breach", "schedule": "*/10 * * * *" }

import { NextRequest, NextResponse } from 'next/server'
import { runSlaBreachScan } from '@ilaunchify/support'

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
    const { scanned, breached } = await runSlaBreachScan()
    return NextResponse.json({
      ok: true,
      scanned,
      breached: breached.length,
      ranAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'SLA-breach scan failed', detail: (err as Error).message },
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
