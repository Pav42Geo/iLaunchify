// POST /api/cron/sample-verdict
//
// SR-2.2 (docs/SMART_ROTATION_ENGINE.md §2.6): a delivered SAMPLE order with
// no verdict is an open decision — the chain is neither locked nor reopened.
// Ask the creator to judge it 1+ day after delivery; one reminder at +7 days
// if still unjudged; then stop (fatigue rules — never a third ask).
//
// Idempotent by Notification-row bookkeeping: CREATOR_SAMPLE_VERDICT rows
// (payload.orderId, payload.reminder) are the sent-ledger; re-runs are safe.
// Mirrors /api/cron/rate-partners.
//
// Auth: shared CRON_SECRET in the Authorization header.
//
// Schedule (apps/creator/vercel.json) — daily 8:30am:
//   { "path": "/api/cron/sample-verdict", "schedule": "30 8 * * *" }
//
// Manual test:
//   curl -X POST localhost:3000/api/cron/sample-verdict -H "Authorization: Bearer $CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const DAY = 24 * 60 * 60 * 1000
const ASK_AFTER_DAYS = 1
const REMIND_AFTER_DAYS = 7

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const askBefore = new Date(now - ASK_AFTER_DAYS * DAY)
  const remindBefore = new Date(now - REMIND_AFTER_DAYS * DAY)
  // Bounded lookback: don't resurrect ancient samples on first deploy.
  const oldestConsidered = new Date(now - 45 * DAY)

  const orders = await prisma.order.findMany({
    where: {
      orderType: 'SAMPLE',
      deliveredAt: { lte: askBefore, gte: oldestConsidered },
    },
    select: {
      id: true,
      creatorUserId: true,
      deliveredAt: true,
      printProviderServiceId: true,
      items: { select: { product: { select: { name: true } } }, take: 1 },
    },
    orderBy: { deliveredAt: 'asc' },
    take: 500,
  })

  let asked = 0
  let reminded = 0

  for (const order of orders) {
    // Already judged? The decision is closed — no nudge.
    const [verdict, sentRows] = await Promise.all([
      prisma.sampleVerdict.findUnique({
        where: { orderId: order.id },
        select: { id: true },
      }),
      prisma.notification.findMany({
        where: {
          userId: order.creatorUserId,
          event: 'CREATOR_SAMPLE_VERDICT',
          payload: { path: ['orderId'], equals: order.id },
        },
        select: { payload: true },
      }),
    ])
    if (verdict) continue

    const askSent = sentRows.length > 0
    const reminderSent = sentRows.some(
      (r) => (r.payload as { reminder?: boolean } | null)?.reminder === true,
    )
    const productName = order.items[0]?.product.name

    // Separate printer name — the copy names who's being judged.
    const printPartnerName = order.printProviderServiceId
      ? (
          await prisma.partnerService.findUnique({
            where: { id: order.printProviderServiceId },
            select: { partner: { select: { companyName: true } } },
          })
        )?.partner.companyName
      : undefined

    if (!askSent) {
      await dispatchNotification({
        userId: order.creatorUserId,
        event: 'CREATOR_SAMPLE_VERDICT',
        audience: 'creator',
        data: { orderId: order.id, productName, printPartnerName },
      })
      asked++
    } else if (!reminderSent && order.deliveredAt && order.deliveredAt <= remindBefore) {
      await dispatchNotification({
        userId: order.creatorUserId,
        event: 'CREATOR_SAMPLE_VERDICT',
        audience: 'creator',
        data: { orderId: order.id, productName, printPartnerName, reminder: true },
      })
      reminded++
    }
  }

  return NextResponse.json({ ok: true, considered: orders.length, asked, reminded })
}
