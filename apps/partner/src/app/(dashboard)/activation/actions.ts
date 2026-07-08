'use server'

// Activation Setup — step completion persistence.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §5B. Writes PartnerActivationStep
// (one row per completed stepKey; keys match apps/partner/src/lib/activation-tracks.ts)
// and audits every change. Per-service go-live is derived from the completed set
// by the pure engine (isServiceActivationComplete).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type SetStepResult = { ok: true } | { ok: false; error: string }

export async function setActivationStepComplete(
  stepKey: string,
  complete: boolean,
): Promise<SetStepResult> {
  const user = await requireUser()
  // Ownership: only the acting partner may change their own activation state.
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return { ok: false, error: 'Partner not found' }

  if (complete) {
    await prisma.partnerActivationStep.upsert({
      where: { partnerId_stepKey: { partnerId: partner.id, stepKey } },
      create: { partnerId: partner.id, stepKey, completedById: user.id },
      update: { completedAt: new Date(), completedById: user.id },
    })
  } else {
    await prisma.partnerActivationStep.deleteMany({
      where: { partnerId: partner.id, stepKey },
    })
  }

  await logAuditAs(user, {
    entityType: 'PartnerActivationStep',
    entityId: partner.id,
    action: complete ? 'ACTIVATION_STEP_COMPLETED' : 'ACTIVATION_STEP_REOPENED',
    toValue: stepKey,
    payload: { stepKey, complete },
  })

  revalidatePath('/activation')
  return { ok: true }
}
