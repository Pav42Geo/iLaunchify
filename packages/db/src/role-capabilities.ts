// Super-admin-editable admin RBAC matrix (docs/ADMIN_RBAC.md P5). Each row =
// "this AdminRole holds this capability". SUPER_ADMIN is NOT stored (it's all
// capabilities, computed in @ilaunchify/auth). Non-super roles start empty.
//
// Cast-guarded: the RoleCapability model lands on the generated client only
// after the migration; a missing model falls back to an empty matrix so reads
// are always safe (= no grants = least privilege).

import { prisma } from './index'

type RoleCapRow = { role: string; capability: string }

function model() {
  // ADMIN-RBAC-CAST: drop once the generated client knows RoleCapability.
  return prisma as unknown as {
    roleCapability: {
      findMany: (a?: unknown) => Promise<RoleCapRow[]>
      create: (a: unknown) => Promise<unknown>
      createMany: (a: unknown) => Promise<unknown>
      deleteMany: (a: unknown) => Promise<unknown>
    }
  }
}

/** Full matrix as { role: capability[] }. Roles with no grants are absent. */
export async function getRoleCapabilityMatrix(): Promise<Record<string, string[]>> {
  try {
    const rows = await model()
      .roleCapability.findMany({ select: { role: true, capability: true } })
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
    await model()
      .roleCapability.create({ data: { role, capability } })
      .catch(() => undefined)
  } else {
    await model().roleCapability.deleteMany({ where: { role, capability } })
  }
}

/**
 * Replace a role's entire capability set with `capabilities` (used by "apply
 * preset"). Clears existing rows for the role, then inserts the new set.
 */
export async function setRoleCapabilities(role: string, capabilities: string[]): Promise<void> {
  const unique = Array.from(new Set(capabilities))
  await model().roleCapability.deleteMany({ where: { role } })
  if (unique.length > 0) {
    await model()
      .roleCapability.createMany({
        data: unique.map((capability) => ({ role, capability })),
        skipDuplicates: true,
      })
      .catch(() => undefined)
  }
}
