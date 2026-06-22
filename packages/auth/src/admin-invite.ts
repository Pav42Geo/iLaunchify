// Admin-team invite — PURE acceptance decision (docs/ADMIN_RBAC.md). Zero imports
// so it unit-tests table-driven (mirrors capability-rules.ts / ownership-rules.ts).
// The DB-bound server action (apps/admin .../accept-invite/actions.ts) gathers the
// inputs and maps the reason to a user-facing message; ALL the branching lives here
// so it can be tested without a database.

export type InviteDenyReason =
  | 'not-found' // no invite for this token
  | 'not-pending' // already accepted / revoked / expired-status
  | 'expired' // past expiresAt
  | 'email-mismatch' // signed-in email ≠ invited email
  | 'is-customer-account' // a creator/partner account can't be converted to admin

export type InviteAcceptanceDecision = { ok: true } | { ok: false; reason: InviteDenyReason }

export interface InviteAcceptanceInput {
  /** The invite row, or null if the token didn't resolve. */
  invite: { status: string; expiresAt: Date; email: string } | null
  /** Reference "now" (injectable for tests). */
  now: Date
  /** Email of the currently signed-in user. */
  userEmail: string
  /**
   * True when the signed-in account is a real creator/partner account that is
   * NOT already an admin — those must stay separate from the admin team. (An
   * existing admin re-accepting is fine.)
   */
  userIsCustomerAccount: boolean
}

/**
 * Decide whether a signed-in user may accept an admin invite. Order of checks is
 * deliberate: existence → status → expiry → identity → account-type. The first
 * failing check wins so the caller can show one precise message.
 */
export function evaluateInviteAcceptance(input: InviteAcceptanceInput): InviteAcceptanceDecision {
  const { invite, now, userEmail, userIsCustomerAccount } = input

  if (!invite) return { ok: false, reason: 'not-found' }
  if (invite.status !== 'PENDING') return { ok: false, reason: 'not-pending' }
  if (invite.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' }
  if (invite.email.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
    return { ok: false, reason: 'email-mismatch' }
  }
  if (userIsCustomerAccount) return { ok: false, reason: 'is-customer-account' }
  return { ok: true }
}
