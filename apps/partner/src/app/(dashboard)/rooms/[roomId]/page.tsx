import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import { notFound, redirect } from 'next/navigation'
import { resolveRoomRecipeLabel, CREATOR_RATING_DIMENSIONS } from '@ilaunchify/orders'
import {
  CoCreationStepper,
  nicheGradientKey,
  roomRecipeStatusLine,
  type RoomSwitcherEntry,
} from '@ilaunchify/ui'
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

  // Live domain-aware label bundle for EVERY recipe version (per-version
  // display + label diff on compare).
  const recipeObj = room.objects.find((o) => o.kind === 'RECIPE')
  const recipeLabels = recipeObj
    ? (
        await Promise.all(
          recipeObj.versions.map(async (v) => ({
            version: v.version,
            label: await resolveRoomRecipeLabel({
              partnerId: room.partnerId,
              domain: room.brief.category,
              payload: v.payload,
            }),
          })),
        )
      ).flatMap((x) => (x.label ? [{ version: x.version, label: x.label }] : []))
    : []

  // Room switcher — every ACTIVE room this maker org is in.
  const [activeRooms, nicheRows] = await Promise.all([
    prisma.coCreationRoom.findMany({
      where: { status: 'ACTIVE', partnerId: access.partnerId },
      include: {
        brief: { select: { title: true, nicheSlug: true, creator: { select: { displayName: true } } } },
        objects: { where: { kind: 'RECIPE' }, select: { status: true, currentVersion: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.niche.findMany({ where: { isActive: true }, select: { slug: true, iconEmoji: true } }),
  ])
  const nicheIcon = new Map(nicheRows.map((n) => [n.slug, n.iconEmoji ?? '🧪']))
  const switcherRooms: RoomSwitcherEntry[] = activeRooms.map((r) => {
    const s = roomRecipeStatusLine(r.objects[0] ?? null, 'partner')
    return {
      id: r.id,
      title: r.brief.title,
      counterpartName: r.brief.creator.displayName,
      statusLine: s.line,
      attention: r.id === room.id ? null : s.attention,
      icon: nicheIcon.get(r.brief.nicheSlug) ?? '🧪',
      gradientKey: nicheGradientKey(r.brief.nicheSlug),
      href: `/rooms/${r.id}`,
    }
  })

  // P1 two-sided reviews — after CLOSED_WON the maker rates the creator.
  const myRating =
    room.status === 'CLOSED_WON'
      ? await prisma.creatorRating.findFirst({
          where: { partnerId: access.partnerId, roomId: room.id },
          select: { dimensions: true, comment: true },
        })
      : null
  const ratingProp =
    room.status === 'CLOSED_WON'
      ? {
          counterpartName: room.brief.creator.displayName,
          dimensions: [...CREATOR_RATING_DIMENSIONS],
          mine: myRating
            ? {
                dimensions: (myRating.dimensions ?? {}) as Record<string, number>,
                comment: myRating.comment,
              }
            : null,
        }
      : undefined

  return (
    <>
      {/* Maker journey stepper — mb-0: the room's white top bar sits flush. */}
      <CoCreationStepper
        className="col-span-full -mt-6 mb-0"
        steps={[
          { key: 'pool', label: 'Opportunity pool', state: 'done', href: '/opportunities' },
          { key: 'room', label: 'Collaboration room', state: 'current' },
        ]}
      />
      {/* Full-bleed, viewport-filling room; -mb-6 cancels the layout's bottom padding. */}
      <div data-full-bleed className="col-span-full -mb-6">
      <RoomClient
      roomId={room.id}
      rooms={switcherRooms}
      recipeLabels={recipeLabels}
      rating={ratingProp}
      briefDomain={room.brief.category}
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
      milestones={room.milestones.map((m) => ({
        id: m.id,
        kind: m.kind,
        status: m.status,
        amount: m.amount.toString(),
        termsStatus: m.termsStatus,
        termsNote: m.termsNote,
      }))}
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
    </>
  )
}
