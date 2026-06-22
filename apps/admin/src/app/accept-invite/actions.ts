'use server'

// Accept an admin-team invite (docs/ADMIN_RBAC.md). Runs for a SIGNED-IN user
// (any role) — NOT gated by users:admin, since the invitee isn't an admin yet.
// We never create accounts or set passwords: the invitee has already signed up
// through the normal auth providers; accepting only assigns them the role.

import { createHash } from 'node:crypto'
import { requireUser } from '@ilaunchify/auth'
import {
  prisma,
  getAdminInviteByTokenHash,
  markAdminInviteAccepted,
} from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'

type Result = { ok: true; role: string } | { ok: false; error: string }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function acceptAdminInvite(input: { token: string }): Promise<Result> {
  const user = await requireUser()
  const token = input.token?.trim()
  if (!token) return { ok: false, error: 'Missing invite token.' }

  const invite = await getAdminInviteByTokenHash(hashToken(token))
  if (!invite) return { ok: false, error: 'This invite link is invalid.' }
  if (invite.status !== 'PENDING') {
    return { ok: false, error: 'This invite has already been used or revoked.' }
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'This invite has expired. Ask for a new one.' }
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      ok: false,
      error: `This invite was sent to ${invite.email}. Sign in with that email to accept.`,
    }
  }

  // Don't convert a real creator/partner account into an admin.
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
  if (account && account.role !== 'ADMIN' && (account.creatorProfile || account.partner)) {
    return {
      ok: false,
      error: 'This account is a creator/partner account — use a separate account to join the admin team.',
    }
  }

  // ADMIN-RBAC-CAST: adminRole write until the generated client knows it.
  await (
    prisma.user as unknown as { update: (a: unknown) => Promise<unknown> }
  ).update({
    where: { id: user.id },
    data: { role: 'ADMIN', adminRole: invite.adminRole },
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
