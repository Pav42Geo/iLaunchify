'use server'

// Support refund propose → approve flow (docs/ADMIN_RBAC.md P3).
//   • Agents (refunds:propose) request a refund/goodwill credit on a ticket.
//   • Leads/Billing (refunds:approve) approve → calls the existing gated
//     executeOrderRefund (flag STRIPE_REFUNDS_ENABLED; dry-run records intent)
//     or reject. No parallel money path.
// All transitions audited. The SupportRefundRequest model is new, so prisma
// access is cast-guarded (ADMIN-RBAC-CAST) until Mac runs `prisma generate`.

import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { executeOrderRefund } from '@ilaunchify/payments'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

type RefundRequestRow = {
  id: string
  orderId: string
  ticketId: string | null
  requestedById: string
  amountCents: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

function refundModel() {
  // ADMIN-RBAC-CAST: drop once the generated client knows SupportRefundRequest.
  return prisma as unknown as {
    supportRefundRequest: {
      create: (a: unknown) => Promise<RefundRequestRow>
      findUnique: (a: unknown) => Promise<RefundRequestRow | null>
      update: (a: unknown) => Promise<RefundRequestRow>
    }
  }
}

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

  await refundModel().supportRefundRequest.create({
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

  if (input.ticketId) revalidatePath(`/support-tickets/${input.ticketId}`)
  revalidatePath('/support-tickets/refund-requests')
  return { ok: true }
}

export async function approveRefund(input: { id: string }): Promise<Result> {
  const actor = await requireCapability('refunds:approve')
  const req = await refundModel().supportRefundRequest.findUnique({ where: { id: input.id } })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'PENDING') return { ok: false, error: 'Already decided.' }

  // Run the money path FIRST — leave the request PENDING if it fails.
  const res = await executeOrderRefund({
    orderId: req.orderId,
    refundCents: req.amountCents,
    initiatedByUserId: actor.id,
  })
  if (!res.ok) return { ok: false, error: res.error }

  await refundModel().supportRefundRequest.update({
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
  const req = await refundModel().supportRefundRequest.findUnique({ where: { id: input.id } })
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'PENDING') return { ok: false, error: 'Already decided.' }

  await refundModel().supportRefundRequest.update({
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
