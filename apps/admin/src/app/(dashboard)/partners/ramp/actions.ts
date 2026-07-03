'use server'

// D4 RAMP confirmation (docs/PARTNER_ROLE_ACCOUNTS.md §4.3, LOCKED): an admin
// reviews each of a new partner's first 3 completed dispatches. Confirmation
// is a recorded quality ritual — V1 does not hard-block further routing (that
// joins the findRouting work); the queue + audit trail are the control.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function confirmRampDispatch({
  dispatchId,
  note,
}: {
  dispatchId: string
  note?: string
}): Promise<Result> {
  const admin = await requireCapability('partners:approve')

  const dispatch = await prisma.orderDispatch.findUnique({
    where: { id: dispatchId },
    select: {
      id: true,
      status: true,
      orderId: true,
      rampConfirmedAt: true,
      partnerService: { select: { partnerId: true } },
    },
  })
  if (!dispatch) return { ok: false, error: 'Dispatch not found' }
  if (dispatch.status !== 'DELIVERED') {
    return { ok: false, error: 'Only completed (DELIVERED) dispatches get ramp confirmation.' }
  }
  if (dispatch.rampConfirmedAt) return { ok: false, error: 'Already confirmed.' }

  const cleanNote = note?.trim().slice(0, 500) || null
  await prisma.orderDispatch.update({
    where: { id: dispatch.id },
    data: { rampConfirmedAt: new Date(), rampConfirmedById: admin.id },
  })

  await logAuditAs(admin, {
    entityType: 'OrderDispatch',
    entityId: dispatch.id,
    action: 'PARTNER_RAMP_CONFIRMED',
    payload: {
      orderId: dispatch.orderId,
      partnerId: dispatch.partnerService.partnerId,
      note: cleanNote,
    },
  })

  revalidatePath('/partners/ramp')
  return { ok: true }
}
