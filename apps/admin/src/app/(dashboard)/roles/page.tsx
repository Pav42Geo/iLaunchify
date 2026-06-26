// Roles & Permissions (docs/ADMIN_RBAC.md P5). SUPER_ADMIN-only surface to
// grant/revoke each capability per admin role. The matrix is the live source of
// truth for what every non-super admin can do. Super admin always holds all.

import {
  requireCapability,
  ALL_CAPABILITIES,
  ADMIN_ROLE_LABEL,
  resolveCapabilities,
  type AdminRole,
} from '@ilaunchify/auth'
import { getRoleCapabilityMatrix } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { RoleMatrix } from './RoleMatrix'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roles & Permissions — Admin' }

const EDITABLE_ROLES: AdminRole[] = ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN']

export default async function RolesPage() {
  await requireCapability('users:admin')
  const matrix = await getRoleCapabilityMatrix()

  // Suggested capability bundle per role — surfaced as one-click presets and
  // as a hint on cells the role doesn't yet hold.
  const presets: Record<string, string[]> = {}
  for (const r of EDITABLE_ROLES) presets[r] = resolveCapabilities(r)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Users & Roles · Permissions"
        title="Roles & Permissions"
        description={
          <>
            Grant each role exactly the capabilities it needs. Roles start with nothing — use
            <span className="font-medium text-ink-800"> Apply preset</span> to load a role&apos;s
            suggested bundle, then fine-tune. Suggested-but-not-granted capabilities show a hollow
            dot. Changes take effect immediately and are audited.
            <span className="font-medium text-ink-800"> Super admin always holds every
            capability</span> and can&apos;t be edited here.
          </>
        }
      />

      <RoleMatrix
        capabilities={[...ALL_CAPABILITIES]}
        roles={EDITABLE_ROLES.map((r) => ({ value: r, label: ADMIN_ROLE_LABEL[r] }))}
        initial={matrix}
        presets={presets}
      />
    </div>
  )
}
