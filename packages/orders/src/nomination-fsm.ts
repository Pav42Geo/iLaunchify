// Nomination lifecycle FSM (D7) — shared core.
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. Pure transition table + guard;
// DB update + AuditLog live at the call site (matches assertPartnerTransition /
// assertOrderTransition). Governs the "governed" half of D7: the platform can
// REJECT a not-yet-live nomination or REVOKE (force-unpin / reroute) an ACTIVE
// one for merit/risk/safety reasons — a nomination is always overridable.

import type { NominationStatus } from '@ilaunchify/db'

/**
 * Structurally valid nomination-status edges.
 *   PENDING_ONBOARDING — nominated partner isn't on the platform / not yet ACTIVE.
 *   PENDING_ACTIVATION — partner is ACTIVE; the directed leg isn't activation-complete.
 *   ACTIVE            — pinned + routing-eligible (auto-pin flips here on leg go-live).
 *   REJECTED          — governed reject: platform won't honor a not-yet-live pin.
 *   REVOKED           — nominator unpins, or governed force-unpin (reroute to rotation).
 * Both terminal states are dead ends — a torn-down nomination is re-created, never revived.
 */
export const NOMINATION_ALLOWED_TRANSITIONS: Partial<
  Record<NominationStatus, NominationStatus[]>
> = {
  PENDING_ONBOARDING: ['PENDING_ACTIVATION', 'ACTIVE', 'REJECTED', 'REVOKED'],
  PENDING_ACTIVATION: ['ACTIVE', 'REJECTED', 'REVOKED'],
  ACTIVE: ['REVOKED'],
  REJECTED: [],
  REVOKED: [],
}

export function isNominationTransitionAllowed(
  from: NominationStatus,
  to: NominationStatus,
): boolean {
  return NOMINATION_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid nomination-status change. Call at the top of
 * any action that flips PartnerNomination.status, then do the DB update + AuditLog.
 */
export function assertNominationTransition(
  from: NominationStatus,
  to: NominationStatus,
): void {
  if (from === to) return
  if (!isNominationTransitionAllowed(from, to)) {
    throw new Error(`Invalid PartnerNomination transition: ${from} → ${to}`)
  }
}
