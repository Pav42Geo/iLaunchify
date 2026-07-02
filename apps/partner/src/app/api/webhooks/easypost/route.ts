// Phase L2a — EasyPost tracker webhook (docs/LOGISTICS_AND_FULFILLMENT.md §6.3
// webhooks/). Placement mirrors ./webhooks/stripe — the partner app owns the
// dispatch/ShipmentLeg lifecycle these events drive.
//
// Flow (idempotent, returns 200 fast):
//   raw body → HMAC verify (EASYPOST_WEBHOOK_SECRET; 401 on missing/invalid)
//   → parseTrackerEvent → ShipmentLeg lookup by trackingNumber
//   → mapTrackerStatusToLegStatus (null / regressions / repeats = no-op)
//   → leg update (+ deliveredAt) → optional dispatch echo via
//     legStatusToDispatchStatus, using the SAME guarded-transition + AuditLog
//     pattern as the partner actions (assertDispatchTransition + system audit).
//
// Dispatch advancement rule: the webhook only moves a dispatch that the
// partner ALREADY confirmed shipped (SHIPPED/IN_TRANSIT) — carrier pickup
// before the partner presses "Confirm shipment" must not bypass the doc gate
// or the payout Transfer that shipDispatch queues. Forward-only, never back.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import { assertDispatchTransition } from '@ilaunchify/orders'
import {
  verifyEasyPostSignature,
  parseTrackerEvent,
  mapTrackerStatusToLegStatus,
  legStatusToDispatchStatus,
  type LegStatusValue,
} from '@ilaunchify/shipping'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // node:crypto (HMAC), not Edge

/** Forward-only ordering for the linear tracking states. EXCEPTION/CANCELLED
    sit outside the line — they apply from any non-terminal state. */
const LEG_RANK: Partial<Record<LegStatusValue, number>> = {
  PLANNED: 0,
  QUOTE_REQUESTED: 1,
  QUOTED: 2,
  BOOKED: 3,
  PICKUP_SCHEDULED: 4,
  PICKED_UP: 5,
  IN_TRANSIT: 6,
  OUT_FOR_DELIVERY: 7,
  DELIVERED: 8,
}

const DISPATCH_RANK: Record<string, number> = {
  SHIPPED: 1,
  IN_TRANSIT: 2,
  DELIVERED: 3,
}

export async function POST(req: NextRequest) {
  const secret = process.env.EASYPOST_WEBHOOK_SECRET
  const raw = await req.text()
  const signature = req.headers.get('x-hmac-signature')
  if (!secret || !verifyEasyPostSignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'malformed body' }, { status: 400 })
  }

  const event = parseTrackerEvent(body)
  if (!event) {
    // Signed but not a tracker event (payment events etc.) — acknowledge.
    return NextResponse.json({ received: true, handled: false })
  }

  try {
    // Newest leg wins if a tracking number was ever reused across bookings.
    const leg = await prisma.shipmentLeg.findFirst({
      where: { trackingNumber: event.trackingNumber },
      orderBy: { createdAt: 'desc' },
    })
    if (!leg) {
      // Unknown tracking (BYO-entered outside the platform rail) — no-op 200
      // so EasyPost doesn't retry forever.
      return NextResponse.json({ received: true, handled: false })
    }

    const newStatus = mapTrackerStatusToLegStatus(event.status)
    if (!newStatus) {
      return NextResponse.json({ received: true, handled: false })
    }

    const currentStatus = leg.status as LegStatusValue
    // Idempotency: exact repeat of the current state = no-op.
    if (currentStatus === newStatus && leg.trackingStatus === event.status) {
      return NextResponse.json({ received: true, handled: false })
    }
    // Never regress along the linear line; never leave a terminal state.
    const currentRank = LEG_RANK[currentStatus]
    const newRank = LEG_RANK[newStatus]
    if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
      return NextResponse.json({ received: true, handled: false })
    }
    if (currentRank !== undefined && newRank !== undefined && newRank <= currentRank) {
      return NextResponse.json({ received: true, handled: false })
    }

    await prisma.shipmentLeg.update({
      where: { id: leg.id },
      data: {
        status: newStatus,
        trackingStatus: event.status, // last webhook status verbatim (schema comment)
        ...(newStatus === 'DELIVERED' && !leg.deliveredAt ? { deliveredAt: new Date() } : {}),
      },
    })

    await logSystemAudit({
      entityType: 'ShipmentLeg',
      entityId: leg.id,
      action: 'SHIPMENT_LEG_TRACKING_UPDATE',
      fromValue: currentStatus,
      toValue: newStatus,
      payload: {
        source: 'easypost_webhook',
        trackingNumber: event.trackingNumber,
        trackerStatus: event.status,
        carrier: event.carrier,
        estDeliveryDate: event.estDeliveryDate,
      },
    })

    // ---- Dispatch echo -----------------------------------------------------
    const target = legStatusToDispatchStatus(newStatus)
    if (target) {
      const dispatch = await prisma.orderDispatch.findUnique({
        where: { id: leg.orderDispatchId },
        select: { id: true, orderId: true, status: true },
      })
      const currentDispatchRank = dispatch ? DISPATCH_RANK[dispatch.status] : undefined
      const targetRank = DISPATCH_RANK[target]
      if (
        dispatch &&
        currentDispatchRank !== undefined && // only post-shipDispatch states
        targetRank !== undefined &&
        targetRank > currentDispatchRank
      ) {
        try {
          // Same guarded-transition pattern as the partner actions.
          assertDispatchTransition(
            dispatch.status as Parameters<typeof assertDispatchTransition>[0],
            target,
          )
        } catch {
          return NextResponse.json({ received: true, handled: true })
        }

        await prisma.$transaction(async (tx) => {
          await tx.orderDispatch.update({
            where: { id: dispatch.id },
            data: {
              status: target,
              ...(target === 'IN_TRANSIT' ? { inTransitAt: new Date() } : {}),
              ...(target === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
            },
          })
          // Mirror markDelivered's order-completion echo.
          if (target === 'DELIVERED') {
            const remaining = await tx.orderDispatch.count({
              where: { orderId: dispatch.orderId, status: { not: 'DELIVERED' } },
            })
            if (remaining === 0) {
              await tx.order.update({
                where: { id: dispatch.orderId },
                data: { status: 'DELIVERED', deliveredAt: new Date() },
              })
            }
          }
        })

        await logSystemAudit({
          entityType: 'OrderDispatch',
          entityId: dispatch.id,
          action: target === 'DELIVERED' ? 'DISPATCH_DELIVERED' : 'DISPATCH_IN_TRANSIT',
          fromValue: dispatch.status,
          toValue: target,
          payload: {
            source: 'easypost_webhook',
            shipmentLegId: leg.id,
            trackingNumber: event.trackingNumber,
            trackerStatus: event.status,
          },
        })
      }
    }

    return NextResponse.json({ received: true, handled: true })
  } catch (err) {
    // 500 → EasyPost retries; every step above is idempotent so a retry is safe.
    console.error('EasyPost webhook error', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
