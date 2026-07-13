import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { getPublishedLegalDocument } from '@ilaunchify/legal'
import { acceptDesignerInvite } from '@ilaunchify/orders'
import { AcceptInviteClient } from './AcceptInviteClient'
import { DESIGNER_NDA_SLUG } from './accept-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Design workspace invitation — iLaunchify' }

/**
 * Designer invite landing (Shared Design Workspace C2/C4). OUTSIDE the
 * (dashboard) group on purpose: DESIGNER accounts never pass the dashboard's
 * role gate — this page requires only a session. Flow: accept the seat →
 * NDA hard gate (D-W6; honest pending copy until counsel's doc publishes) →
 * on to the room-scoped Studio (Code's slice-3 route).
 */
export default async function DesignInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const user = await requireUser() // redirects to /login when signed out
  const { token } = await params

  // Accept (idempotent — revisiting the link after accepting is fine).
  const accepted = await acceptDesignerInvite(
    { id: user.id, email: user.email ?? '', role: user.role },
    token,
  )

  // NDA doc state (D-W6): published → render for acceptance; absent → honest hold.
  const ndaDoc = accepted.ok
    ? await getPublishedLegalDocument(prisma, DESIGNER_NDA_SLUG).catch(() => null)
    : null

  // Room title for context (safe: title only — the scope wall hides the rest).
  const room = accepted.ok
    ? await prisma.coCreationRoom.findUnique({
        where: { id: accepted.roomId },
        select: { brief: { select: { title: true, creator: { select: { displayName: true } } } } },
      })
    : null

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-s-4 py-s-6">
      <AcceptInviteClient
        result={
          accepted.ok
            ? {
                ok: true,
                roomId: accepted.roomId,
                seatId: accepted.seatId,
                ndaAccepted: accepted.ndaAccepted,
              }
            : { ok: false, error: accepted.error }
        }
        briefTitle={room?.brief.title ?? 'a product label'}
        creatorName={room?.brief.creator.displayName ?? 'the creator'}
        nda={
          ndaDoc?.currentVersion
            ? { title: ndaDoc.title, version: ndaDoc.currentVersion.version, body: ndaDoc.currentVersion.bodyText ?? '' }
            : null
        }
      />
    </main>
  )
}
