// POST /api/cron/merit
//
// Nightly Manufacturer Merit sweep (docs/MANUFACTURER_MERIT_ENGINE.md, MM-2):
// computes each manufacturer's standing + writes a PartnerMeritSnapshot in
// SHADOW-MODE (never changes tier/fee; logs the hysteresis recommendation).
// Authenticated via the shared CRON_SECRET.
//
// Vercel Cron (apps/admin/vercel.json): { "path": "/api/cron/merit", "schedule": "0 4 * * *" }
//
// Manual test:
//   curl -X POST http://localhost:3003/api/cron/merit -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { runMeritSnapshotSweep } from '@/lib/merit-worker'

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
    const result = await runMeritSnapshotSweep()
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ error: 'Merit sweep failed', detail: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
