// Admin RBAC — server resolution (docs/ADMIN_RBAC.md P5). The role→capability
// matrix is now DB-backed and super-admin-editable (RoleCapability table); the
// pure matrix in capability-rules.ts is kept only as named PRESET templates +
// the type source. Resolution rules:
//   • SUPER_ADMIN     → ALL capabilities (hard-wired, never editable away)
//   • any other role  → exactly the capabilities granted to it in the DB
//     (starts EMPTY — the super admin grants them in Roles & Permissions)
//   • adminRole null  → NO capabilities (least privilege). P4.1 flip 2026-06-21:
//     the P0 fail-open (null → SUPER_ADMIN) was retired once the Mac backfill
//     set every legacy admin to SUPER_ADMIN explicitly. A null role now means a
//     freshly-created admin not yet assigned a role — they get nothing until a
//     super admin assigns one. REQUIRES the backfill to have run.

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

async function loadAdminRole(userId: string): Promise<AdminRole | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { adminRole: true },
  })
  return (row?.adminRole as AdminRole | null) ?? null
}

/** Live capabilities for a role, from the DB matrix. Super → all; null → none. */
export async function capabilitiesForRole(role: AdminRole | null): Promise<Capability[]> {
  if (role === 'SUPER_ADMIN') return [...ALL_CAPABILITIES]
  if (role == null) return [] // least privilege — un-roled admin gets nothing
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
