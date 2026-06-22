// Admin RBAC — server resolution (docs/ADMIN_RBAC.md P5). The role→capability
// matrix is now DB-backed and super-admin-editable (RoleCapability table); the
// pure matrix in capability-rules.ts is kept only as named PRESET templates +
// the type source. Resolution rules:
//   • adminRole null  → SUPER_ADMIN (P0 fail-open for un-backfilled admins)
//   • SUPER_ADMIN     → ALL capabilities (hard-wired, never editable away)
//   • any other role  → exactly the capabilities granted to it in the DB
//     (starts EMPTY — the super admin grants them in Roles & Permissions)

import { redirect } from 'next/navigation'
import { prisma, getRoleCapabilityMatrix } from '@ilaunchify/db'
import { requireRole, requireUser } from './guards'
import { ALL_CAPABILITIES, type AdminRole, type Capability } from './capability-rules'

export {
  ROLE_CAPABILITIES, // PRESET templates only — NOT the live source (DB is). docs/ADMIN_RBAC.md
  ALL_CAPABILITIES,
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  resolveCapabilities,
  hasCapability,
  type AdminRole,
  type Capability,
} from './capability-rules'

// ADMIN-RBAC-CAST: drop once `prisma generate` knows `adminRole`.
async function loadAdminRole(userId: string): Promise<AdminRole | null> {
  const row = await (
    prisma as unknown as {
      user: { findUnique: (a: unknown) => Promise<{ adminRole: AdminRole | null } | null> }
    }
  ).user.findUnique({ where: { id: userId }, select: { adminRole: true } })
  return row?.adminRole ?? null
}

/** Live capabilities for a role, from the DB matrix. Super/null → all. */
export async function capabilitiesForRole(role: AdminRole | null): Promise<Capability[]> {
  if (role == null || role === 'SUPER_ADMIN') return [...ALL_CAPABILITIES]
  const matrix = await getRoleCapabilityMatrix()
  return (matrix[role] ?? []) as Capability[]
}

/**
 * Resolve the signed-in admin's live capability list (sidebar filtering / UI).
 * Call only inside admin surfaces — assumes the layout already ran
 * requireRole('ADMIN').
 */
export async function getViewerCapabilities(): Promise<Capability[]> {
  const user = await requireUser()
  return capabilitiesForRole(await loadAdminRole(user.id))
}

/**
 * Server guard — the real authorization boundary. Confirms ADMIN, then checks
 * the role's LIVE (DB) capability set. Returns the user augmented with adminRole
 * so logAuditAs(actor, …) auto-stamps actorAdminRole.
 */
export async function requireCapability(cap: Capability) {
  const user = await requireRole('ADMIN')
  const role = await loadAdminRole(user.id)
  const caps = await capabilitiesForRole(role)
  if (!caps.includes(cap)) {
    redirect('/login?error=forbidden')
  }
  return { ...user, adminRole: role }
}
