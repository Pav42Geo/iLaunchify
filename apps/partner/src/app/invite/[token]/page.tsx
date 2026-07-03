// Partner team invite acceptance — P3 (PRINT_PRODUCTION_WORKFLOW §2.1 Phase 3).
// Lives OUTSIDE the (dashboard) group: the invitee may not yet have the
// PARTNER role or any membership (the dashboard layout would bounce them).
// Flow: logged out → login with the invited address (magic link creates the
// account) → back here → server action validates token + email and creates
// the membership rows.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AcceptInviteButton } from './AcceptInviteButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team invitation — Partners' }

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const invite = await prisma.partnerInvite.findUnique({
    where: { token },
    select: {
      emailAddress: true,
      status: true,
      tokenExpiresAt: true,
      partner: { select: { companyName: true } },
    },
  })

  const session = await auth()
  const user = session?.user ?? null

  if (!invite || invite.status !== 'PENDING' || invite.tokenExpiresAt < new Date()) {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-bold text-ink-900">This invitation isn&apos;t valid anymore</h1>
        <p className="mt-2 text-[13.5px] text-ink-600">
          It may have expired (invites last 14 days), been revoked, or already been used. Ask your
          team admin to send a fresh one.
        </p>
      </Shell>
    )
  }

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`)
  }

  const emailMatches = user!.email?.toLowerCase() === invite.emailAddress

  return (
    <Shell>
      <h1 className="font-display text-[22px] font-bold text-ink-900">
        Join {invite.partner.companyName} on iLaunchify
      </h1>
      {emailMatches ? (
        <>
          <p className="mt-2 text-[13.5px] text-ink-600">
            You&apos;ve been invited to {invite.partner.companyName}&apos;s partner workspace as{' '}
            <span className="font-medium text-ink-900">{invite.emailAddress}</span>. Accepting
            links your account to their team with the roles your admin granted.
          </p>
          <div className="mt-5">
            <AcceptInviteButton token={token} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[13.5px] text-ink-600">
            This invitation was sent to{' '}
            <span className="font-medium text-ink-900">{invite.emailAddress}</span>, but you&apos;re
            signed in as <span className="font-medium text-ink-900">{user!.email}</span>. Sign out
            and log in with the invited address to accept.
          </p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
            className="mt-5 inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800"
          >
            Switch account
          </Link>
        </>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-ink-200 bg-white px-8 py-8 shadow-sm">
        {children}
      </div>
    </main>
  )
}
