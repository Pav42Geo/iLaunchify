import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import {
  resolveRoomRecipeLabel,
  evaluateMakerSwitch,
  CO_CREATION_RATING_DIMENSIONS,
} from '@ilaunchify/orders'
import {
  CoCreationStepper,
  nicheGradientKey,
  roomRecipeStatusLine,
  type RoomSwitcherEntry,
} from '@ilaunchify/ui'
import { RoomClient } from './RoomClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Collaboration room — iLaunchify' }

/**
 * Collaboration Room — creator view (prototype screens ④/⑤/⑥).
 * CO_CREATION_MARKETPLACE_SPEC §16 P0. Ownership enforced in the query;
 * a foreign room 404s. The private brief payload reveals in-room only (§9).
 */
export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>
  searchParams: Promise<{ object?: string }>
}) {
  const user = await requireUser()
  const { roomId } = await params
  // ?object= deep link (Messages object card) — pre-selects that build object.
  const { object: initialObjectId } = await searchParams

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

  // Room switcher (mockup-approved 2026-07-10): every ACTIVE room this
  // creator owns, with a status line + attention chip from the RECIPE object.
  const [activeRooms, nicheRows] = await Promise.all([
    prisma.coCreationRoom.findMany({
      where: { status: 'ACTIVE', brief: { creator: { userId: user.id } } },
      include: {
        brief: { select: { title: true, nicheSlug: true } },
        partner: { select: { companyName: true } },
        objects: { where: { kind: 'RECIPE' }, select: { status: true, currentVersion: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.niche.findMany({ where: { isActive: true }, select: { slug: true, iconEmoji: true } }),
  ])
  const nicheIcon = new Map(nicheRows.map((n) => [n.slug, n.iconEmoji ?? '🧪']))
  const switcherRooms: RoomSwitcherEntry[] = activeRooms.map((r) => {
    const s = roomRecipeStatusLine(r.objects[0] ?? null, 'creator')
    return {
      id: r.id,
      title: r.brief.title,
      counterpartName: r.partner.companyName,
      statusLine: s.line,
      attention: r.id === room.id ? null : s.attention,
      icon: nicheIcon.get(r.brief.nicheSlug) ?? '🧪',
      gradientKey: nicheGradientKey(r.brief.nicheSlug),
      href: `/rooms/${r.id}`,
    }
  })

  // Live domain-aware label bundle for EVERY recipe version (facts panel +
  // mandatory statements; honesty-gated in resolveRoomRecipeLabel) — the
  // shell shows the matching label per viewed version and diffs on compare.
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

  // "Confirm & create product" unlocks when the recipe is approved, the room
  // is still active, and nothing was materialized yet (§6 CLOSED_WON).
  const recipe = room.objects.find((o) => o.kind === 'RECIPE')
  const canCloseWon =
    room.status === 'ACTIVE' &&
    !room.materializedProductId &&
    !!recipe &&
    (recipe.status === 'APPROVED' || recipe.status === 'LOCKED') &&
    recipe.versions.length > 0

  // D-CC3 — "Switch maker" entry point: same pure cutoff engine as the server
  // action, so the button never shows when the action would refuse.
  const [ccSettings, priorRooms] = await Promise.all([
    getCoCreationSettings(),
    prisma.coCreationRoom.count({ where: { briefId: room.briefId, status: { not: 'ACTIVE' } } }),
  ])
  const canSwitchMaker = evaluateMakerSwitch(
    {
      policy: ccSettings.makerSwitchPolicy,
      graceDays: ccSettings.makerSwitchGraceDays,
      maxSwitches: ccSettings.maxMakerSwitches,
    },
    {
      roomStatus: room.status,
      roomCreatedAt: room.createdAt,
      ndaSignedAt: room.ndaSignedAt,
      milestoneStatuses: room.milestones.map((m) => m.status),
      milestoneTermsStatuses: room.milestones.map((m) => m.termsStatus),
      recipeStatus: recipe?.status ?? null,
      hasAnySubmission: room.objects.some((o) => o.versions.length > 0),
      priorRooms,
    },
  ).allowed

  // P1 two-sided reviews — after CLOSED_WON the creator rates the maker.
  const myRating =
    room.status === 'CLOSED_WON'
      ? await prisma.partnerRating.findFirst({
          where: { creatorUserId: user.id, roomId: room.id },
          select: { dimensions: true, comment: true },
        })
      : null
  const ratingProp =
    room.status === 'CLOSED_WON'
      ? {
          counterpartName: room.partner.companyName,
          dimensions: [...CO_CREATION_RATING_DIMENSIONS],
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
      {/* DIRECT child of <main>: data-full-bleed spans the layout grid. */}
      {/* mb-0: the room's white top bar sits flush against the stepper. */}
      <CoCreationStepper
        className="col-span-full -mt-6 mb-0"
        steps={[
          { key: 'brief', label: 'Post a brief', state: 'done', href: '/products/new/brief' },
          { key: 'shortlist', label: 'Choose a maker', state: 'done', href: `/briefs/${room.brief.id}/interests` },
          { key: 'room', label: 'Collaboration room', state: 'current' },
        ]}
      />
      {/* Full-bleed, viewport-filling room; -mb-6 cancels the layout's bottom padding. */}
      <div data-full-bleed className="col-span-full -mb-6">
      <RoomClient
        roomId={room.id}
        initialObjectId={initialObjectId}
        rooms={switcherRooms}
        recipeLabels={recipeLabels}
        briefDomain={room.brief.category}
        briefTitle={room.brief.title}
        briefNicheSlug={room.brief.nicheSlug}
      creatorName={room.brief.creator.displayName}
      partnerName={room.partner.companyName}
      ndaSigned={!!room.ndaSignedAt}
      canCloseWon={canCloseWon}
      canSwitchMaker={canSwitchMaker}
      rating={ratingProp}
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
