// Accept an admin-team invite (docs/ADMIN_RBAC.md). Top-level route — NOT under
// the (dashboard) ADMIN gate, because the invitee isn't an admin yet. The edge
// middleware still requires a session cookie, so an unauthenticated visitor is
// bounced to /login?callbackUrl=/accept-invite?token=… first. Once signed in,
// they confirm here and the invite assigns their role.

import { createHash } from 'node:crypto'
import { requireUser, ADMIN_ROLE_LABEL, ADMIN_ROLES, type AdminRole } from '@ilaunchify/auth'
import { getAdminInviteByTokenHash } from '@ilaunchify/db'
import { AcceptInvitePanel } from './AcceptInvitePanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accept admin invite' }

function roleLabel(v: string): string {
  return (ADMIN_ROLES as string[]).includes(v) ? ADMIN_ROLE_LABEL[v as AdminRole] : v
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-ink-200 bg-white p-8 shadow-sm">{children}</div>
    </main>
  )
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const user = await requireUser()

  if (!token) {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-bold text-ink-900">Invalid invite</h1>
        <p className="mt-2 text-[13px] text-ink-600">This link is missing its invite token.</p>
      </Shell>
    )
  }

  const invite = await getAdminInviteByTokenHash(createHash('sha256').update(token).digest('hex'))

  if (!invite || invite.status !== 'PENDING' || invite.expiresAt.getTime() < Date.now()) {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-bold text-ink-900">Invite unavailable</h1>
        <p className="mt-2 text-[13px] text-ink-600">
          This invite link is invalid, already used, revoked, or expired. Ask a super admin to
          send you a new one.
        </p>
      </Shell>
    )
  }

  const emailMatches = invite.email.toLowerCase() === user.email.toLowerCase()

  return (
    <Shell>
      <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
        iLaunchify · Admin team
      </p>
      <h1 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
        Join as {roleLabel(invite.adminRole)}
      </h1>
      <p className="mt-2 text-[13px] text-ink-600">
        You were invited to the admin team as <span className="font-medium text-ink-900">{roleLabel(invite.adminRole)}</span>.
        Accepting will give this account ({user.email}) admin access with that role.
      </p>

      {emailMatches ? (
        <AcceptInvitePanel token={token} />
      ) : (
        <div className="mt-5 rounded-xl border border-warning-200 bg-warning-50 p-3 text-[12.5px] text-warning-800">
          This invite was sent to <span className="font-medium">{invite.email}</span>, but
          you&apos;re signed in as <span className="font-medium">{user.email}</span>. Sign out and
          sign back in with the invited email to accept.
        </div>
      )}
    </Shell>
  )
}
