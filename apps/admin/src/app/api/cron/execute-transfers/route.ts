// POST /api/cron/execute-transfers
//
// Cron-triggered route that pays partners: it picks up the PENDING `Transfer`
// rows shipDispatch queues at ship time and sends each to the partner's Stripe
// Connect account (manufacturer / print-provider payout). Authenticated via the
// shared CRON_SECRET (cron jobs have no user session).
//
// MONEY-MOVING — but inert until STRIPE_TRANSFERS_ENABLED=true. With the flag
// off this is a dry run: it reports what WOULD pay without touching Stripe or the
// DB, so it's safe to schedule before the test-mode verification pass.
//
// Schedule example for Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/cron/execute-transfers", "schedule": "*/5 * * * *" }] }
//
// Manual test:
//   curl -X POST http://localhost:3003/api/cron/execute-transfers \
//     -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { executePendingTransfers } from '@ilaunchify/payments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set on the server' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await executePendingTransfers()
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Transfer execution failed', detail: (err as Error).message },
      { status: 500 },
    )
  }
}

// Allow GET in dev only — handy for clicking the URL from a browser to test.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
