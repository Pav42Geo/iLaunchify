// Admin RBAC — server guard (docs/ADMIN_RBAC.md). The PURE matrix lives in
// capability-rules.ts (zero imports, unit-tested); this adds the server-only
// requireCapability guard and re-exports the rules for a single import surface.

import { redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireRole, requireUser } from './guards'
import {
  hasCapability,
  resolveCapabilities,
  type AdminRole,
  type Capability,
} from './capability-rules'

export {
  ROLE_CAPABILITIES,
  ALL_CAPABILITIES,
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  resolveCapabilities,
  hasCapability,
  type AdminRole,
  type Capability,
} from './capability-rules'

// ADMIN-RBAC-CAST: drop the cast once `prisma generate` knows `adminRole`.
async function loadAdminRole(userId: string): Promise<AdminRole | null> {
  const row = await (
    prisma as unknown as {
      user: { findUnique: (a: unknown) => Promise<{ adminRole: AdminRole | null } | null> }
    }
  ).user.findUnique({ where: { id: userId }, select: { adminRole: true } })
  return row?.adminRole ?? null
}

/**
 * Resolve the signed-in admin's capability list (for sidebar filtering / UI
 * gating). Call only inside admin surfaces — assumes the layout already ran
 * requireRole('ADMIN'). Null adminRole → SUPER_ADMIN (P0).
 */
export async function getViewerCapabilities(): Promise<Capability[]> {
  const user = await requireUser()
  return resolveCapabilities(await loadAdminRole(user.id))
}

/**
 * Server guard — the real authorization boundary. Confirms the viewer is an
 * ADMIN, loads their (always-fresh) adminRole, and redirects unless the role's
 * bundle includes `cap`. Returns the user on success.
 *
 * P0: a null adminRole resolves to SUPER_ADMIN (see capability-rules), so this
 * is a no-op for existing admins until roles are assigned.
 */
export async function requireCapability(cap: Capability) {
  const user = await requireRole('ADMIN')
  const role = await loadAdminRole(user.id)
  if (!hasCapability(role, cap)) {
    redirect('/login?error=forbidden')
  }
  // Carry the admin sub-role so logAuditAs(actor, …) auto-stamps actorAdminRole.
  return { ...user, adminRole: role }
}
