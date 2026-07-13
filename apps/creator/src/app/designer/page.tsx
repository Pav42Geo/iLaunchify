import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your design workspaces — iLaunchify' }

/**
 * DESIGNER home (Shared Design Workspace C5 — the scope wall's front door).
 * A designer's entire surface: the workspaces they're invited to, each seat's
 * agreement state, nothing else. Role-gated surfaces bounce DESIGNER sessions
 * here (requireRole); creators/partners landing here go back to their apps.
 * OUTSIDE the (dashboard) group on purpose — no creator chrome, no nav.
 */
export default async function DesignerHomePage() {
  const user = await requireUser()
  if (user.role !== 'DESIGNER') redirect('/dashboard')

  const seats = await prisma.designCollaborator.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const rooms = await prisma.coCreationRoom.findMany({
    where: { id: { in: seats.map((s) => s.roomId) } },
    select: {
      id: true,
      brief: { select: { title: true, creator: { select: { displayName: true } } } },
    },
  })
  const roomOf = new Map(rooms.map((r) => [r.id, r]))
  const live = seats.filter((s) => s.status === 'ACTIVE')
  const past = seats.filter((s) => s.status !== 'ACTIVE')

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-s-4 py-s-6">
      <header className="mb-s-4 flex items-center gap-s-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-pink-500 font-display text-ui-caption font-bold text-white">
          iL
        </span>
        <div>
          <h1 className="font-display text-ui-title text-ink-900">Your design workspaces</h1>
          <p className="text-ui-caption text-ink-500">
            Signed in as {user.email} · your access covers these workspaces only
          </p>
        </div>
      </header>

      {live.length === 0 ? (
        <div className="rounded-3xl border border-ink-200 bg-white p-s-6 text-center shadow-sm">
          <p aria-hidden className="text-3xl">🎨</p>
          <h2 className="mt-s-2 font-display text-ui-subhead text-ink-900">No active workspaces</h2>
          <p className="mt-s-1 text-ui-caption text-ink-500">
            When a creator invites you to a label design, the invitation email brings you here.
          </p>
        </div>
      ) : (
        live.map((s) => {
          const room = roomOf.get(s.roomId)
          return (
            <div
              key={s.id}
              className="mb-s-3 flex flex-wrap items-center gap-s-3 rounded-xl border border-ink-200 bg-white p-s-4 shadow-sm"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-pink-50 text-lg">
                🏷️
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-ui-caption font-bold text-ink-900">
                  {room?.brief.title ?? 'Label design'}
                </span>
                <span className="block text-ui-label normal-case tracking-normal text-ink-500">
                  with {room?.brief.creator.displayName ?? 'the creator'} ·{' '}
                  {s.ndaAcceptedAt ? 'agreement signed ✓' : 'agreement pending'}
                </span>
              </span>
              {s.ndaAcceptedAt ? (
                <Link
                  href={`/rooms/${s.roomId}/label`}
                  className="rounded-pill bg-pink-500 px-s-4 py-s-2 text-ui-caption font-semibold text-white transition-colors hover:bg-pink-600"
                >
                  Open workspace →
                </Link>
              ) : (
                <span className="rounded-pill bg-warning-50 px-s-3 py-s-1 text-ui-label tracking-normal text-warning-700">
                  Opens after the agreement is signed
                </span>
              )}
            </div>
          )
        })
      )}

      {past.length > 0 ? (
        <p className="mt-s-4 text-ui-label normal-case tracking-normal text-ink-400">
          {past.length} past workspace{past.length === 1 ? '' : 's'} — access ends automatically
          when a label is approved or an engagement closes.
        </p>
      ) : null}

      <p className="mt-s-6 text-ui-label normal-case tracking-normal text-ink-400">
        Questions about an invitation? Reply to the invite email — the creator manages your seat.
      </p>
    </main>
  )
}
