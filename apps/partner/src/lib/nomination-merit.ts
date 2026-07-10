// Merit / risk force-unpin for nominations (D7) — the automated governance arm.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. When the Merit Engine drops a
// partner below threshold, or a risk gate trips, its ACTIVE nominations are
// force-unpinned (REVOKED) so the leg reroutes to normal rotation. System-audited
// (actorRole SYSTEM). FSM-guarded. Not gated on isNominationEnabled(): unpinning
// only de-escalates and must always be available.
//
// Server-only (prisma). Reuse from a merit/risk hook; returns the count unpinned.

import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import { assertNominationTransition } from '@ilaunchify/orders'

export async function meritForceUnpinNominations(
  partnerId: string,
  reason: string,
): Promise<number> {
  const active = await prisma.partnerNomination.findMany({
    where: { nominatedPartnerId: partnerId, status: 'ACTIVE' },
    select: { id: true, status: true },
  })
  if (active.length === 0) return 0

  let count = 0
  for (const nom of active) {
    assertNominationTransition(nom.status, 'REVOKED') // ACTIVE → REVOKED
    await prisma.partnerNomination.update({
      where: { id: nom.id },
      data: { status: 'REVOKED', rejectedReason: reason },
    })
    await logSystemAudit({
      entityType: 'PartnerNomination',
      entityId: nom.id,
      action: 'NOMINATION_MERIT_FORCE_UNPINNED',
      fromValue: 'ACTIVE',
      toValue: 'REVOKED',
      payload: { partnerId, reason },
    })
    count++
  }
  return count
}
