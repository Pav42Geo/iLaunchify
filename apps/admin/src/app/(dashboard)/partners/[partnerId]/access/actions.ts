'use server'

// Per-partner Access & Opportunity override writer.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md. Admin-gated + audited.
// INHERIT clears the override (reset to the global default); ALLOW/DENY upsert it.
// Cast-guarded until PartnerAccessOverride lands on the generated client.
//
// TODO (Super-admin fence): A1 PUBLIC_PROFILE should require the Super-admin
// capability, not just platform:admin — wire once the per-lever fence is decided.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import type { AccessLeverState, PartnerAccessLever } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function setPartnerAccessOverride(input: {
  partnerId: string
  lever: PartnerAccessLever
  state: AccessLeverState
  value?: string | null
  reason?: string | null
}): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  const { partnerId, lever, state } = input
  const value = input.value ?? null
  const reason = (input.reason ?? '').trim().slice(0, 500) || null

  try {
    if (state === 'INHERIT') {
      await (
        prisma as unknown as {
          partnerAccessOverride: { deleteMany: (a: unknown) => Promise<unknown> }
        }
      ).partnerAccessOverride.deleteMany({ where: { partnerId, lever } })
    } else {
      await (
        prisma as unknown as {
          partnerAccessOverride: { upsert: (a: unknown) => Promise<unknown> }
        }
      ).partnerAccessOverride.upsert({
        where: { partnerId_lever: { partnerId, lever } },
        update: { state, value, reason, setById: admin.id },
        create: { partnerId, lever, state, value, reason, setById: admin.id },
      })
    }

    // Reconciliation (Pavel 2026-07-14): the console PRINT_ROTATION lever is the
    // single control that drives the existing PartnerService.excludeFromAutoRotation
    // flag the routing engine reads. DENY = out of the rotation pool; ALLOW/INHERIT
    // = back in. (Follow-up: retire the per-service toggle on /routing-rotation.)
    if (lever === 'PRINT_ROTATION') {
      await prisma.partnerService.updateMany({
        where: { partnerId, type: 'LABEL_PRINTING' },
        data: { excludeFromAutoRotation: state === 'DENY' },
      })
    }

    await logAuditAs(admin, {
      entityType: 'PartnerAccessOverride',
      entityId: partnerId,
      action: 'PARTNER_ACCESS_OVERRIDE_SET',
      payload: { lever, state, value, reason, rotationExcluded: lever === 'PRINT_ROTATION' ? state === 'DENY' : undefined },
    })
    revalidatePath(`/partners/${partnerId}/access`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
