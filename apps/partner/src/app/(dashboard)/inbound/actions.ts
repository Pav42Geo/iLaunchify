'use server'

// WAREHOUSE inbound receipt confirmation (Phase L1.1c —
// docs/LOGISTICS_AND_FULFILLMENT.md §3.3 "Receipt confirmation returns as
// discrepancy report → drives order FSM DELIVERED + any short/over handling").
//
// Guard: the acting user must own the WAREHOUSE service the order ships to
// (order.shipToPartnerService) — NOT the dispatch's producing service. Mirrors
// the sibling loadOwnedDispatch pattern in orders/[dispatchId]/actions.ts but
// on the receiving side of the shipment.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertDispatchTransition } from '@ilaunchify/orders'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export interface ReceivedLine {
  orderItemId: string
  receivedQty: number
}

export async function confirmInboundReceipt({
  dispatchId,
  received,
  discrepancyNote,
  damaged,
  confirmedChecklistKeys,
}: {
  dispatchId: string
  received: ReceivedLine[]
  discrepancyNote?: string
  damaged: boolean
  confirmedChecklistKeys: string[]
}): Promise<Result> {
  const user = await requireUser()

  const dispatch = await prisma.orderDispatch.findFirst({
    where: {
      id: dispatchId,
      order: {
        shipToType: 'WAREHOUSE_PARTNER',
        shipToPartnerService: { type: 'WAREHOUSE', partner: { userId: user.id } },
      },
    },
    select: {
      id: true,
      status: true,
      type: true,
      orderId: true,
      orderItemId: true,
      order: {
        select: {
          items: {
            select: {
              id: true,
              quantity: true,
              product: { select: { name: true, internalSku: true } },
            },
          },
        },
      },
    },
  })
  if (!dispatch) return { ok: false, error: 'Inbound shipment not found' }

  if (dispatch.status !== 'SHIPPED' && dispatch.status !== 'IN_TRANSIT') {
    return { ok: false, error: `Cannot confirm receipt from ${dispatch.status}` }
  }
  // Dispatch FSM guard (@ilaunchify/orders) — never an unchecked status write.
  assertDispatchTransition(dispatch.status, 'DELIVERED')

  // ---- Reconcile received vs expected (scoped to the dispatch's item when set) ----
  const expectedItems = dispatch.orderItemId
    ? dispatch.order.items.filter((i) => i.id === dispatch.orderItemId)
    : dispatch.order.items
  const expectedById = new Map(expectedItems.map((i) => [i.id, i]))

  if (received.length !== expectedItems.length) {
    return { ok: false, error: 'Received quantities must cover every expected line.' }
  }
  for (const line of received) {
    const expected = expectedById.get(line.orderItemId)
    if (!expected) return { ok: false, error: 'Received line does not match an expected item.' }
    if (!Number.isInteger(line.receivedQty) || line.receivedQty < 0) {
      return { ok: false, error: 'Received quantities must be whole numbers of 0 or more.' }
    }
  }
  const note = discrepancyNote?.trim() || null
  if (note && note.length > 1000) {
    return { ok: false, error: 'Discrepancy note must be 1000 characters or fewer.' }
  }

  const discrepancies = received
    .map((line) => {
      const expected = expectedById.get(line.orderItemId)
      if (!expected) return null
      return {
        orderItemId: line.orderItemId,
        product: expected.product.name,
        sku: expected.product.internalSku,
        expected: expected.quantity,
        received: line.receivedQty,
        delta: line.receivedQty - expected.quantity,
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null && d.delta !== 0)
  const hasDiscrepancy = discrepancies.length > 0

  const fromStatus = dispatch.status

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    })

    // Mirror markDelivered: when every dispatch has landed, advance the Order.
    const remaining = await tx.orderDispatch.count({
      where: { orderId: dispatch.orderId, status: { not: 'DELIVERED' } },
    })
    if (remaining === 0) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      })
    }
  })

  const auditPayload = {
    orderId: dispatch.orderId,
    type: dispatch.type,
    expected: expectedItems.map((i) => ({
      orderItemId: i.id,
      product: i.product.name,
      sku: i.product.internalSku,
      quantity: i.quantity,
    })),
    received: received.map((l) => ({ orderItemId: l.orderItemId, quantity: l.receivedQty })),
    discrepancyNote: note,
    damaged,
    checklist: confirmedChecklistKeys,
  }

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'INBOUND_RECEIPT_CONFIRMED',
    fromValue: fromStatus,
    toValue: 'DELIVERED',
    payload: auditPayload,
  })

  if (hasDiscrepancy || damaged) {
    // Second audit row flags the short/over/damage explicitly so the admin
    // discrepancy trail is queryable without unpacking every receipt payload.
    await logAuditAs(user, {
      entityType: 'OrderDispatch',
      entityId: dispatch.id,
      action: 'INBOUND_RECEIPT_DISCREPANCY',
      payload: {
        orderId: dispatch.orderId,
        discrepancies,
        damaged,
        discrepancyNote: note,
      },
    })

    // Tell admins (same best-effort ORDER_NEEDS_ATTENTION fan-out as the sibling
    // cancellation/dispute actions — the dispatcher never throws).
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.allSettled(
      admins.map((a) =>
        dispatchNotification({
          userId: a.id,
          event: 'ORDER_NEEDS_ATTENTION',
          data: { orderId: dispatch.orderId, status: 'INBOUND_RECEIPT_DISCREPANCY' },
          audience: 'admin',
        }),
      ),
    )
  }

  revalidatePath('/inbound')
  revalidatePath(`/inbound/${dispatchId}`)
  return { ok: true }
}
