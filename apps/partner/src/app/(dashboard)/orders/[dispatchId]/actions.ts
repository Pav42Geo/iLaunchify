'use server'

// Partner-side dispatch transition actions.
// State machine (B6):
//   PENDING_ACCEPT → ACCEPTED → PRODUCING → QUALITY_CHECK → READY → SHIPPED → IN_TRANSIT → DELIVERED
// QC can be skipped (PRODUCING → READY directly) for low-risk batches.
// FAILED_QC ends in admin reroute.
//
// All transitions write to AuditLog + update per-state timestamps.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { recomputeAggregateApprovalStatus } from '@ilaunchify/orders'
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
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedManifestVersion: dispatch.manifestVersion,
      },
    })

    // Phase H — recompute aggregate approval gate. When all dispatches
    // have flowed past PENDING_ACCEPT into ACCEPTED-or-further, the
    // helper flips Order.aggregateApprovalStatus to FULLY_ACCEPTED;
    // here we mirror that into Order.status → IN_FULFILLMENT so the
    // existing fulfillment pipeline picks it up.
    const aggregate = await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
    if (aggregate === 'FULLY_ACCEPTED') {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'IN_FULFILLMENT' },
      })
    }
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_ACCEPT',
    fromValue: 'PENDING_ACCEPT',
    toValue: 'ACCEPTED',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
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

  // Phase H — manufacturer decline = order CANCELLED (recipe owner can't
  // be rerouted, per [[ilaunchify-orchestration-thesis]]). Other partner
  // types still go to ON_HOLD for admin manual reroute until #153 lands
  // marketplace auto-rerouting.
  const isManufacturerReject = dispatch.type === 'PRODUCT'
  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: reason,
        declineNotes: notes ?? null,
      },
    })
    if (isManufacturerReject) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'CANCELLED',
          aggregateApprovalStatus: 'CANCELLED',
          internalNotes: `Manufacturer declined (${reason}): ${notes ?? ''} — order cancelled, refund needed`,
        },
      })
    } else {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: {
          status: 'ON_HOLD',
          internalNotes: `Dispatch ${dispatch.type} declined by partner: ${reason} — needs reroute`,
        },
      })
      await recomputeAggregateApprovalStatus(tx, dispatch.orderId)
    }
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_DECLINE',
    fromValue: 'PENDING_ACCEPT',
    toValue: 'DECLINED',
    payload: { orderId: dispatch.orderId, type: dispatch.type, reason, notes },
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
    data: { status: 'PRODUCING', productionStartedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_PRODUCING',
    fromValue: 'ACCEPTED',
    toValue: 'PRODUCING',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function enterQualityCheck({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'PRODUCING') {
    return { ok: false, error: `Cannot enter QC from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'QUALITY_CHECK', qualityCheckStartedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_QC_START',
    fromValue: 'PRODUCING',
    toValue: 'QUALITY_CHECK',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  return { ok: true }
}

export async function failQualityCheck({
  dispatchId,
  notes,
}: { dispatchId: string; notes: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'QUALITY_CHECK') {
    return { ok: false, error: `Cannot fail QC from ${dispatch.status}` }
  }
  if (!notes?.trim()) {
    return { ok: false, error: 'QC failure notes are required' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'FAILED_QC',
        qualityCheckFailedAt: new Date(),
        qualityCheckFailureNotes: notes.trim(),
      },
    })
    // Park the order for admin reroute, mirroring the DECLINED → ON_HOLD pattern
    await tx.order.update({
      where: { id: dispatch.orderId },
      data: {
        status: 'ON_HOLD',
        internalNotes: `${dispatch.type} dispatch failed QC: ${notes.trim().slice(0, 200)}`,
      },
    })
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_QC_FAIL',
    fromValue: 'QUALITY_CHECK',
    toValue: 'FAILED_QC',
    payload: { orderId: dispatch.orderId, type: dispatch.type, notes },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markReady({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  // Allow READY from PRODUCING (skip QC) or QUALITY_CHECK (passed QC)
  if (dispatch.status !== 'PRODUCING' && dispatch.status !== 'QUALITY_CHECK') {
    return { ok: false, error: `Cannot mark ready from ${dispatch.status}` }
  }
  const fromStatus = dispatch.status
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'READY', readyAt: new Date() },
  })

  // If both dispatches READY (or further along), mark Order READY_TO_SHIP
  const remaining = await prisma.orderDispatch.count({
    where: {
      orderId: dispatch.orderId,
      status: { notIn: ['READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'] },
    },
  })
  if (remaining === 0) {
    await prisma.order.update({
      where: { id: dispatch.orderId },
      data: { status: 'READY_TO_SHIP' },
    })
  }

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_READY',
    fromValue: fromStatus,
    toValue: 'READY',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

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

    // Queue Transfer to partner (manufacturer paid when product ships,
    // print provider when label ships).
    const charge = await tx.charge.findFirst({ where: { orderId: dispatch.orderId } })
    if (charge) {
      const partner = dispatch.partnerService.partner
      await tx.transfer.create({
        data: {
          chargeId: charge.id,
          destinationStripeId: '',
          destinationUserId: partner.userId,
          destinationType: dispatch.type === 'PRODUCT' ? 'MANUFACTURER' : 'PRINT_PROVIDER',
          amountCents: dispatch.costCents,
          reason: dispatch.type === 'PRODUCT' ? 'PRODUCT_COST' : 'LABEL_COST',
          status: 'PENDING',
          scheduledFor: new Date(),
        },
      })
    }

    const remaining = await tx.orderDispatch.count({
      where: {
        orderId: dispatch.orderId,
        status: { notIn: ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'] },
      },
    })
    if (remaining === 0) {
      await tx.order.update({
        where: { id: dispatch.orderId },
        data: { status: 'SHIPPED' },
      })
    }
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_SHIPPED',
    fromValue: 'READY',
    toValue: 'SHIPPED',
    payload: {
      orderId: dispatch.orderId,
      type: dispatch.type,
      trackingCarrier: trackingCarrier ?? null,
      trackingNumber: trackingNumber ?? null,
    },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markInTransit({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'SHIPPED') {
    return { ok: false, error: `Cannot mark in-transit from ${dispatch.status}` }
  }
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { status: 'IN_TRANSIT', inTransitAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_IN_TRANSIT',
    fromValue: 'SHIPPED',
    toValue: 'IN_TRANSIT',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}

export async function markDelivered({ dispatchId }: { dispatchId: string }): Promise<Result> {
  const user = await requireUser()
  const dispatch = await loadOwnedDispatch(user.id, dispatchId)
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'SHIPPED' && dispatch.status !== 'IN_TRANSIT') {
    return { ok: false, error: `Cannot mark delivered from ${dispatch.status}` }
  }
  const fromStatus = dispatch.status

  await prisma.$transaction(async (tx) => {
    await tx.orderDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    })

    // If both dispatches DELIVERED, advance Order → DELIVERED
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

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'DISPATCH_DELIVERED',
    fromValue: fromStatus,
    toValue: 'DELIVERED',
    payload: { orderId: dispatch.orderId, type: dispatch.type },
  })

  revalidatePath(`/orders/${dispatchId}`)
  revalidatePath('/orders')
  return { ok: true }
}
