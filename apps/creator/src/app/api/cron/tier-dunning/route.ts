// POST /api/cron/tier-dunning
//
// Daily: downgrade creators whose subscription grace period has elapsed unpaid
// (see processTierDunning). The webhook starts the grace period on a failed
// recurring charge; this enforces the deadline. Returns the summary either way.
//
// Also runs the Cancellation P1 pause-start sweep (processTierPauseStarts):
// creators whose PAID period has ended with a pause scheduled drop to MAKER
// until Stripe resumes billing (the webhook restores the tier then).
//
// Auth: shared CRON_SECRET in the Authorization header.
//
// Schedule (apps/creator/vercel.json) — daily 8am:
//   { "crons": [{ "path": "/api/cron/tier-dunning", "schedule": "0 8 * * *" }] }
//
// Manual test:
//   curl -X POST localhost:3000/api/cron/tier-dunning -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { processTierDunning, processTierPauseStarts } from '@ilaunchify/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await processTierDunning(new Date())
  const pauseSweep = await processTierPauseStarts()
  return NextResponse.json({
    ok: true,
    ...result,
    pauseSweep,
    ranAt: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
