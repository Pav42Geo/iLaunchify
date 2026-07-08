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
import { activateReadyNominations } from '@/lib/nomination-activation'

// Returns void so it can be used directly as a <form action> (React requires
// form actions to resolve to void). Failures are silent no-ops (nothing to
// revalidate); a programmatic caller can add a result-returning wrapper later.
export async function setActivationStepComplete(
  stepKey: string,
  complete: boolean,
): Promise<void> {
  const user = await requireUser()
  // Ownership: only the acting partner may change their own activation state.
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return

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

  // Auto-pin any nominations waiting on this partner's leg going live (D7).
  // Gated dark — no-ops unless nomination is enabled.
  if (complete) await activateReadyNominations(partner.id)

  revalidatePath('/activation')
}
