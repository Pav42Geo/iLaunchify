import { prisma, getCoCreationSettings } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import {
  resolveRoomRecipeLabel,
  evaluateMakerSwitch,
  isLabelProofPayload,
  listRoomDesignerSeats,
  getOpenDesignReview,
  getRoomMembers,
  listRoomChatMessages,
  resolveDesignerSeatCap,
  CO_CREATION_RATING_DIMENSIONS,
} from '@ilaunchify/orders'
import { getSignedReadUrl } from '@ilaunchify/storage'
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

  // Self-design-on-dieline (CO_CREATION_SELF_DESIGN_ON_DIELINE_SPEC): the
  // latest LABEL version that is a self-design proof renders as the REAL
  // artwork on the pin board — signed URL from payload.svgKey (fail-soft).
  const labelObj = room.objects.find((o) => o.kind === 'LABEL')
  const latestLabel = labelObj?.versions[labelObj.versions.length - 1]
  let labelProof: { version: number; url: string; widthMm: number; heightMm: number } | null = null
  if (latestLabel && isLabelProofPayload(latestLabel.payload)) {
    try {
      labelProof = {
        version: latestLabel.version,
        url: await getSignedReadUrl(latestLabel.payload.svgKey),
        widthMm: latestLabel.payload.widthMm,
        heightMm: latestLabel.payload.heightMm,
      }
    } catch {
      labelProof = null
    }
  }
  // "Design the label" affordance — only once the approved PACKAGING object
  // pins the maker's die-line (D1+D2). Route = room-scoped Studio (Code's
  // slice 3, spec §"Editor route").
  const packagingApproved =
    room.objects.find((o) => o.kind === 'PACKAGING')?.status === 'APPROVED'
  const designLabelHref =
    room.status === 'ACTIVE' && packagingApproved ? `/rooms/${room.id}/label` : undefined

  // Shared Design Workspace C3 — invited-designer seats (creator-only card;
  // shown alongside the label board once packaging pins the die-line).
  const designerSeats = packagingApproved ? await listRoomDesignerSeats(room.id) : []
  // C7 — pending internal design review awaiting this creator's decision.
  const designReview = packagingApproved ? await getOpenDesignReview(room.id) : null
  // Tier gate (Pavel 2026-07-13): Maker = 0 designer seats — Builder+ perk.
  const seatCap = packagingApproved
    ? await resolveDesignerSeatCap(
        (await prisma.creatorProfile.findUnique({
          where: { userId: user.id },
          select: { subscriptionTier: true },
        }))?.subscriptionTier.toLowerCase() ?? 'maker',
      )
    : null
  const designerInviteLocked =
    seatCap === 0
      ? 'Invite a trusted designer to co-work on this label — available on Builder and Agency plans.'
      : undefined

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

  // Members tab + 1:1 floating chats — viewer excluded (you don't DM yourself).
  const chatMembers = (await getRoomMembers(room.id).catch(() => []))
    .filter((m) => m.userId !== user.id)
    .map((m) => ({ userId: m.userId, name: m.name, roleLabel: m.roleLabel, side: m.side }))

  // Rail Messages tab = MIRROR of the fullscreen hub (Pavel 2026-07-13): the
  // SAME loader (newest window, author snapshots, signed attachments), so the
  // rail and /messages can never look like two different conversations.
  const railHistory = await listRoomChatMessages(room.id, { limit: 80 })
  const railMessages = await Promise.all(
    railHistory.messages.map(async (m) => ({
      id: m.id,
      authorRole: m.authorRole,
      body: m.body,
      createdAt: m.createdAt,
      authorUserId: m.authorUserId,
      authorName: m.authorUserId === user.id ? 'You' : m.authorName,
      authorRoleLabel: m.authorRoleLabel,
      objectRef: m.objectRef ? { kind: m.objectRef.kind, objectId: m.objectRef.objectId, title: m.objectRef.title } : null,
      attachment: await (async () => {
        if (!m.attachment) return null
        try {
          const url = await getSignedReadUrl(m.attachment.key)
          return { name: m.attachment.name, url }
        } catch {
          return null
        }
      })(),
    })),
  )

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
        labelProof={labelProof}
        designLabelHref={designLabelHref}
        designerSeats={designerSeats}
        designReview={designReview}
        designReviewAutoApprove={room.designReviewAutoApprove}
        designerInviteLocked={designerInviteLocked}
        briefDomain={room.brief.category}
        briefTitle={room.brief.title}
        briefNicheSlug={room.brief.nicheSlug}
      creatorName={room.brief.creator.displayName}
      partnerName={room.partner.companyName}
      ndaSigned={!!room.ndaSignedAt}
      canCloseWon={canCloseWon}
      canSwitchMaker={canSwitchMaker}
      rating={ratingProp}
      chatMembers={chatMembers}
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
        messages={railMessages}
      />
      </div>
    </>
  )
}
