'use server'

// Creator-opened dispute on a delivered order. Consumes OrderSettings.disputeWindowDays
// (a creator may open a dispute within N days of delivery). Opens an OrderDispute and
// flips the order to DISPUTED (FSM allows DELIVERED/COMPLETED → DISPUTED); an admin
// resolves it. V1 is record + close — refund execution rides the payments capability.
//
// OrderDispute is a pending-migration model → cast-guarded until it lands.

import { requireUser } from '@ilaunchify/auth'
import { prisma, getOrderSettings } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { assertOrderTransition } from '@ilaunchify/orders'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

/** Fan an "order needs attention" notification out to every admin. Best-effort —
 *  the dispatcher never throws, and we don't let a notify failure break the action. */
async function notifyAdminsOrderNeedsAttention(orderId: string, status: string): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await Promise.allSettled(
    admins.map((a) =>
      dispatchNotification({
        userId: a.id,
        event: 'ORDER_NEEDS_ATTENTION',
        data: { orderId, status },
        audience: 'admin',
      }),
    ),
  )
}

export type DisputeCategory =
  | 'DAMAGED'
  | 'NOT_AS_DESCRIBED'
  | 'NOT_DELIVERED'
  | 'QUALITY'
  | 'OTHER'

export type OpenDisputeResult = { ok: true } | { ok: false; error: string }

const DISPUTABLE_STATUSES = new Set(['DELIVERED', 'COMPLETED'])
const VALID_CATEGORIES = new Set<DisputeCategory>([
  'DAMAGED',
  'NOT_AS_DESCRIBED',
  'NOT_DELIVERED',
  'QUALITY',
  'OTHER',
])

export async function openOrderDispute({
  orderId,
  category,
  description,
}: {
  orderId: string
  category: DisputeCategory
  description: string
}): Promise<OpenDisputeResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Not a creator account.' }
  if (!VALID_CATEGORIES.has(category)) return { ok: false, error: 'Pick a dispute reason.' }
  if (!description.trim()) return { ok: false, error: 'Add a short description of the issue.' }

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    select: { id: true, status: true, deliveredAt: true },
  })
  if (!order) return { ok: false, error: 'Order not found.' }
  if (!DISPUTABLE_STATUSES.has(order.status)) {
    return { ok: false, error: 'You can only dispute an order after it’s delivered.' }
  }

  // Window gate: N days after delivery. A delivered/completed order with no recorded
  // delivery date is a data inconsistency — reject rather than allow an unbounded
  // window.
  const settings = await getOrderSettings()
  if (!order.deliveredAt) {
    return {
      ok: false,
      error: 'This order has no recorded delivery date — contact support to dispute it.',
    }
  }
  const windowMs = settings.disputeWindowDays * 24 * 60 * 60 * 1000
  if (Date.now() - order.deliveredAt.getTime() > windowMs) {
    return {
      ok: false,
      error: `The ${settings.disputeWindowDays}-day dispute window for this order has closed — contact support.`,
    }
  }

  const disputeModel = (
    prisma as unknown as {
      orderDispute: {
        findFirst: (a: unknown) => Promise<{ id: string } | null>
      }
    }
  ).orderDispute

  // Don't stack open disputes on one order.
  const existing = await disputeModel.findFirst({
    where: { orderId: order.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    select: { id: true },
  })
  if (existing) return { ok: true }

  // FSM-safe DELIVERED/COMPLETED → DISPUTED (throws if the FSM ever disallows it).
  assertOrderTransition(order.status as never, 'DISPUTED')

  // Create the dispute and flip the order atomically — otherwise a failure between
  // the two leaves a dispute with no DISPUTED order (or vice-versa). Pre-migration
  // the whole transaction throws (feature simply unavailable until the table exists).
  let createdId = ''
  await prisma.$transaction(async (tx) => {
    const created = await (
      tx as unknown as {
        orderDispute: { create: (a: unknown) => Promise<{ id: string }> }
      }
    ).orderDispute.create({
      data: {
        orderId: order.id,
        openedById: user.id,
        category,
        description: description.trim(),
        status: 'OPEN',
      },
    })
    createdId = created.id
    await tx.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } })
  })

  await logAuditAs(user, {
    entityType: 'OrderDispute',
    entityId: createdId,
    action: 'ORDER_DISPUTE_OPENED',
    payload: {
      orderId: order.id,
      category,
      fromStatus: order.status,
      windowDays: settings.disputeWindowDays,
    },
  })
  await notifyAdminsOrderNeedsAttention(order.id, 'DISPUTED')
  await notifyOrderPartnersDisputed(order.id)
  revalidatePath(`/orders/${order.id}`)
  revalidatePath('/orders')
  return { ok: true }
}

/** Notify every partner assigned to the order so they can add their side.
 *  Best-effort. PARTNER_ORDER_DISPUTED is cast until the enum value is generated. */
async function notifyOrderPartnersDisputed(orderId: string): Promise<void> {
  const dispatches = await prisma.orderDispatch.findMany({
    where: { orderId },
    select: { partnerService: { select: { partner: { select: { userId: true } } } } },
  })
  const partnerUserIds = [
    ...new Set(dispatches.map((d) => d.partnerService.partner.userId)),
  ]
  await Promise.allSettled(
    partnerUserIds.map((userId) =>
      dispatchNotification({
        userId,
        event: 'PARTNER_ORDER_DISPUTED' as unknown as NotificationEvent,
        data: { orderId },
        audience: 'partner',
      }),
    ),
  )
}
