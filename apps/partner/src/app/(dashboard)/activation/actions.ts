'use server'

// Activation Setup — step completion persistence.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §5B. Writes PartnerActivationStep
// (one row per completed stepKey; keys match apps/partner/src/lib/activation-tracks.ts)
// and audits every change. Per-service go-live is derived from the completed set
// by the pure engine (isServiceActivationComplete).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { assertServiceTransition } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'
import { activateReadyNominations } from '@/lib/nomination-activation'
import { getPartnerActivationStatus } from '@/lib/activation-status'
import { isServiceActivationComplete, type PartnerServiceType } from '@/lib/activation-tracks'

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
    select: { id: true, status: true },
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

  // D8 per-service go-live (hybrid gate). Recompute each service's activation
  // completeness from the persisted steps, then:
  //   - maintain the `activationCompletedAt` flag (set when complete, clear when not),
  //   - if the partner is admin-approved (ACTIVE) and the service is complete but
  //     still DRAFT, flip it live (DRAFT→ACTIVE). Forward-only: a later reopen
  //     clears the flag but never yanks an already-live service (in-flight safety;
  //     deactivation is a governed admin action).
  const status = await getPartnerActivationStatus(partner.id)
  const completedKeys = new Set(status.completedKeys)
  const services = await prisma.partnerService.findMany({
    where: { partnerId: partner.id },
    select: { id: true, type: true, status: true, activationCompletedAt: true },
  })
  for (const svc of services) {
    const done = isServiceActivationComplete(svc.type as PartnerServiceType, completedKeys)
    const data: { activationCompletedAt?: Date | null; status?: 'ACTIVE' } = {}
    if (done && !svc.activationCompletedAt) data.activationCompletedAt = new Date()
    if (!done && svc.activationCompletedAt) data.activationCompletedAt = null
    const goLive = partner.status === 'ACTIVE' && done && svc.status === 'DRAFT'
    if (goLive) {
      assertServiceTransition(svc.status, 'ACTIVE')
      data.status = 'ACTIVE'
    }
    if (Object.keys(data).length === 0) continue
    await prisma.partnerService.update({ where: { id: svc.id }, data })
    if (goLive) {
      await logAuditAs(user, {
        entityType: 'PartnerService',
        entityId: svc.id,
        action: 'SERVICE_WENT_LIVE',
        fromValue: 'DRAFT',
        toValue: 'ACTIVE',
        payload: { trigger: 'activation-complete', type: svc.type },
      })
    }
  }

  // Auto-pin any nominations waiting on this partner's leg going live (D7).
  // Gated dark — no-ops unless nomination is enabled.
  if (complete) await activateReadyNominations(partner.id)

  revalidatePath('/activation')
}
