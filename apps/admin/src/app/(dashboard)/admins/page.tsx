// Admin team management (docs/ADMIN_RBAC.md P4). SUPER_ADMIN-only surface to
// assign each admin's RBAC role. Read-only for everyone else (the page guard
// requires users:admin). Role changes are audited.

import {
  requireCapability,
  resolveCapabilities,
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  type AdminRole,
} from '@ilaunchify/auth'
import { prisma, listAdminInvites } from '@ilaunchify/db'
import { Shield } from 'lucide-react'
import { AdminRoleSelect } from './AdminRoleSelect'
import { AddAdminForm } from './AddAdminForm'
import { InviteAdminForm } from './InviteAdminForm'
import { PendingInvitesTable } from './PendingInvitesTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admins — Admin' }

type AdminRow = { id: string; name: string | null; email: string; adminRole: AdminRole | null }

const ROLE_OPTIONS = ADMIN_ROLES.map((r) => ({ value: r, label: ADMIN_ROLE_LABEL[r] }))

function isAdminRole(v: string): v is AdminRole {
  return (ADMIN_ROLES as string[]).includes(v)
}

export default async function AdminsPage() {
  const actor = await requireCapability('users:admin')

  const admins = (await prisma.user.findMany({
    where: { role: 'ADMIN' },
    orderBy: { email: 'asc' },
    select: { id: true, name: true, email: true, adminRole: true },
  })) as AdminRow[]

  const invites = (await listAdminInvites()).map((i) => ({
    id: i.id,
    email: i.email,
    roleLabel: isAdminRole(i.adminRole) ? ADMIN_ROLE_LABEL[i.adminRole] : i.adminRole,
    invitedBy: i.invitedByName ?? i.invitedByEmail,
    expiresLabel: i.expiresAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
  }))

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Users &amp; Roles · Admin team
        </p>
        <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Admins
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-ink-600">
          Assign each teammate the least access they need. A role is a fixed bundle of
          capabilities — Support agents work tickets but never touch money, settings, or the
          admin team. Changes are audited. You can&apos;t change your own role.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AddAdminForm roles={ROLE_OPTIONS} />
        <InviteAdminForm roles={ROLE_OPTIONS} />
      </div>

      <PendingInvitesTable invites={invites} />

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="font-display text-[13.5px] font-semibold tracking-tight text-ink-900">
            {admins.length} admin{admins.length === 1 ? '' : 's'}
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                <th className="px-4 py-2.5 font-semibold">Admin</th>
                <th className="px-4 py-2.5 font-semibold">Current role</th>
                <th className="px-4 py-2.5 font-semibold">Access</th>
                <th className="px-4 py-2.5 font-semibold">Change role</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                // null adminRole = least privilege (no access) post-backfill flip.
                const unassigned = a.adminRole === null
                const capCount = unassigned ? 0 : resolveCapabilities(a.adminRole).length
                return (
                  <tr key={a.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-pink-50 text-pink-700">
                          <Shield className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900">{a.name ?? '—'}</div>
                          <div className="truncate text-[11.5px] text-ink-500">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {unassigned ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-[3px] text-[11px] font-medium text-amber-700">
                          Unassigned
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2.5 py-[3px] text-[11px] font-medium text-ink-700">
                          {ADMIN_ROLE_LABEL[a.adminRole as AdminRole]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-ink-500">
                      {unassigned
                        ? 'No access'
                        : a.adminRole === 'SUPER_ADMIN'
                          ? 'Full access'
                          : `${capCount} capabilities`}
                    </td>
                    <td className="px-4 py-3">
                      <AdminRoleSelect
                        userId={a.id}
                        current={a.adminRole ?? 'SUPPORT_AGENT'}
                        isSelf={a.id === actor.id}
                        roles={ROLE_OPTIONS}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
