'use server'

// /admin/security mutations — Security & Access surface.
//
// docs/SECURITY_ARCHITECTURE.md: session revocation is the V1 "kill switch" —
// database sessions mean deleting the row signs the user out everywhere on
// their next request. Every revoke writes an AuditLog row.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function revokeSession(sessionId: string): Promise<Result> {
  const admin = await requireCapability('security:admin')

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, user: { select: { email: true, role: true } } },
  })
  if (!session) return { ok: false, error: 'Session not found (may have already expired).' }

  await prisma.session.delete({ where: { id: sessionId } })

  await logAuditAs(admin, {
    entityType: 'Session',
    entityId: sessionId,
    action: 'SESSION_REVOKE',
    payload: { targetUserId: session.userId, targetEmail: session.user.email },
  })

  revalidatePath('/security')
  return { ok: true }
}

/** Revoke EVERY active session for a user — the account-compromise response. */
export async function revokeAllSessionsForUser(userId: string): Promise<Result> {
  const admin = await requireCapability('security:admin')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  })
  if (!user) return { ok: false, error: 'User not found.' }

  const { count } = await prisma.session.deleteMany({ where: { userId } })

  await logAuditAs(admin, {
    entityType: 'User',
    entityId: userId,
    action: 'SESSION_REVOKE_ALL',
    payload: { targetEmail: user.email, revokedCount: count },
  })

  revalidatePath('/security')
  return { ok: true }
}
