'use server'

// Creator-initiated order cancellation. Consumes OrderSettings.creatorCancelWindowHours
// + autoApproveCreatorCancelBeforeRouting (+ the cancellation-fee policy via
// computeCancellationOutcome).
//
// Two outcomes:
//   - CANCELLED — an UNPAID order, within the self-cancel window, with auto-approve
//     enabled, is cancelled outright. No money moved; FSM-safe (PENDING_PAYMENT →
//     CANCELLED).
//   - PENDING_REVIEW — anything paid, past-window, or with auto-approve off becomes a
//     CancellationRequest for admin review (the admin flow computes + will execute the
//     refund). A PAID order is never auto-cancelled here because that requires a Stripe
//     refund, which the payments package doesn't expose yet.

import { requireUser } from '@ilaunchify/auth'
import { prisma, getOrderSettings } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import {
  computeCancellationOutcome,
  canCreatorSelfCancel,
  type CreatorCancelBlockReason,
} from '@ilaunchify/orders'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

export type CancelResult =
  | { ok: true; outcome: 'CANCELLED' | 'PENDING_REVIEW' }
  | { ok: false; error: string }

// Pre-routing states — an order here hasn't been handed to partners for production.
const PRE_ROUTING = new Set(['PENDING_PAYMENT', 'PAID', 'ROUTING'])

// Creator-facing message per block reason (the eligibility rule itself lives in the
// shared canCreatorSelfCancel helper so the action + the button can't disagree).
const BLOCK_MESSAGE: Record<CreatorCancelBlockReason, string> = {
  TERMINAL: 'This order is already closed and can’t be cancelled.',
  IN_PRODUCTION: 'This order is already in production or shipping and can’t be self-cancelled — contact support.',
  PARTNER_COMMITTED:
    'A partner has already accepted this order and begun production — contact support to cancel.',
}

export async function requestOrderCancellation({
  orderId,
  reason,
}: {
  orderId: string
  reason?: string
}): Promise<CancelResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Not a creator account.' }

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      totalCents: true,
      aggregateApprovalStatus: true,
    },
  })
  if (!order) return { ok: false, error: 'Order not found.' }
  const eligibility = canCreatorSelfCancel(order)
  if (!eligibility.allowed && eligibility.reason) {
    return { ok: false, error: BLOCK_MESSAGE[eligibility.reason] }
  }

  // Don't stack requests on the same order.
  const existing = await prisma.cancellationRequest.findFirst({
    where: { orderId: order.id, status: 'PENDING_REVIEW' },
    select: { id: true },
  })
  if (existing) return { ok: true, outcome: 'PENDING_REVIEW' }

  const settings = await getOrderSettings()
  const windowMs = settings.creatorCancelWindowHours * 60 * 60 * 1000
  const withinWindow = Date.now() - order.createdAt.getTime() <= windowMs
  const preRouting = PRE_ROUTING.has(order.status)

  // Fast path: unpaid + within window + auto-approve enabled → cancel outright.
  if (
    order.status === 'PENDING_PAYMENT' &&
    settings.autoApproveCreatorCancelBeforeRouting &&
    preRouting &&
    withinWindow
  ) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
    await logAuditAs(user, {
      entityType: 'Order',
      entityId: order.id,
      action: 'ORDER_CREATOR_CANCELLED',
      fromValue: order.status,
      toValue: 'CANCELLED',
      payload: {
        self: true,
        autoApproved: true,
        windowHours: settings.creatorCancelWindowHours,
        reason: reason?.trim() || null,
      },
    })
    revalidatePath(`/orders/${order.id}`)
    revalidatePath('/orders')
    return { ok: true, outcome: 'CANCELLED' }
  }

  // Otherwise → admin review. Capture the refund breakdown under the live policy so
  // the outcome is reproducible at request time.
  const outcome = computeCancellationOutcome(order.totalCents, {
    cancellationFeeBps: settings.cancellationFeeBps,
    refundProcessingFeeBps: settings.refundProcessingFeeBps,
  })
  const created = await prisma.cancellationRequest.create({
    data: {
      orderId: order.id,
      dispatchId: null, // whole-order cancel
      requestedById: user.id,
      reason: reason?.trim() || 'Creator-requested cancellation',
      status: 'PENDING_REVIEW',
    },
    select: { id: true },
  })
  await logAuditAs(user, {
    entityType: 'CancellationRequest',
    entityId: created.id,
    action: 'CANCELLATION_REQUESTED',
    payload: {
      orderId: order.id,
      self: true,
      orderStatus: order.status,
      withinWindow,
      windowHours: settings.creatorCancelWindowHours,
      refundEstimate: {
        basisCents: outcome.basisCents,
        cancellationFeeCents: outcome.cancellationFeeCents,
        processingFeeCents: outcome.processingFeeCents,
        refundCents: outcome.refundCents,
        feesExceededBasis: outcome.feesExceededBasis,
      },
    },
  })

  // Tell admins a cancellation needs review (reuses the existing ORDER_NEEDS_ATTENTION
  // event). Best-effort — the dispatcher never throws.
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  await Promise.allSettled(
    admins.map((a) =>
      dispatchNotification({
        userId: a.id,
        event: 'ORDER_NEEDS_ATTENTION',
        data: { orderId: order.id, status: 'CANCELLATION_REQUESTED' },
        audience: 'admin',
      }),
    ),
  )

  revalidatePath(`/orders/${order.id}`)
  revalidatePath('/orders')
  return { ok: true, outcome: 'PENDING_REVIEW' }
}
