// Table-driven tests for the admin-invite acceptance decision (docs/ADMIN_RBAC.md).
//
// Same convention as capability-rules.test.ts / ownership.test.ts: throw-based
// scenarios + a runAll() aggregator, NO vitest import, so it type-checks under
// `tsc --noEmit` and plugs into a runner later.
//
// Why this matters: this is the security gate that decides whether a signed-in
// user gets ADMIN access from an invite. The tables pin that an invite can't be
// accepted when expired, already used, sent to a different email, or by a real
// creator/partner account.

import { evaluateInviteAcceptance, type InviteAcceptanceInput } from './admin-invite'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

const NOW = new Date('2026-06-21T12:00:00Z')
const FUTURE = new Date('2026-06-28T12:00:00Z')
const PAST = new Date('2026-06-20T12:00:00Z')

function base(overrides: Partial<InviteAcceptanceInput> = {}): InviteAcceptanceInput {
  return {
    invite: { status: 'PENDING', expiresAt: FUTURE, email: 'new-admin@co.com' },
    now: NOW,
    userEmail: 'new-admin@co.com',
    userIsCustomerAccount: false,
    ...overrides,
  }
}

export const scenarioHappyPath = () => {
  const d = evaluateInviteAcceptance(base())
  assert(d.ok === true, 'valid invite + matching email + non-customer should accept')
  return true
}

export const scenarioMissingInvite = () => {
  const d = evaluateInviteAcceptance(base({ invite: null }))
  assert(!d.ok && d.reason === 'not-found', 'null invite → not-found')
  return true
}

export const scenarioNonPendingRejected = () => {
  for (const status of ['ACCEPTED', 'REVOKED', 'EXPIRED']) {
    const d = evaluateInviteAcceptance(base({ invite: { status, expiresAt: FUTURE, email: 'new-admin@co.com' } }))
    assert(!d.ok && d.reason === 'not-pending', `${status} → not-pending`)
  }
  return true
}

export const scenarioExpiredRejected = () => {
  const d = evaluateInviteAcceptance(base({ invite: { status: 'PENDING', expiresAt: PAST, email: 'new-admin@co.com' } }))
  assert(!d.ok && d.reason === 'expired', 'past expiresAt → expired')
  return true
}

export const scenarioExpiryBoundary = () => {
  // expiresAt exactly == now is NOT past → still acceptable.
  const d = evaluateInviteAcceptance(base({ invite: { status: 'PENDING', expiresAt: NOW, email: 'new-admin@co.com' } }))
  assert(d.ok === true, 'expiresAt == now should still be valid (strictly-past check)')
  return true
}

export const scenarioEmailMismatch = () => {
  const d = evaluateInviteAcceptance(base({ userEmail: 'someone-else@co.com' }))
  assert(!d.ok && d.reason === 'email-mismatch', 'different signed-in email → email-mismatch')
  return true
}

export const scenarioEmailCaseAndWhitespaceInsensitive = () => {
  const d = evaluateInviteAcceptance(
    base({
      invite: { status: 'PENDING', expiresAt: FUTURE, email: '  New-Admin@CO.com ' },
      userEmail: 'new-admin@co.com',
    }),
  )
  assert(d.ok === true, 'email match should be case- and whitespace-insensitive')
  return true
}

export const scenarioCustomerAccountRejected = () => {
  const d = evaluateInviteAcceptance(base({ userIsCustomerAccount: true }))
  assert(!d.ok && d.reason === 'is-customer-account', 'creator/partner account → is-customer-account')
  return true
}

export const scenarioCheckOrderExpiryBeforeIdentity = () => {
  // An expired invite to the WRONG email reports expiry first (status/expiry
  // precede identity checks), so we never leak that the email would've matched.
  const d = evaluateInviteAcceptance(
    base({
      invite: { status: 'PENDING', expiresAt: PAST, email: 'new-admin@co.com' },
      userEmail: 'someone-else@co.com',
    }),
  )
  assert(!d.ok && d.reason === 'expired', 'expiry is checked before email identity')
  return true
}

export function runAll(): void {
  scenarioHappyPath()
  scenarioMissingInvite()
  scenarioNonPendingRejected()
  scenarioExpiredRejected()
  scenarioExpiryBoundary()
  scenarioEmailMismatch()
  scenarioEmailCaseAndWhitespaceInsensitive()
  scenarioCustomerAccountRejected()
  scenarioCheckOrderExpiryBeforeIdentity()
}
