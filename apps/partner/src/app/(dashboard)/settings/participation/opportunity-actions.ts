'use server'

// Partner-side Access request (phase 2 of the Partner Access console).
// A partner asks the admin to unlock a locked marketplace opportunity lever
// (print rotation, nomination, brief intake, etc.). Writes a PENDING
// PartnerAccessRequest that lands in the admin Inbox → Access requests queue,
// where approving writes an ALLOW override. docs/PARTNER_ACCESS_ADMIN_CONTROLS.
//
// Group A identity/disclosure levers are partner-controlled already (self-serve
// publish + participation mode), so only Group B opportunities are requestable.
// Cast-guarded until PartnerAccessRequest lands on the generated client.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import type { PartnerAccessLever } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { REQUESTABLE_LEVERS } from './opportunity-meta'

export type RequestResult = { ok: true } | { ok: false; error: string }

export async function requestPartnerAccess(input: {
  lever: PartnerAccessLever
  note?: string
}): Promise<RequestResult> {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'No partner account found.' }
  if (!REQUESTABLE_LEVERS.includes(input.lever)) {
    return { ok: false, error: 'That opportunity cannot be requested here.' }
  }
  const note = (input.note ?? '').trim().slice(0, 500) || null

  const model = (
    prisma as unknown as {
      partnerAccessRequest: {
        findFirst: (a: unknown) => Promise<{ id: string } | null>
        create: (a: unknown) => Promise<unknown>
      }
    }
  ).partnerAccessRequest

  try {
    const existing = await model.findFirst({
      where: { partnerId: partner.id, lever: input.lever, status: 'PENDING' },
    })
    if (existing) return { ok: false, error: 'You already have a pending request for this.' }

    await model.create({
      data: { partnerId: partner.id, lever: input.lever, note, status: 'PENDING' },
    })
    await logAuditAs(user, {
      entityType: 'PartnerAccessRequest',
      entityId: partner.id,
      action: 'PARTNER_ACCESS_REQUEST_CREATED',
      payload: { lever: input.lever, note },
    })
    revalidatePath('/settings/participation')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not submit: ${(err as Error).message}` }
  }
}
