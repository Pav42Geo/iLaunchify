'use server'

// Creator-opened dispute on a delivered order. Consumes OrderSettings.disputeWindowDays
// (a creator may open a dispute within N days of delivery). Opens an OrderDispute and
// flips the order to DISPUTED (FSM allows DELIVERED/COMPLETED → DISPUTED); an admin
// resolves it. V1 is record + close — refund execution rides the payments capability.
//
// OrderDispute is a pending-migration model → cast-guarded until it lands.

import { requireUser } from '@ilaunchify/auth'
import { prisma, getOrderSettings } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { assertOrderTransition } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

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

  // Window gate: N days after delivery.
  const settings = await getOrderSettings()
  if (order.deliveredAt) {
    const windowMs = settings.disputeWindowDays * 24 * 60 * 60 * 1000
    if (Date.now() - order.deliveredAt.getTime() > windowMs) {
      return {
        ok: false,
        error: `The ${settings.disputeWindowDays}-day dispute window for this order has closed — contact support.`,
      }
    }
  }

  const disputeModel = (
    prisma as unknown as {
      orderDispute: {
        findFirst: (a: unknown) => Promise<{ id: string } | null>
        create: (a: unknown) => Promise<{ id: string }>
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

  const created = await disputeModel.create({
    data: {
      orderId: order.id,
      openedById: user.id,
      category,
      description: description.trim(),
      status: 'OPEN',
    },
  })
  await prisma.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } })

  await logAuditAs(user, {
    entityType: 'OrderDispute',
    entityId: created.id,
    action: 'ORDER_DISPUTE_OPENED',
    payload: {
      orderId: order.id,
      category,
      fromStatus: order.status,
      windowDays: settings.disputeWindowDays,
    },
  })
  revalidatePath(`/orders/${order.id}`)
  revalidatePath('/orders')
  return { ok: true }
}
