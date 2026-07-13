// Shared Design Workspace W0 — pure access engine (D-W1…D-W6 semantics pinned).
import { describe, it, expect } from 'vitest'
import {
  evaluateCollaboratorAccess,
  canGrantDesignerSeat,
  resolveEditLock,
  EDIT_LOCK_STALE_MS,
  EDIT_TAKEOVER_GRACE_MS,
  type CollaboratorRow,
} from './design-collaboration'

const NOW = Date.UTC(2026, 6, 13, 12, 0, 0)
const base: CollaboratorRow = {
  status: 'ACTIVE',
  role: 'EDIT',
  ndaAcceptedAt: new Date(NOW - 1000),
  tokenExpiresAt: new Date(NOW + 86_400_000),
  revokedAt: null,
}

describe('evaluateCollaboratorAccess', () => {
  it('ACTIVE + NDA + EDIT → full access', () => {
    expect(evaluateCollaboratorAccess(base, NOW)).toEqual({
      canView: true,
      canComment: true,
      canEdit: true,
      deniedReason: null,
    })
  })
  it('role ladder: COMMENT and VIEW step down', () => {
    expect(evaluateCollaboratorAccess({ ...base, role: 'COMMENT' }, NOW).canEdit).toBe(false)
    expect(evaluateCollaboratorAccess({ ...base, role: 'COMMENT' }, NOW).canComment).toBe(true)
    const view = evaluateCollaboratorAccess({ ...base, role: 'VIEW' }, NOW)
    expect(view.canView).toBe(true)
    expect(view.canComment).toBe(false)
  })
  it('D-W6: NDA gates EVERYTHING — even view', () => {
    const r = evaluateCollaboratorAccess({ ...base, ndaAcceptedAt: null }, NOW)
    expect(r.canView).toBe(false)
    expect(r.deniedReason).toBe('NDA_PENDING')
  })
  it('revoked / expired / unaccepted are dead', () => {
    expect(evaluateCollaboratorAccess({ ...base, revokedAt: new Date(NOW) }, NOW).deniedReason).toBe('REVOKED')
    expect(evaluateCollaboratorAccess({ ...base, status: 'EXPIRED' }, NOW).deniedReason).toBe('EXPIRED')
    expect(evaluateCollaboratorAccess({ ...base, status: 'INVITED' }, NOW).deniedReason).toBe('NOT_ACTIVE')
    expect(
      evaluateCollaboratorAccess(
        { ...base, status: 'INVITED', tokenExpiresAt: new Date(NOW - 1) },
        NOW,
      ).deniedReason,
    ).toBe('EXPIRED')
  })
})

describe('canGrantDesignerSeat (D-W2)', () => {
  it('caps and unlimited', () => {
    expect(canGrantDesignerSeat({ cap: 1, occupiedSeats: 0 }).ok).toBe(true)
    expect(canGrantDesignerSeat({ cap: 1, occupiedSeats: 1 }).ok).toBe(false)
    expect(canGrantDesignerSeat({ cap: null, occupiedSeats: 99 }).ok).toBe(true)
  })
})

describe('resolveEditLock (D-W4)', () => {
  const lock = (over: Partial<Parameters<typeof resolveEditLock>[0] & object> = {}) => ({
    holderUserId: 'u1',
    heartbeatAt: new Date(NOW - 5_000),
    requestedByUserId: null,
    requestedAt: null,
    ...over,
  })

  it('free, held, and stale locks', () => {
    expect(resolveEditLock(null, 'u2', NOW).action).toBe('ACQUIRE')
    expect(resolveEditLock(lock(), 'u1', NOW).action).toBe('ALREADY_HELD')
    expect(
      resolveEditLock(lock({ heartbeatAt: new Date(NOW - EDIT_LOCK_STALE_MS - 1) }), 'u2', NOW)
        .action,
    ).toBe('ACQUIRE')
  })
  it('live lock → request, then wait, then acquire after grace', () => {
    expect(resolveEditLock(lock(), 'u2', NOW).action).toBe('REQUEST')
    const waiting = resolveEditLock(
      lock({ requestedByUserId: 'u2', requestedAt: new Date(NOW - 30_000) }),
      'u2',
      NOW,
    )
    expect(waiting.action).toBe('WAIT')
    if (waiting.action === 'WAIT') expect(waiting.remainingMs).toBe(EDIT_TAKEOVER_GRACE_MS - 30_000)
    expect(
      resolveEditLock(
        lock({ requestedByUserId: 'u2', requestedAt: new Date(NOW - EDIT_TAKEOVER_GRACE_MS) }),
        'u2',
        NOW,
      ).action,
    ).toBe('ACQUIRE')
  })
})
