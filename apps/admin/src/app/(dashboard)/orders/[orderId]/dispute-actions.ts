'use server'

// Admin resolution of a creator-opened OrderDispute. Closes the dispute (RESOLVED
// or REJECTED) and returns the order to COMPLETED. V1 is record + close; any refund
// rides the payments capability. OrderDispute is a pending-migration model →
// cast-guarded until it lands.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertOrderTransition } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function resolveOrderDispute({
  disputeId,
  decision,
  resolution,
}: {
  disputeId: string
  decision: 'RESOLVED' | 'REJECTED'
  resolution?: string
}): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const disputeModel = (
    prisma as unknown as {
      orderDispute: {
        findUnique: (a: unknown) => Promise<{ id: string; status: string; orderId: string } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
  ).orderDispute

  const dispute = await disputeModel.findUnique({
    where: { id: disputeId },
    select: { id: true, status: true, orderId: true },
  })
  if (!dispute) return { ok: false, error: 'Dispute not found.' }
  if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
    return { ok: false, error: `Already ${dispute.status.toLowerCase()}.` }
  }

  const order = await prisma.order.findUnique({
    where: { id: dispute.orderId },
    select: { status: true },
  })

  await prisma.$transaction(async (tx) => {
    await (
      tx as unknown as { orderDispute: { update: (a: unknown) => Promise<unknown> } }
    ).orderDispute.update({
      where: { id: dispute.id },
      data: {
        status: decision,
        resolution: resolution?.trim() || null,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    })
    // Close the dispute on the order — both decisions return it to COMPLETED.
    if (order?.status === 'DISPUTED') {
      assertOrderTransition('DISPUTED', 'COMPLETED')
      await tx.order.update({
        where: { id: dispute.orderId },
        data: { status: 'COMPLETED' },
      })
    }
  })

  await logAuditAs(admin, {
    entityType: 'OrderDispute',
    entityId: dispute.id,
    action: 'ORDER_DISPUTE_RESOLVED',
    toValue: decision,
    payload: { orderId: dispute.orderId, resolution: resolution?.trim() || null },
  })
  revalidatePath(`/orders/${dispute.orderId}`)
  revalidatePath('/orders')
  return { ok: true }
}
