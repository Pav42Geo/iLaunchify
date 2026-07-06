// POST /api/cron/rate-partners
//
// The delivery+3d combined ask (docs/FEEDBACK_MODULE.md §5.1/§6.3): once an
// order has been DELIVERED for 3+ days, send the creator ONE email — rate your
// partners + review your product. A single reminder at +10 days if they still
// haven't rated anything; then stop (fatigue rules — never a third ask).
//
// Idempotent by Notification-row bookkeeping: the CREATOR_RATE_PARTNERS rows
// (payload.orderId, payload.reminder) are the sent-ledger; re-runs are safe.
//
// Auth: shared CRON_SECRET in the Authorization header (same as stock-alerts).
//
// Schedule (apps/creator/vercel.json) — daily 8am:
//   { "path": "/api/cron/rate-partners", "schedule": "0 8 * * *" }
//
// Manual test:
//   curl -X POST localhost:3000/api/cron/rate-partners -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'
import {
  RATE_PARTNERS_ASK_AFTER_DAYS,
  RATE_PARTNERS_REMIND_AFTER_DAYS,
} from '@ilaunchify/orders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const DAY = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const askBefore = new Date(now - RATE_PARTNERS_ASK_AFTER_DAYS * DAY)
  const remindBefore = new Date(now - RATE_PARTNERS_REMIND_AFTER_DAYS * DAY)
  // Bounded lookback: don't resurrect ancient orders on first deploy.
  const oldestConsidered = new Date(now - 60 * DAY)

  const orders = await prisma.order.findMany({
    where: {
      deliveredAt: { lte: askBefore, gte: oldestConsidered },
    },
    select: {
      id: true,
      creatorUserId: true,
      deliveredAt: true,
      items: { select: { product: { select: { name: true } } }, take: 1 },
      dispatches: { where: { status: 'DELIVERED' }, select: { id: true } },
    },
    orderBy: { deliveredAt: 'asc' },
    take: 500,
  })

  let asked = 0
  let reminded = 0

  for (const order of orders) {
    if (order.dispatches.length === 0) continue

    // Already fully engaged? (any rating on the order, or a review via it)
    const [ratingCount, reviewCount, sentRows] = await Promise.all([
      prisma.partnerRating.count({ where: { orderId: order.id } }),
      prisma.productReview.count({ where: { orderId: order.id } }),
      prisma.notification.findMany({
        where: {
          userId: order.creatorUserId,
          event: 'CREATOR_RATE_PARTNERS',
          payload: { path: ['orderId'], equals: order.id },
        },
        select: { payload: true },
      }),
    ])
    if (ratingCount > 0 || reviewCount > 0) continue

    const askSent = sentRows.length > 0
    const reminderSent = sentRows.some(
      (r) => (r.payload as { reminder?: boolean } | null)?.reminder === true,
    )
    const productName = order.items[0]?.product.name

    if (!askSent) {
      await dispatchNotification({
        userId: order.creatorUserId,
        event: 'CREATOR_RATE_PARTNERS',
        audience: 'creator',
        data: {
          orderId: order.id,
          productName,
          partnerCount: order.dispatches.length,
        },
      })
      asked++
    } else if (!reminderSent && order.deliveredAt && order.deliveredAt <= remindBefore) {
      await dispatchNotification({
        userId: order.creatorUserId,
        event: 'CREATOR_RATE_PARTNERS',
        audience: 'creator',
        data: {
          orderId: order.id,
          productName,
          partnerCount: order.dispatches.length,
          reminder: true,
        },
      })
      reminded++
    }
  }

  return NextResponse.json({ ok: true, considered: orders.length, asked, reminded })
}
