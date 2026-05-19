// POST /api/cron/auto-cancel-dispatches
//
// Cron-triggered route that auto-cancels OrderDispatches past their
// acceptDeadlineAt. Authenticated via shared secret (CRON_SECRET env)
// passed in the Authorization header, since cron jobs don't have a user
// session.
//
// Schedule example for Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/cron/auto-cancel-dispatches", "schedule": "* * * * *" }] }
//
// Also works manually for testing:
//   curl -X POST http://localhost:3003/api/cron/auto-cancel-dispatches \
//     -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { runAutoCancel } from '@ilaunchify/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not set on the server' },
      { status: 500 },
    )
  }

  const authHeader = req.headers.get('authorization')
  // Accept "Bearer <secret>" or Vercel's "Bearer <secret>" (Vercel Cron uses Authorization with the secret)
  const expected = `Bearer ${secret}`
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAutoCancel()
    return NextResponse.json({
      ok: true,
      ...result,
      ranAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Auto-cancel failed', detail: (err as Error).message },
      { status: 500 },
    )
  }
}

// Allow GET in dev only — handy for clicking the URL from a browser to test.
// Disabled in production to keep the auth surface clean.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
