// POST /api/cron/stock-alerts
//
// Daily sweep: recompute the stock-alert state for EVERY inventory pool
// (CHANNEL_MANAGEMENT_SPEC §3.5a, C6.4). The mutation hooks (ingest / fulfill /
// cancel / intake) catch stock CHANGES; this catches TIME: a pool whose stock
// sits still while sales velocity keeps running drifts into LOW/CRITICAL with
// no mutation to trigger the alert. shouldNotify still gates every ping to one
// per transition, so re-running the sweep is always safe (idempotent by design).
//
// Auth: shared CRON_SECRET in the Authorization header (same as tier-dunning).
//
// Schedule (apps/creator/vercel.json), daily 7am, before the workday:
//   { "path": "/api/cron/stock-alerts", "schedule": "0 7 * * *" }
//
// Manual test:
//   curl -X POST localhost:3000/api/cron/stock-alerts -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { recomputeStockAlert } from '@/app/(dashboard)/channels/inventory/alerts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// The sweep is sequential on purpose (bounded DB pressure); allow headroom.
export const maxDuration = 300

const SWEEP_CAP = 2000 // safety valve: revisit with a cursor once pools exceed this

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pools = await prisma.inventoryPool.findMany({
    select: { creatorUserId: true, productId: true },
    take: SWEEP_CAP,
  })

  // Dedupe creator×product (multiple storage locations share one alert).
  const seen = new Set<string>()
  let swept = 0
  for (const p of pools) {
    const key = `${p.creatorUserId}:${p.productId}`
    if (seen.has(key)) continue
    seen.add(key)
    await recomputeStockAlert(p.creatorUserId, p.productId) // never throws
    swept += 1
  }

  return NextResponse.json({
    ok: true,
    pools: pools.length,
    swept,
    capped: pools.length >= SWEEP_CAP,
    ranAt: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'GET disabled in production; use POST' }, { status: 405 })
  }
  return POST(req)
}
