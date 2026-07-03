// POST /api/cron/partner-ops
//
// Daily cron — Partner Role Accounts P0 ops sweep (docs/PARTNER_ROLE_ACCOUNTS.md
// §6.2 + §6.4): partner document expiry reminders (60/30/7 + lapsed),
// DISPATCH_SLA_AT_RISK warnings at ~50% of the accept window, and
// INBOUND_DELIVERED_UNCONFIRMED receiving-SLA nudges to Fulfillment Centers.
// Authenticated via the shared CRON_SECRET (no user session) — mirrors
// /api/cron/cert-expiry.
//
// Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/cron/partner-ops", "schedule": "0 9 * * *" }] }
//
// Manual test:
//   curl -X POST http://localhost:3003/api/cron/partner-ops \
//     -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { runPartnerOpsSweep } from '@/lib/partner-ops-worker'

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
    const result = await runPartnerOpsSweep()
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: 'Partner ops sweep failed', detail: (err as Error).message },
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
