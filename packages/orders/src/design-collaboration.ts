// Shared Design Workspace — W0 PURE access engine (network-free).
// docs/SHARED_DESIGN_WORKSPACE_SPEC.md, D-W1…D-W6 LOCKED 2026-07-13.
//
// One place answers "what may this collaborator do right now?" so the W1
// Studio guard, the room-side management UI, and the invite actions can never
// drift apart. All gates are here:
//   status ACTIVE · invite/access not expired · NDA signed (D-W6 HARD gate)
//   · role ladder VIEW < COMMENT < EDIT · turn-based edit lock (D-W4).

export type CollaboratorRole = 'VIEW' | 'COMMENT' | 'EDIT'
export type CollaboratorStatus = 'INVITED' | 'ACTIVE' | 'REVOKED' | 'EXPIRED'

export interface CollaboratorRow {
  status: CollaboratorStatus
  role: CollaboratorRole
  ndaAcceptedAt: Date | string | null
  tokenExpiresAt: Date | string
  revokedAt: Date | string | null
}

export interface CollaboratorAccess {
  canView: boolean
  canComment: boolean
  canEdit: boolean
  /** Machine-readable denial reason (null when any access is granted). */
  deniedReason: 'NOT_ACTIVE' | 'NDA_PENDING' | 'REVOKED' | 'EXPIRED' | null
}

const NONE: Omit<CollaboratorAccess, 'deniedReason'> = {
  canView: false,
  canComment: false,
  canEdit: false,
}

/** Resolve a collaborator's live capabilities (D-W6: NDA gates EVERYTHING). */
export function evaluateCollaboratorAccess(
  row: CollaboratorRow,
  now = Date.now(),
): CollaboratorAccess {
  if (row.revokedAt || row.status === 'REVOKED') return { ...NONE, deniedReason: 'REVOKED' }
  if (row.status === 'EXPIRED') return { ...NONE, deniedReason: 'EXPIRED' }
  if (row.status === 'INVITED') {
    // Unaccepted invite past its window is dead (D-W5: 14 days).
    return {
      ...NONE,
      deniedReason: new Date(row.tokenExpiresAt).getTime() < now ? 'EXPIRED' : 'NOT_ACTIVE',
    }
  }
  // ACTIVE — the NDA hard gate comes before any render (D-W6).
  if (!row.ndaAcceptedAt) return { ...NONE, deniedReason: 'NDA_PENDING' }
  return {
    canView: true,
    canComment: row.role === 'COMMENT' || row.role === 'EDIT',
    canEdit: row.role === 'EDIT',
    deniedReason: null,
  }
}

/** D-W2 seat check: INVITED + ACTIVE rows count against the tier cap. */
export function canGrantDesignerSeat(input: {
  cap: number | null
  occupiedSeats: number
}): { ok: boolean; error?: string } {
  if (input.cap === null) return { ok: true }
  if (input.occupiedSeats >= input.cap) {
    return {
      ok: false,
      error: `Designer seat limit reached (${input.cap} on your plan) — revoke a seat or upgrade.`,
    }
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// D-W4 — turn-based edit lock (soft lock + takeover). One active editor per
// design; the lock is a (userId, heartbeatAt) pair persisted by W1. Stale
// locks (no heartbeat for LOCK_STALE_MS) are free to claim; a live lock can
// be requested and auto-transfers after TAKEOVER_GRACE_MS without a response.
// ─────────────────────────────────────────────────────────────────────────────

export const EDIT_LOCK_STALE_MS = 90_000
export const EDIT_TAKEOVER_GRACE_MS = 120_000

export interface EditLockState {
  holderUserId: string
  heartbeatAt: Date | string
  /** Pending takeover request, if any. */
  requestedByUserId?: string | null
  requestedAt?: Date | string | null
}

export type EditLockVerdict =
  | { action: 'ACQUIRE' } // free (no lock, stale lock, or grace elapsed)
  | { action: 'ALREADY_HELD' } // requester already holds it
  | { action: 'REQUEST' } // live lock — register a takeover request
  | { action: 'WAIT'; remainingMs: number } // takeover pending, grace running

/** Resolve what a requester may do against the current lock state. */
export function resolveEditLock(
  lock: EditLockState | null,
  requesterUserId: string,
  now = Date.now(),
): EditLockVerdict {
  if (!lock) return { action: 'ACQUIRE' }
  if (lock.holderUserId === requesterUserId) return { action: 'ALREADY_HELD' }
  const stale = now - new Date(lock.heartbeatAt).getTime() > EDIT_LOCK_STALE_MS
  if (stale) return { action: 'ACQUIRE' }
  if (lock.requestedByUserId === requesterUserId && lock.requestedAt) {
    const elapsed = now - new Date(lock.requestedAt).getTime()
    if (elapsed >= EDIT_TAKEOVER_GRACE_MS) return { action: 'ACQUIRE' }
    return { action: 'WAIT', remainingMs: EDIT_TAKEOVER_GRACE_MS - elapsed }
  }
  return { action: 'REQUEST' }
}
