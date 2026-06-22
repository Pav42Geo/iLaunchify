'use server'

// Accept an admin-team invite (docs/ADMIN_RBAC.md). Runs for a SIGNED-IN user
// (any role) — NOT gated by users:admin, since the invitee isn't an admin yet.
// We never create accounts or set passwords: the invitee has already signed up
// through the normal auth providers; accepting only assigns them the role.

import { createHash } from 'node:crypto'
import { requireUser, evaluateInviteAcceptance, type InviteDenyReason } from '@ilaunchify/auth'
import {
  prisma,
  getAdminInviteByTokenHash,
  markAdminInviteAccepted,
  type AdminRole,
} from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'

type Result = { ok: true; role: string } | { ok: false; error: string }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function denyMessage(reason: InviteDenyReason, invitedEmail: string): string {
  switch (reason) {
    case 'not-found':
      return 'This invite link is invalid.'
    case 'not-pending':
      return 'This invite has already been used or revoked.'
    case 'expired':
      return 'This invite has expired. Ask for a new one.'
    case 'email-mismatch':
      return `This invite was sent to ${invitedEmail}. Sign in with that email to accept.`
    case 'is-customer-account':
      return 'This account is a creator/partner account — use a separate account to join the admin team.'
  }
}

export async function acceptAdminInvite(input: { token: string }): Promise<Result> {
  const user = await requireUser()
  const token = input.token?.trim()
  if (!token) return { ok: false, error: 'Missing invite token.' }

  const invite = await getAdminInviteByTokenHash(hashToken(token))

  // Account type matters for the decision (a creator/partner account can't be
  // converted), so load it before deciding.
  const account = await (
    prisma.user as unknown as {
      findUnique: (a: unknown) => Promise<{
        role: string
        creatorProfile: { id: string } | null
        partner: { id: string } | null
      } | null>
    }
  ).findUnique({
    where: { id: user.id },
    select: { role: true, creatorProfile: { select: { id: true } }, partner: { select: { id: true } } },
  })
  const userIsCustomerAccount =
    !!account && account.role !== 'ADMIN' && (!!account.creatorProfile || !!account.partner)

  // All the branching lives in the pure, unit-tested decision (admin-invite.ts).
  const decision = evaluateInviteAcceptance({
    invite,
    now: new Date(),
    userEmail: user.email,
    userIsCustomerAccount,
  })
  if (!decision.ok) {
    return { ok: false, error: denyMessage(decision.reason, invite?.email ?? '') }
  }
  // From here `invite` is guaranteed non-null + PENDING (the decision checked).
  if (!invite) return { ok: false, error: 'This invite link is invalid.' }

  await prisma.user.update({
    where: { id: user.id },
    // invite.adminRole is stored loosely as string; values match AdminRole.
    data: { role: 'ADMIN', adminRole: invite.adminRole as AdminRole },
  })
  await markAdminInviteAccepted(invite.id, user.id)

  await logAuditAs(
    { id: user.id, role: 'ADMIN', adminRole: invite.adminRole },
    {
      entityType: 'AdminInvite',
      entityId: invite.id,
      action: 'ADMIN_INVITE_ACCEPTED',
      toValue: invite.adminRole,
      payload: { email: invite.email },
    },
  )

  return { ok: true, role: invite.adminRole }
}
