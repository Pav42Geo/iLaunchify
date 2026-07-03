'use server'

// P2 proof loop, creator side (docs/PARTNER_ROLE_ACCOUNTS.md §3.3.B, D3).
// Approve locks the round (and unblocks the printer's READY gate); reject
// requires an annotation and spawns the printer's next version. Decisions are
// immutable — one decision per round, audited, partner notified.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchToPartnerService } from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function decideProofRound({
  roundId,
  approve,
  annotation,
}: {
  roundId: string
  approve: boolean
  annotation?: string
}): Promise<Result> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { ok: false, error: 'Not a creator account.' }

  const round = await prisma.proofRound.findFirst({
    where: { id: roundId, orderDispatch: { order: { creatorUserId: user.id } } },
    select: {
      id: true,
      version: true,
      status: true,
      orderDispatch: {
        select: {
          id: true,
          orderId: true,
          partnerServiceId: true,
          order: { select: { orderNumber: true } },
        },
      },
    },
  })
  if (!round) return { ok: false, error: 'Proof not found.' }
  if (round.status !== 'PENDING') {
    return { ok: false, error: 'This proof round is already decided.' }
  }

  const note = annotation?.trim() || null
  if (!approve && !note) {
    return { ok: false, error: 'Tell the printer what to change — a note is required to reject.' }
  }
  if (note && note.length > 1000) {
    return { ok: false, error: 'Note must be 1000 characters or fewer.' }
  }

  await prisma.proofRound.update({
    where: { id: round.id },
    data: {
      status: approve ? 'APPROVED' : 'REJECTED',
      annotation: note,
      decidedById: user.id,
      decidedAt: new Date(),
    },
  })

  await logAuditAs(user, {
    entityType: 'OrderDispatch',
    entityId: round.orderDispatch.id,
    action: approve ? 'PROOF_APPROVED' : 'PROOF_REJECTED',
    payload: {
      orderId: round.orderDispatch.orderId,
      proofRoundId: round.id,
      version: round.version,
      annotation: note,
    },
  })

  {
    const orderRef =
      round.orderDispatch.order.orderNumber ?? `#${round.orderDispatch.orderId.slice(-8)}`
    // Operational → print-service members + org admins (P3 §6.3).
    await dispatchToPartnerService(round.orderDispatch.partnerServiceId, {
      // Cast until `pnpm db:generate` picks up the P2 enum additions.
      event: (approve ? 'PROOF_APPROVED' : 'PROOF_REJECTED') as NotificationEvent,
      data: {
        dispatchId: round.orderDispatch.id,
        orderRef,
        version: round.version,
        ...(note && !approve ? { annotation: note } : {}),
      },
      audience: 'partner',
    })
  }

  revalidatePath(`/orders/${round.orderDispatch.orderId}`)
  return { ok: true }
}
