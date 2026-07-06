// POST /api/cron/print-coverage
//
// Daily cron — the Print Coverage sweep (docs/PRINT_PROVIDER_SELECTION.md §10,
// PS-8b): coverage-drop watch (auto-PAUSE + RFQ), weekly re-broadcast of stale
// OPEN requests to the next printer band, and expiry of unclaimed requests.
// Authenticated via the shared CRON_SECRET (no user session).
//
// Vercel Cron (apps/admin/vercel.json):
//   { "path": "/api/cron/print-coverage", "schedule": "0 9 * * *" }
//
// Manual test:
//   curl -X POST http://localhost:3003/api/cron/print-coverage \
//     -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { runPrintCoverageSweep } from '@/lib/print-coverage-worker'

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
    const result = await runPrintCoverageSweep()
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Print coverage sweep failed', detail: (err as Error).message },
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
