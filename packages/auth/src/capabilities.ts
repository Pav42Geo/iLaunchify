// Admin RBAC — server guard (docs/ADMIN_RBAC.md). The PURE matrix lives in
// capability-rules.ts (zero imports, unit-tested); this adds the server-only
// requireCapability guard and re-exports the rules for a single import surface.

import { redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireRole } from './guards'
import { hasCapability, type AdminRole, type Capability } from './capability-rules'

export {
  ROLE_CAPABILITIES,
  ALL_CAPABILITIES,
  resolveCapabilities,
  hasCapability,
  type AdminRole,
  type Capability,
} from './capability-rules'

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
  // ADMIN-RBAC-CAST: the generated client doesn't know `adminRole` until Mac
  // runs `prisma generate` post-`db push`. Drop the cast then (plain
  // prisma.user.findUnique({ where:{id}, select:{ adminRole:true } })).
  const row = (await (
    prisma as unknown as {
      user: { findUnique: (a: unknown) => Promise<{ adminRole: AdminRole | null } | null> }
    }
  ).user.findUnique({ where: { id: user.id }, select: { adminRole: true } })) ?? null
  if (!hasCapability(row?.adminRole ?? null, cap)) {
    redirect('/login?error=forbidden')
  }
  return user
}
