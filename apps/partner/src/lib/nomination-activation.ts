// Nomination auto-pin (D7) — BUILT DARK.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. When a nominated partner
// finishes activation for the directed leg, its nomination is promoted
// PENDING_ACTIVATION → ACTIVE. An ACTIVE nomination *is* the pin: routing reads
// ACTIVE nominations and excludes the pinned leg from auto-rotation. Gated on
// isNominationEnabled() — fully no-ops while the feature is dark, so wiring it
// into the activation path is safe before counsel clears D7.
//
// Server-only (prisma). Deactivation-on-reopen (an ACTIVE pin reverting when a
// completed step is reopened and the leg drops below live) is a deliberate
// follow-up; this first cut only promotes.

import { prisma, isNominationEnabled } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import { getPartnerActivationStatus, isPartnerServiceLive } from './activation-status'
import type { PartnerServiceType } from './activation-tracks'

/**
 * Promote a partner's PENDING_ACTIVATION nominations to ACTIVE once the nominated
 * leg is activation-complete. Call after an activation step completes. Gated dark.
 */
export async function activateReadyNominations(partnerId: string): Promise<void> {
  if (!(await isNominationEnabled())) return // gate — no-op while dark

  const pending = await prisma.partnerNomination.findMany({
    where: { nominatedPartnerId: partnerId, status: 'PENDING_ACTIVATION' },
    select: { id: true, serviceType: true },
  })
  if (pending.length === 0) return

  // A leg-specific nomination waits for that leg to go live; a leg-agnostic one
  // (serviceType null) activates once the partner has any live service.
  let anyLive: boolean | null = null

  for (const nom of pending) {
    let ready: boolean
    if (nom.serviceType) {
      ready = await isPartnerServiceLive(partnerId, nom.serviceType as PartnerServiceType)
    } else {
      if (anyLive === null) {
        const status = await getPartnerActivationStatus(partnerId)
        anyLive = status.liveServiceTypes.length > 0
      }
      ready = anyLive
    }
    if (!ready) continue

    await prisma.partnerNomination.update({
      where: { id: nom.id },
      data: { status: 'ACTIVE' },
    })
    await logSystemAudit({
      entityType: 'PartnerNomination',
      entityId: nom.id,
      action: 'NOMINATION_ACTIVATED',
      fromValue: 'PENDING_ACTIVATION',
      toValue: 'ACTIVE',
      payload: { partnerId, serviceType: nom.serviceType ?? null },
    })
  }
}
