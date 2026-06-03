// POST /api/cron/cert-expiry
//
// Daily cron — sweeps certificate instances for expiry: auto-expires past-due
// certs, flags attached products for refresh (grace window, no auto-detach),
// notifies partners + admins, and sends 60/30/7-day reminders. Authenticated
// via the shared CRON_SECRET in the Authorization header (no user session).
//
// Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/cron/cert-expiry", "schedule": "0 8 * * *" }] }
//
// Manual test:
//   curl -X POST http://localhost:3003/api/cron/cert-expiry \
//     -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { runCertExpirySweep } from '@/lib/cert-expiry-worker'

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
    const result = await runCertExpirySweep()
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Cert expiry sweep failed', detail: (err as Error).message },
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
