'use server'

// Decide a partner-initiated Access request (Inbox queue).
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md (phase-2 request queue).
//
// APPROVE → writes an ALLOW override via the shared setPartnerAccessOverride
// (so the PRINT_ROTATION → excludeFromAutoRotation mirror + override audit run
// in ONE place), then stamps the request APPROVED. DENY just stamps DENIED,
// leaving the lever at its inherited/default state (no override written).
// Cast-guarded until PartnerAccessRequest lands on the generated client.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import type { PartnerAccessLever } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { setPartnerAccessOverride } from '../../partners/[partnerId]/access/actions'

type Result = { ok: true } | { ok: false; error: string }

export async function decidePartnerAccessRequest(input: {
  requestId: string
  decision: 'APPROVE' | 'DENY'
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  const { requestId, decision } = input

  const model = (
    prisma as unknown as {
      partnerAccessRequest: {
        findUnique: (a: unknown) => Promise<{
          id: string
          partnerId: string
          lever: string
          requested: string | null
          status: string
        } | null>
        update: (a: unknown) => Promise<unknown>
      }
    }
  ).partnerAccessRequest

  try {
    const req = await model.findUnique({ where: { id: requestId } })
    if (!req) return { ok: false, error: 'Request not found.' }
    if (req.status !== 'PENDING') return { ok: false, error: 'Request already decided.' }

    if (decision === 'APPROVE') {
      const r = await setPartnerAccessOverride({
        partnerId: req.partnerId,
        lever: req.lever as PartnerAccessLever,
        state: 'ALLOW',
        value: req.requested,
        reason: 'Approved from Access request queue',
      })
      if (!r.ok) return r
    }

    await model.update({
      where: { id: requestId },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'DENIED',
        decidedById: admin.id,
        decidedAt: new Date(),
      },
    })

    await logAuditAs(admin, {
      entityType: 'PartnerAccessRequest',
      entityId: requestId,
      action: decision === 'APPROVE' ? 'PARTNER_ACCESS_REQUEST_APPROVED' : 'PARTNER_ACCESS_REQUEST_DENIED',
      payload: { partnerId: req.partnerId, lever: req.lever, requested: req.requested },
    })

    revalidatePath('/settings/partner-access')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
