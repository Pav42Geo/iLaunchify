import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  getOnlineMap,
  getRoomMembers,
  listConversations,
  listDirectMessages,
  listMessagingRooms,
  listRoomChatMessages,
  type ChatAttachment,
} from '@ilaunchify/orders'
import { getSignedReadUrl } from '@ilaunchify/storage'
import {
  nicheGradientKey,
  OBJECT_KIND_LABEL,
  type ShellChatMessage,
  type ShellMember,
  type ShellObjectRef,
  type ShellRoomThread,
} from '@ilaunchify/ui'
import { MessagesClient } from './MessagesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Messages — iLaunchify' }

/**
 * Messages hub — creator side (Rooms & Messages, 2026-07-13).
 * Rail = product rooms + 1:1 DMs; selection is URL-driven (?room= / ?dm=).
 * Ownership guards live in the queries: the rail loaders scope by userId, and
 * a selected thread renders only if it appears in the caller's own rail.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; dm?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams

  const [rails, conversations, nicheRows] = await Promise.all([
    listMessagingRooms(user.id, 'CREATOR'),
    listConversations(user.id),
    prisma.niche.findMany({ where: { isActive: true }, select: { slug: true, iconEmoji: true } }),
  ])
  const nicheIcon = new Map(nicheRows.map((n) => [n.slug, n.iconEmoji ?? '🧪']))

  const rooms: ShellRoomThread[] = rails.map((r) => ({
    id: r.id,
    title: r.title,
    icon: nicheIcon.get(r.nicheSlug) ?? '🧪',
    gradientKey: nicheGradientKey(r.nicheSlug),
    counterpartName: r.counterpartName,
    status: r.status,
    lastMessage: r.lastMessage,
    unreadCount: r.unreadCount,
  }))

  // Selected thread — only if it belongs to this user's own rail.
  const selectedRoom = sp.room ? (rooms.find((r) => r.id === sp.room) ?? null) : null
  const selectedDm = sp.dm ? (conversations.find((c) => c.id === sp.dm) ?? null) : null
  const selected = selectedRoom
    ? ({ kind: 'room', id: selectedRoom.id } as const)
    : selectedDm
      ? ({ kind: 'dm', id: selectedDm.id } as const)
      : null

  // Fail-soft signed URL for a chat attachment (presence of R2 env varies).
  async function signAttachment(
    a: ChatAttachment | null,
  ): Promise<ShellChatMessage['attachment']> {
    if (!a) return null
    try {
      const url = await getSignedReadUrl(a.key)
      return { name: a.name, url, mimeType: a.mimeType, size: a.size }
    } catch {
      return null
    }
  }

  let messages: ShellChatMessage[] = []
  let members: ShellMember[] = []
  let attachableObjects: ShellObjectRef[] = []
  let systemEvents: { id: string; kind: string; data: Record<string, unknown>; createdAt: string }[] = []
  let lastReadAt: string | null = null
  let headerTitle = ''
  let headerSubtitle = ''

  if (selectedRoom) {
    const [msgs, mems, objects, events, cursor] = await Promise.all([
      listRoomChatMessages(selectedRoom.id),
      getRoomMembers(selectedRoom.id),
      prisma.buildObject.findMany({
        where: { roomId: selectedRoom.id },
        select: { id: true, kind: true, status: true, currentVersion: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.roomEvent.findMany({
        where: { roomId: selectedRoom.id },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      prisma.roomReadCursor.findUnique({
        where: { roomId_userId: { roomId: selectedRoom.id, userId: user.id } },
        select: { lastReadAt: true },
      }),
    ])
    messages = await Promise.all(
      msgs.map(async (m) => ({ ...m, attachment: await signAttachment(m.attachment) })),
    )
    members = mems.map((m) => ({ ...m }))
    systemEvents = events.map((e) => ({
      id: e.id,
      kind: e.kind,
      data: (e.data ?? {}) as Record<string, unknown>,
      createdAt: e.createdAt.toISOString(),
    }))
    lastReadAt = cursor?.lastReadAt?.toISOString() ?? null
    attachableObjects = objects.map((o) => ({
      kind: o.kind as string,
      objectId: o.id,
      title: `${OBJECT_KIND_LABEL[o.kind as string] ?? o.kind} v${o.currentVersion}`,
      subtitle: (o.status as string).replace(/_/g, ' ').toLowerCase(),
    }))
    headerTitle = selectedRoom.title
    headerSubtitle = `with ${selectedRoom.counterpartName} · ${mems.length} members`
  } else if (selectedDm) {
    const raw = await listDirectMessages(selectedDm.id)
    messages = await Promise.all(
      raw.map(async (m) => ({
        id: m.id,
        authorUserId: m.authorUserId,
        authorName: m.authorUserId === user.id ? 'You' : selectedDm.otherName,
        authorRoleLabel: m.authorUserId === user.id ? null : selectedDm.otherRoleLabel,
        authorRole: m.authorUserId === user.id ? 'CREATOR' : selectedDm.otherSide,
        body: m.body,
        objectRef: null,
        attachment: await signAttachment(m.attachment),
        createdAt: m.createdAt,
      })),
    )
    headerTitle = selectedDm.otherName
    headerSubtitle = selectedDm.otherRoleLabel ?? 'Direct message'
  }

  // Page-load presence map (rail DM dots + members' initial state). Live
  // updates ride the heartbeat poll; this is just the first paint. Fail-soft.
  const presenceIds = [
    ...conversations.flatMap((c) => (c.otherUserId ? [c.otherUserId] : [])),
    ...members.map((m) => m.userId),
  ]
  const onlineMap = await getOnlineMap([...new Set(presenceIds)]).catch(
    () => ({}) as Record<string, boolean>,
  )

  return (
    // Studio workspace (Pavel 2026-07-13): full-bleed, viewport-filling —
    // no page chrome; the topbar's "Co-Creation Studio" sublabel carries
    // context and the reduced studio sidebar keeps the user inside the tool.
    // -mt-6/-mb-6 cancel the layout grid's vertical padding.
    <div data-full-bleed className="col-span-full -mb-6 -mt-6">
      <MessagesClient
        meUserId={user.id}
        rooms={rooms}
        conversations={conversations}
        selected={selected}
        messages={messages}
        members={members}
        headerTitle={headerTitle}
        headerSubtitle={headerSubtitle}
        headerIcon={selectedRoom?.icon}
        headerGradientKey={selectedRoom?.gradientKey}
        roomHref={selectedRoom ? `/rooms/${selectedRoom.id}` : undefined}
        attachableObjects={attachableObjects}
        systemEvents={systemEvents}
        lastReadAt={lastReadAt}
        onlineMap={onlineMap}
      />
    </div>
  )
}
