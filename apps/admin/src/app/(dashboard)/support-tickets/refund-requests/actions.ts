'use server'

// Support refund propose → approve flow (docs/ADMIN_RBAC.md P3).
//   • Agents (refunds:propose) request a refund/goodwill credit on a ticket.
//   • Leads/Billing (refunds:approve) approve → calls the existing gated
//     executeOrderRefund (flag STRIPE_REFUNDS_ENABLED; dry-run records intent)
//     or reject. No parallel money path.
// All transitions audited.

import { requireCapability, type AdminRole } from '@ilaunchify/auth'
import { prisma, getRoleCapabilityMatrix } from '@ilaunchify/db'
import { executeOrderRefund } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function proposeRefund(input: {
  orderId: string
  amountCents: number
  reason: string
  ticketId?: string
}): Promise<Result> {
  const actor = await requireCapability('refunds:propose')
  const reason = input.reason.trim()
  if (!input.orderId) return { ok: false, error: 'Missing order.' }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Enter an amount greater than zero.' }
  }
  if (input.amountCents > 1_000_000) return { ok: false, error: 'Amount looks too large.' }
  if (reason.length < 5) return { ok: false, error: 'Add a short reason (5+ characters).' }

  await prisma.supportRefundRequest.create({
    data: {
      orderId: input.orderId,
      ticketId: input.ticketId ?? null,
      requestedById: actor.id,
      amountCents: input.amountCents,
      reason,
    },
  })

  await logAuditAs(actor, {
    entityType: 'Order',
    entityId: input.orderId,
    action: 'REFUND_REQUESTED',
    toValue: String(input.amountCents),
    payload: { ticketId: input.ticketId ?? null, reason },
  })

  // Notify refund-approvers (best-effort — never blocks the request).
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, adminRole: true },
    })
    // Live DB matrix: super/null hold everything; others by their granted caps.
    const matrix = await getRoleCapabilityMatrix()
    const canApprove = (role: AdminRole | null) =>
      role == null || role === 'SUPER_ADMIN' || (matrix[role] ?? []).includes('refunds:approve')
    const approvers = admins.filter((a) => canApprove(a.adminRole))
    await Promise.all(
      approvers.map((a) =>
        dispatchNotification({
          userId: a.id,
          event: 'SUPPORT_REFUND_REQUESTED',
          data: { orderId: input.orderId, amountCents: input.amountCents, href: '/support-tickets/refund-requests' },
          audience: 'admin',
        }),
      ),
    )
  } catch {
    /* best-effort */
  }

  if (input.ticketId) revalidatePath(`/support-tickets/${input.ticketId}`)
  revalidatePath('/support-tickets/refund-requests')
  return { ok: true }
}

export async function approveRefund(input: { id: string }): Promise<Result> {
  const actor = await requireCapability('refunds:approve')
  const req = await prisma.supportRefundRequest.findUnique({ where: { id: input.id } })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'PENDING') return { ok: false, error: 'Already decided.' }

  // Run the money path FIRST — leave the request PENDING if it fails.
  const res = await executeOrderRefund({
    orderId: req.orderId,
    refundCents: req.amountCents,
    initiatedByUserId: actor.id,
  })
  if (!res.ok) return { ok: false, error: res.error }

  await prisma.supportRefundRequest.update({
    where: { id: input.id },
    data: { status: 'APPROVED', decidedById: actor.id, decidedAt: new Date() },
  })

  await logAuditAs(actor, {
    entityType: 'Order',
    entityId: req.orderId,
    action: 'REFUND_APPROVED',
    toValue: String(req.amountCents),
    payload: { requestId: req.id, executed: res.executed },
  })

  if (req.ticketId) revalidatePath(`/support-tickets/${req.ticketId}`)
  revalidatePath('/support-tickets/refund-requests')
  return { ok: true }
}

export async function rejectRefund(input: { id: string; note?: string }): Promise<Result> {
  const actor = await requireCapability('refunds:approve')
  const req = await prisma.supportRefundRequest.findUnique({ where: { id: input.id } })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'PENDING') return { ok: false, error: 'Already decided.' }

  await prisma.supportRefundRequest.update({
    where: { id: input.id },
    data: {
      status: 'REJECTED',
      decisionNote: input.note?.trim() || null,
      decidedById: actor.id,
      decidedAt: new Date(),
    },
  })

  await logAuditAs(actor, {
    entityType: 'Order',
    entityId: req.orderId,
    action: 'REFUND_REJECTED',
    toValue: String(req.amountCents),
    payload: { requestId: req.id, note: input.note ?? null },
  })

  if (req.ticketId) revalidatePath(`/support-tickets/${req.ticketId}`)
  revalidatePath('/support-tickets/refund-requests')
  return { ok: true }
}
