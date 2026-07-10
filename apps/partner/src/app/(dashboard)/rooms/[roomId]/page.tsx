import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import { notFound, redirect } from 'next/navigation'
import { RoomClient } from './RoomClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Collaboration room — iLaunchify Partners' }

/**
 * Collaboration Room — maker view (prototype screen ④). Membership enforced
 * in the query (room.partnerId must be the acting partner org); a foreign
 * room 404s. This is where the brief's PRIVATE payload becomes visible to
 * the maker for the first time (§9 staged reveal) — the recipe object seeds
 * from what the creator shared after selection.
 */
export default async function PartnerRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)
  if (!access) redirect('/dashboard')
  const { roomId } = await params

  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, partnerId: access.partnerId },
    include: {
      brief: { include: { creator: { select: { displayName: true } } } },
      partner: { select: { companyName: true } },
      objects: {
        orderBy: { createdAt: 'asc' },
        include: {
          versions: { orderBy: { version: 'asc' } },
          comments: { orderBy: { createdAt: 'asc' } },
        },
      },
      milestones: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  })
  if (!room) notFound()

  return (
    <RoomClient
      roomId={room.id}
      briefTitle={room.brief.title}
      briefNicheSlug={room.brief.nicheSlug}
      creatorName={room.brief.creator.displayName}
      partnerName={room.partner.companyName}
      ndaSigned={!!room.ndaSignedAt}
      objects={room.objects.map((o) => ({
        id: o.id,
        kind: o.kind,
        status: o.status,
        currentVersion: o.currentVersion,
        versions: o.versions.map((v) => ({
          version: v.version,
          payload: v.payload,
          submittedByPartner: v.submittedByPartner,
          createdAt: v.createdAt.toISOString(),
        })),
        comments: o.comments.map((c) => ({
          id: c.id,
          anchor: c.anchor,
          authorRole: c.authorRole,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
      }))}
      milestones={room.milestones.map((m) => ({ id: m.id, kind: m.kind, status: m.status }))}
      events={room.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        data: (e.data ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      }))}
      messages={room.messages.map((m) => ({
        id: m.id,
        authorRole: m.authorRole,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  )
}
