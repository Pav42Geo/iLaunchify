// Super-admin-editable admin RBAC matrix (docs/ADMIN_RBAC.md P5). Each row =
// "this AdminRole holds this capability". SUPER_ADMIN is NOT stored (it's all
// capabilities, computed in @ilaunchify/auth). Non-super roles start empty.
//
// A failed read falls back to an empty matrix so reads are always safe
// (= no grants = least privilege).

import { prisma } from './index'
import type { AdminRole } from '@prisma/client'

type RoleCapRow = { role: string; capability: string }

// The `role` column is the AdminRole enum. This layer accepts plain strings
// (callers pass capability-rule role keys); valid values always come from the
// AdminRole set, so cast at the Prisma boundary.
const asRole = (role: string) => role as AdminRole

/** Full matrix as { role: capability[] }. Roles with no grants are absent. */
export async function getRoleCapabilityMatrix(): Promise<Record<string, string[]>> {
  try {
    const rows = await prisma.roleCapability
      .findMany({ select: { role: true, capability: true } })
      .catch(() => [] as RoleCapRow[])
    const out: Record<string, string[]> = {}
    for (const r of rows) (out[r.role] ??= []).push(r.capability)
    return out
  } catch {
    return {}
  }
}

/** Capabilities granted to a single role (empty if none). */
export async function getRoleCapabilities(role: string): Promise<string[]> {
  const m = await getRoleCapabilityMatrix()
  return m[role] ?? []
}

/** Grant (enabled=true) or revoke (false) one capability for one role. */
export async function setRoleCapability(
  role: string,
  capability: string,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    // Idempotent grant — ignore unique-constraint races.
    await prisma.roleCapability
      .create({ data: { role: asRole(role), capability } })
      .catch(() => undefined)
  } else {
    await prisma.roleCapability.deleteMany({ where: { role: asRole(role), capability } })
  }
}

/**
 * Replace a role's entire capability set with `capabilities` (used by "apply
 * preset"). Clears existing rows for the role, then inserts the new set.
 */
export async function setRoleCapabilities(role: string, capabilities: string[]): Promise<void> {
  const unique = Array.from(new Set(capabilities))
  await prisma.roleCapability.deleteMany({ where: { role: asRole(role) } })
  if (unique.length > 0) {
    await prisma.roleCapability
      .createMany({
        data: unique.map((capability) => ({ role: asRole(role), capability })),
        skipDuplicates: true,
      })
      .catch(() => undefined)
  }
}
