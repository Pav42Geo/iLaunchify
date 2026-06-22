'use server'

// Admin team management (docs/ADMIN_RBAC.md P4). SUPER_ADMIN-only: assign an
// admin's RBAC role. Every change is audited. You cannot change your OWN role
// (prevents self-lockout — ask another super admin).

import { requireCapability, ADMIN_ROLES, type AdminRole } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function setAdminRole(input: { userId: string; role: AdminRole }): Promise<Result> {
  const actor = await requireCapability('users:admin')

  if (!ADMIN_ROLES.includes(input.role)) return { ok: false, error: 'Unknown role.' }
  if (input.userId === actor.id) {
    return { ok: false, error: 'Ask another super admin to change your own role.' }
  }

  // ADMIN-RBAC-CAST: generated client doesn't know `adminRole` until Mac generate.
  const userModel = prisma.user as unknown as {
    findUnique: (a: unknown) => Promise<{ id: string; role: string; adminRole: AdminRole | null } | null>
    update: (a: unknown) => Promise<unknown>
  }

  const target = await userModel.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, adminRole: true },
  })
  if (!target || target.role !== 'ADMIN') return { ok: false, error: 'Not an admin user.' }
  if (target.adminRole === input.role) return { ok: true }

  await userModel.update({ where: { id: input.userId }, data: { adminRole: input.role } })

  await logAuditAs(actor, {
    entityType: 'User',
    entityId: input.userId,
    action: 'ADMIN_ROLE_CHANGED',
    fromValue: target.adminRole ?? 'SUPER_ADMIN (default)',
    toValue: input.role,
  })

  revalidatePath('/admins')
  return { ok: true }
}
