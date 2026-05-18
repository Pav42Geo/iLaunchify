'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

async function loadOwnedDispatch(userId: string, dispatchId: string) {
  return prisma.orderDispatch.findFirst({
    where: { id: dispatchId, partnerService: { partner: { userId } } },
    include: { order: true, partnerService: { include: { partner: true } } },
  })
}

export async function acceptDispatch({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PENDING_ACCEPT') {
    return { ok: false, error: `Cannot accept from ${dispatch.status}` }
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'ACCEPTED' },
    })

    // If both dispatches for this order are now accepted, advance Order → IN_FULFILLMENT
    const remaining = await tx.orderDispatch.count({
      where: { orderId: dispatch.orderId, status: 'PENDING_ACCEPT' },
    })
    if (remaining === 0) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'IN_FULFILLMENT' },
      })
    }
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function declineDispatch({
  dispatchId,
  reason,
  notes,
}: {
  dispatchId: string
  reason: 'AT_CAPACITY' | 'CANNOT_FULFILL_SPEC' | 'PRICING_DISPUTE' | 'OTHER'
  notes?: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PENDING_ACCEPT') {
    return { ok: false, error: `Cannot decline from ${dispatch.status}` }
  }

  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: 'DECLINED',
      declinedAt: new Date(),
      declineReason: reason,
      declineNotes: notes ?? null,
    },
  })

  // V1: park the order on ON_HOLD for admin manual reroute.
  // V1.5+: enqueue a reroute job that re-runs findRouting() excluding this partner.
  await prisma.order.update({
    where: { id: dispatch.orderId },
    data: {
      status: 'ON_HOLD',
      internalNotes: `Dispatch ${dispatch.type} declined by partner: ${reason} — needs reroute`,
    },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markProducing({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'ACCEPTED') {
    return { ok: false, error: `Cannot mark producing from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'PRODUCING' },
  })
  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function markReady({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PRODUCING') {
    return { ok: false, error: `Cannot mark ready from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'READY' },
  })

  // If both dispatches READY, mark Order READY_TO_SHIP
  const remaining = await prisma.orderDispatch.count({
    where: { orderId: dispatch.orderId, status: { notIn: ['READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'] } },
  })
  if (remaining === 0) {
    await prisma.order.update({
      where: { id: dispatch.orderId },
      data: { status: 'READY_TO_SHIP' },
    })
  }

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function shipDispatch({
  dispatchId,
  trackingCarrier,
  trackingNumber,
}: {
  dispatchId: string
  trackingCarrier?: string
  trackingNumber?: string
}): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'READY') {
    return { ok: false, error: `Cannot ship from ${dispatch.status}` }
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'SHIPPED',
        shippedAt: new Date(),
        trackingCarrier: trackingCarrier || null,
        trackingNumber: trackingNumber || null,
      },
    })

    // Queue a Transfer to this partner (per docs/PAYMENTS.md decision 3:
    // manufacturer paid when product ships, print provider when label ships).
    // We create the Transfer row in PENDING; the V1.5 scheduler executes it.
    const charge = await tx.charge.findFirst({ where: { orderId: dispatch.orderId } })
    if (charge) {
      const partner = dispatch.partnerService.partner
      await tx.transfer.create({
        data: {
          chargeId: charge.id,
          destinationStripeId: '',                 // filled when scheduler executes (looks up User.stripeAccountId)
          destinationUserId: partner.userId,
          destinationType: dispatch.type === 'PRODUCT' ? 'MANUFACTURER' : 'PRINT_PROVIDER',
          amountCents: dispatch.costCents,
          reason: dispatch.type === 'PRODUCT' ? 'PRODUCT_COST' : 'LABEL_COST',
          status: 'PENDING',
          scheduledFor: new Date(),                // ready immediately
        },
      })
    }

    // If both dispatches SHIPPED, advance order
    const remaining = await tx.orderDispatch.count({
      where: { orderId: dispatch.orderId, status: { notIn: ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'] } },
    })
    if (remaining === 0) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'SHIPPED' },
      })
    }
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}
