import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import { CoCreationStepper } from '@ilaunchify/ui'
import { RoomClient } from './RoomClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Collaboration room — iLaunchify' }

/**
 * Collaboration Room — creator view (prototype screens ④/⑤/⑥).
 * CO_CREATION_MARKETPLACE_SPEC §16 P0. Ownership enforced in the query;
 * a foreign room 404s. The private brief payload reveals in-room only (§9).
 */
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requireUser()
  const { roomId } = await params

  const room = await prisma.coCreationRoom.findFirst({
    where: { id: roomId, brief: { creator: { userId: user.id } } },
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

  // "Confirm & create product" unlocks when the recipe is approved, the room
  // is still active, and nothing was materialized yet (§6 CLOSED_WON).
  const recipe = room.objects.find((o) => o.kind === 'RECIPE')
  const canCloseWon =
    room.status === 'ACTIVE' &&
    !room.materializedProductId &&
    !!recipe &&
    (recipe.status === 'APPROVED' || recipe.status === 'LOCKED') &&
    recipe.versions.length > 0

  return (
    <div className="space-y-6">
      <CoCreationStepper
        steps={[
          { key: 'brief', label: 'Post a brief', state: 'done', href: '/products/new/brief' },
          { key: 'shortlist', label: 'Choose a maker', state: 'done', href: `/briefs/${room.brief.id}/interests` },
          { key: 'room', label: 'Collaboration room', state: 'current' },
        ]}
      />
      <RoomClient
        roomId={room.id}
        briefTitle={room.brief.title}
        briefNicheSlug={room.brief.nicheSlug}
      creatorName={room.brief.creator.displayName}
      partnerName={room.partner.companyName}
      ndaSigned={!!room.ndaSignedAt}
      canCloseWon={canCloseWon}
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
    </div>
  )
}
