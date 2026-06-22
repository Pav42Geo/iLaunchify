// Roles & Permissions (docs/ADMIN_RBAC.md P5). SUPER_ADMIN-only surface to
// grant/revoke each capability per admin role. The matrix is the live source of
// truth for what every non-super admin can do. Super admin always holds all.

import {
  requireCapability,
  ALL_CAPABILITIES,
  ADMIN_ROLE_LABEL,
  type AdminRole,
} from '@ilaunchify/auth'
import { getRoleCapabilityMatrix } from '@ilaunchify/db'
import { RoleMatrix } from './RoleMatrix'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Roles & Permissions — Admin' }

const EDITABLE_ROLES: AdminRole[] = ['SUPPORT_AGENT', 'SUPPORT_LEAD', 'BILLING_ADMIN']

export default async function RolesPage() {
  await requireCapability('users:admin')
  const matrix = await getRoleCapabilityMatrix()

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Users &amp; Roles · Permissions
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Roles &amp; Permissions
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Grant each role exactly the capabilities it needs. Roles start with nothing —
          turn on only what you intend. Changes take effect immediately and are audited.
          <span className="font-medium text-ink-800"> Super admin always holds every
          capability</span> and can&apos;t be edited here.
        </p>
      </div>

      <RoleMatrix
        capabilities={[...ALL_CAPABILITIES]}
        roles={EDITABLE_ROLES.map((r) => ({ value: r, label: ADMIN_ROLE_LABEL[r] }))}
        initial={matrix}
      />
    </div>
  )
}
