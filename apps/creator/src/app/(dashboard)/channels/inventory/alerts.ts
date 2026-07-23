// Stock-alert recompute + notify (CHANNEL_MANAGEMENT_SPEC §3.5a, C6.3).
//
// Called after every ledger-touching mutation (reserve at ingest, CHANNEL_SALE
// at fulfillment, RELEASE at cancel, DELIVERY_RECEIVED at intake). Recomputes
// the pure alert state for ONE creator×product, persists it on the pool, and
// notifies the creator ONCE PER TRANSITION (shouldNotify: escalations always,
// recovery to HEALTHY once, lateral moves never).
//
// Knobs come from admin OrderSettings (§3.4a philosophy: everything tunable).
// Notifications go through dispatchNotification (event: CREATOR_STOCK_ALERT), so
// the alert picks up preference/quiet-hours/email fan-out for free: see the
// template case in packages/notifications/src/templates.ts.
//
// The whole helper never throws: an alert must never break the money/inventory
// mutation it piggybacks on.

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { dispatchNotification } from '@ilaunchify/notifications'
import {
  blendedVelocity,
  reorderPoint,
  daysOfCover,
  suggestedReorderQty,
  stockAlertState,
  shouldNotify,
  type StockAlertState,
} from '@ilaunchify/channels'

// Production orders still on their way to stock. NOTE (burndown 2026-07-22):
// this list previously held DISPATCH statuses (PENDING_ACCEPT/PRODUCING/...)
// passed through an `as never[]` cast, so Prisma rejected the query at runtime.
// These are the real OrderStatus values between payment and delivery.
const IN_FLIGHT_STATUSES = ['PAID', 'ROUTING', 'IN_FULFILLMENT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT'] as const

function alertCopy(state: StockAlertState, name: string, ctx: { available: number; cover: number; leadDays: number; suggestedQty: number }): { title: string; body: string } {
  switch (state) {
    case 'STOCKOUT':
      return {
        title: `${name} is out of stock`,
        body: `Available stock hit 0: new channel sales can no longer reserve inventory. Suggested reorder: ${ctx.suggestedQty} units.`,
      }
    case 'CRITICAL':
      return {
        title: `${name} will run out before a reorder can arrive`,
        body: `${Math.floor(ctx.cover)} days of cover left vs a ${ctx.leadDays}-day lead time. Reorder now, suggested ${ctx.suggestedQty} units.`,
      }
    case 'LOW':
      return {
        title: `${name} hit its reorder point`,
        body: `${ctx.available} units available (~${Math.floor(ctx.cover)} days of cover). Suggested reorder: ${ctx.suggestedQty} units.`,
      }
    case 'HEALTHY':
    default:
      return {
        title: `${name} is back to healthy stock levels`,
        body: `${ctx.available} units available (~${Math.floor(ctx.cover)} days of cover). No action needed.`,
      }
  }
}

/** Recompute the alert state for one creator×product and notify on transition. */
export async function recomputeStockAlert(creatorUserId: string, productId: string): Promise<void> {
  try {
    const pool = await prisma.inventoryPool.findFirst({
      where: { creatorUserId, productId },
      select: { id: true, quantityOnHand: true, quantityReserved: true, alertState: true },
    })
    if (!pool) return

    const available = Math.max(0, pool.quantityOnHand - pool.quantityReserved)

    // Velocity from mapped channel-order lines, trailing 30 days (same ground
    // truth as the Stock & replenishment page).
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // ChannelVariantLink.productId is a SOFT FK (no relation on the line), so
    // resolve link ids first. NOTE (burndown 2026-07-22): the old cast-guarded
    // read filtered on a `channelVariantLink` relation that does not exist;
    // Prisma rejected it at runtime and the .catch faked an empty result, so
    // velocity here was silently ALWAYS 0.
    const linkRows = await prisma.channelVariantLink.findMany({ where: { productId }, select: { id: true } })
    const linkIds = linkRows.map((l) => l.id)
    const lines = linkIds.length
      ? await prisma.channelOrderLine.findMany({
          where: {
            channelVariantLinkId: { in: linkIds },
            channelOrder: {
              connection: { creatorUserId },
              placedAt: { gte: since30 },
              status: { notIn: ['CANCELLED'] },
            },
          },
          select: { quantity: true, channelOrder: { select: { placedAt: true } } },
        })
      : []
    let units7 = 0
    let units30 = 0
    for (const l of lines) {
      units30 += l.quantity
      if (l.channelOrder.placedAt >= since7) units7 += l.quantity
    }
    const velocity = blendedVelocity({ unitsLast7: units7, unitsLast30: units30 })

    const [product, settings, inFlight] = await Promise.all([
      prisma.product.findFirst({
        where: { id: productId, brand: { creatorProfile: { userId: creatorUserId } } },
        select: {
          name: true,
          productTemplate: { select: { leadTimeRepeatDays: true, leadTimeFirstRunDays: true } },
        },
      }),
      getOrderSettings(),
      prisma.orderItem.findMany({
        where: { productId, order: { creatorUserId, status: { in: [...IN_FLIGHT_STATUSES] } } },
        select: { quantity: true },
      }),
    ])
    if (!product) return

    const leadDays =
      (product.productTemplate?.leadTimeRepeatDays ?? product.productTemplate?.leadTimeFirstRunDays ?? 28) +
      settings.channelProcessingBufferDays
    const rop = reorderPoint({ velocityPerDay: velocity, leadDays, safetyDays: settings.channelSafetyStockDays })
    const next = stockAlertState({ available, velocityPerDay: velocity, reorderPoint: rop, leadDays })
    const prev = (pool.alertState ?? 'HEALTHY') as StockAlertState

    if (next !== prev) {
      // Persist first: if the notify write fails we'd rather miss one ping
      // than double-send on the next recompute.
      await prisma.inventoryPool.update({ where: { id: pool.id }, data: { alertState: next } })
    }

    if (!shouldNotify(prev, next)) return

    const onOrder = inFlight.reduce((a, i) => a + i.quantity, 0)
    const copy = alertCopy(next, product.name, {
      available,
      cover: daysOfCover(available, velocity),
      leadDays,
      suggestedQty: suggestedReorderQty({
        targetDaysOfCover: settings.channelTargetDaysOfCover,
        velocityPerDay: velocity,
        available,
        onOrder,
      }),
    })
    await dispatchNotification({
      userId: creatorUserId,
      event: 'CREATOR_STOCK_ALERT',
      audience: 'creator',
      data: { title: copy.title, body: copy.body, productName: product.name, alertState: next },
    })
  } catch {
    // Never let an alert failure surface into the calling mutation.
  }
}
