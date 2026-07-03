'use server'

// Receiving-exception adjudication (Partner Role Accounts P0 —
// docs/PARTNER_ROLE_ACCOUNTS.md §7.4). Status ladder:
//
//   OPEN → UNDER_REVIEW → RESOLVED   (OPEN → RESOLVED allowed for trivial cases)
//
// RESOLVED requires a resolution note — that note is the platform-mediated
// outcome both the FC and (later, via order timeline) the creator see.
// Every transition writes an AuditLog row; resolution notifies the filing FC.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const ALLOWED: Record<string, string[]> = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED'],
  UNDER_REVIEW: ['RESOLVED', 'OPEN'],
  RESOLVED: [],
}

export async function updateDiscrepancyStatus({
  discrepancyId,
  toStatus,
  resolutionNote,
}: {
  discrepancyId: string
  toStatus: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'
  resolutionNote?: string
}): Promise<Result> {
  const admin = await requireCapability('orders:write')

  const row = await prisma.receivingDiscrepancy.findUnique({
    where: { id: discrepancyId },
    select: {
      id: true,
      status: true,
      orderDispatch: {
        select: {
          orderId: true,
          order: {
            select: {
              orderNumber: true,
              shipToPartnerService: { select: { partner: { select: { userId: true } } } },
            },
          },
        },
      },
    },
  })
  if (!row) return { ok: false, error: 'Discrepancy not found' }

  if (!(ALLOWED[row.status as string] ?? []).includes(toStatus)) {
    return { ok: false, error: `Cannot move a ${row.status} discrepancy to ${toStatus}` }
  }

  const note = resolutionNote?.trim() || null
  if (toStatus === 'RESOLVED' && !note) {
    return { ok: false, error: 'A resolution note is required to resolve — it is the outcome the partner sees.' }
  }
  if (note && note.length > 1000) {
    return { ok: false, error: 'Resolution note must be 1000 characters or fewer.' }
  }

  await prisma.receivingDiscrepancy.update({
    where: { id: row.id },
    data:
      toStatus === 'RESOLVED'
        ? { status: 'RESOLVED', resolutionNote: note, resolvedById: admin.id, resolvedAt: new Date() }
        : { status: toStatus },
  })

  await logAuditAs(admin, {
    entityType: 'ReceivingDiscrepancy',
    entityId: row.id,
    action: 'RECEIVING_DISCREPANCY_STATUS_CHANGE',
    fromValue: row.status as string,
    toValue: toStatus,
    payload: { orderId: row.orderDispatch.orderId, resolutionNote: note },
  })

  if (toStatus === 'RESOLVED') {
    const fcUserId = row.orderDispatch.order.shipToPartnerService?.partner.userId
    const orderRef = row.orderDispatch.order.orderNumber ?? `#${row.orderDispatch.orderId.slice(-8)}`
    if (fcUserId) {
      // Best-effort — the dispatcher never throws. Creator-facing outcome
      // surfaces on the order timeline (P1) rather than a direct notification.
      await dispatchNotification({
        userId: fcUserId,
        // Cast until `pnpm db:generate` picks up the P0 enum additions.
        event: 'RECEIVING_DISCREPANCY_RESOLVED' as NotificationEvent,
        data: { orderRef, resolutionNote: note ?? undefined, href: '/inbound?tab=history' },
        audience: 'partner',
      })
    }
  }

  revalidatePath('/logistics/receiving-exceptions')
  revalidatePath(`/logistics/receiving-exceptions/${discrepancyId}`)
  return { ok: true }
}
