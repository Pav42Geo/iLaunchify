// Phase H4 — notification dispatch helpers wired into the partner-side
// workflow actions. Lazy-loads @ilaunchify/notifications so the partner app
// doesn't take a hard dep just for dispatching events.
//
// These run AFTER the transaction so a notification failure can't break
// the state transition. dispatchNotification swallows errors internally.

import { prisma } from '@ilaunchify/db'

interface DispatchContext {
  dispatchId: string
}

interface AcceptedNotice extends DispatchContext {
  wasFinalGate: boolean       // true if this acceptance flipped aggregate → FULLY_ACCEPTED
}

interface ChangesRequestedNotice extends DispatchContext {
  flaggedFieldCount: number
}

interface DeclinedOrWithdrawnNotice extends DispatchContext {
  reason?: string
  isManufacturer: boolean      // true when type=PRODUCT (special-cases the message)
}

/**
 * Look up the creator + manufacturer info for a dispatch in one query.
 * Used by every notify-* helper below.
 */
async function loadDispatchContext(dispatchId: string) {
  const dispatch = await prisma.orderDispatch.findUnique({
    where: { id: dispatchId },
    include: {
      partnerService: { include: { partner: true } },
      order: {
        include: {
          brand: true,
          items: {
            include: { product: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  })
  if (!dispatch) return null
  return {
    dispatch,
    creatorUserId: dispatch.order.creatorUserId,
    orderId: dispatch.orderId,
    productName: dispatch.order.items[0]?.product?.name,
    partnerName: dispatch.partnerService.partner.companyName,
    dispatchType: dispatch.type,
  }
}

export async function notifyDispatchAccepted({
  dispatchId,
  wasFinalGate,
}: AcceptedNotice): Promise<void> {
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    const ctx = await loadDispatchContext(dispatchId)
    if (!ctx) return
    await dispatchNotification({
      userId: ctx.creatorUserId,
      event: 'CREATOR_DISPATCH_ACCEPTED',
      audience: 'creator',
      data: {
        orderId: ctx.orderId,
        productName: ctx.productName,
        partnerName: ctx.partnerName,
        dispatchType: ctx.dispatchType,
      },
    })
    if (wasFinalGate) {
      // Final gate flipped — production starting notification.
      const partnerCount = await prisma.orderDispatch.count({
        where: { orderId: ctx.orderId },
      })
      await dispatchNotification({
        userId: ctx.creatorUserId,
        event: 'CREATOR_ORDER_FULLY_ACCEPTED',
        audience: 'creator',
        data: {
          orderId: ctx.orderId,
          productName: ctx.productName,
          partnerCount,
        },
      })
    }
  } catch {
    // Swallow — notifications are best-effort.
  }
}

export async function notifyChangesRequested({
  dispatchId,
  flaggedFieldCount,
}: ChangesRequestedNotice): Promise<void> {
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    const ctx = await loadDispatchContext(dispatchId)
    if (!ctx) return
    await dispatchNotification({
      userId: ctx.creatorUserId,
      event: 'CREATOR_DISPATCH_CHANGES_REQUESTED',
      audience: 'creator',
      data: {
        orderId: ctx.orderId,
        productName: ctx.productName,
        partnerName: ctx.partnerName,
        dispatchType: ctx.dispatchType,
        flaggedFieldCount,
      },
    })
  } catch {
    /* swallow */
  }
}

export async function notifyDeclined({
  dispatchId,
  reason,
  isManufacturer,
}: DeclinedOrWithdrawnNotice): Promise<void> {
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    const ctx = await loadDispatchContext(dispatchId)
    if (!ctx) return
    if (isManufacturer) {
      // Manufacturer decline = order cancelled. Notify creator + admins.
      await dispatchNotification({
        userId: ctx.creatorUserId,
        event: 'CREATOR_ORDER_CANCELLED_BY_MANUFACTURER',
        audience: 'creator',
        data: {
          orderId: ctx.orderId,
          productName: ctx.productName,
          partnerName: ctx.partnerName,
          reason,
        },
      })
      await notifyAdmins('ADMIN_ORDER_CANCELLED_BY_MANUFACTURER', {
        orderId: ctx.orderId,
        manufacturerName: ctx.partnerName,
        reason,
      })
    } else {
      await dispatchNotification({
        userId: ctx.creatorUserId,
        event: 'CREATOR_DISPATCH_DECLINED',
        audience: 'creator',
        data: {
          orderId: ctx.orderId,
          productName: ctx.productName,
          partnerName: ctx.partnerName,
          dispatchType: ctx.dispatchType,
          reason,
        },
      })
    }
  } catch {
    /* swallow */
  }
}

export async function notifyWithdrawn({
  dispatchId,
  reason,
  isManufacturer,
}: DeclinedOrWithdrawnNotice): Promise<void> {
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    const ctx = await loadDispatchContext(dispatchId)
    if (!ctx) return
    if (isManufacturer) {
      // Manufacturer withdrawal = order cancelled, same as decline.
      await dispatchNotification({
        userId: ctx.creatorUserId,
        event: 'CREATOR_ORDER_CANCELLED_BY_MANUFACTURER',
        audience: 'creator',
        data: {
          orderId: ctx.orderId,
          productName: ctx.productName,
          partnerName: ctx.partnerName,
          reason,
        },
      })
    } else {
      await dispatchNotification({
        userId: ctx.creatorUserId,
        event: 'CREATOR_DISPATCH_WITHDRAWN',
        audience: 'creator',
        data: {
          orderId: ctx.orderId,
          productName: ctx.productName,
          partnerName: ctx.partnerName,
          dispatchType: ctx.dispatchType,
          reason,
        },
      })
    }
    // Admins always get the withdrawal regardless of partner type — they
    // may need to step in for cost recovery / manual reroute.
    await notifyAdmins('ADMIN_DISPATCH_WITHDRAWN', {
      orderId: ctx.orderId,
      dispatchId: ctx.dispatch.id,
      partnerName: ctx.partnerName,
      dispatchType: ctx.dispatchType,
      reason,
    })
  } catch {
    /* swallow */
  }
}

/**
 * Fan out an admin-facing event to every ADMIN user. V1 keeps the list
 * small; V1.5+ adds an admin-team subscription system.
 */
async function notifyAdmins(
  event:
    | 'ADMIN_ORDER_CANCELLED_BY_MANUFACTURER'
    | 'ADMIN_DISPATCH_WITHDRAWN',
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { dispatchNotification } = await import('@ilaunchify/notifications')
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    })
    await Promise.all(
      admins.map((a) =>
        dispatchNotification({
          userId: a.id,
          event,
          audience: 'admin',
          data,
        }),
      ),
    )
  } catch {
    /* swallow */
  }
}
