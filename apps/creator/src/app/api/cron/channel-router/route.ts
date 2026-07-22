// POST /api/cron/channel-router
//
// C2.2 - the hourly READY -> production sweep (CHANNEL_MANAGEMENT_SPEC §3.3 +
// LOCKED decision #1). Routes every routable channel order platform-wide:
// READY orders (past manual-confirm) get produced + auto-billed, and ON_HOLD
// orders (daily cap reached, charge failed, enablement pending) are the
// AUTO-RECOVERY half: caps reset at UTC midnight, cards get fixed, enablements
// flip to ENABLED, and this sweep picks them back up with no creator action.
//
// Idempotent by construction: routeReadyChannelOrder claims each order with a
// sentinel, productionOrderId gates re-routing, and the Stripe idempotency key
// is (channelOrderId, productionOrderId), so overlapping runs never double-bill.
//
// Auth: shared CRON_SECRET in the Authorization header (same as stock-alerts).
//
// Schedule (apps/creator/vercel.json) - hourly:
//   { "path": "/api/cron/channel-router", "schedule": "0 * * * *" }
//
// Manual test:
//   curl -X POST localhost:3000/api/cron/channel-router -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { scanAndRouteAllCreators } from '@/app/(dashboard)/channels/orders/route-core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Sequential per order on purpose (money path; bounded DB + Stripe pressure).
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await scanAndRouteAllCreators()
  return NextResponse.json(summary)
}
