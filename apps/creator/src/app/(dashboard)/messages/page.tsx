import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  getRoomMembers,
  listConversations,
  listDirectMessages,
  listMessagingRooms,
  listRoomChatMessages,
} from '@ilaunchify/orders'
import {
  nicheGradientKey,
  type ShellChatMessage,
  type ShellMember,
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

  let messages: ShellChatMessage[] = []
  let members: ShellMember[] = []
  let headerTitle = ''
  let headerSubtitle = ''

  if (selectedRoom) {
    const [msgs, mems] = await Promise.all([
      listRoomChatMessages(selectedRoom.id),
      getRoomMembers(selectedRoom.id),
    ])
    messages = msgs
    members = mems.map((m) => ({ ...m }))
    headerTitle = selectedRoom.title
    headerSubtitle = `with ${selectedRoom.counterpartName} · ${mems.length} members`
  } else if (selectedDm) {
    const raw = await listDirectMessages(selectedDm.id)
    messages = raw.map((m) => ({
      id: m.id,
      authorUserId: m.authorUserId,
      authorName: m.authorUserId === user.id ? 'You' : selectedDm.otherName,
      authorRoleLabel: m.authorUserId === user.id ? null : selectedDm.otherRoleLabel,
      authorRole: m.authorUserId === user.id ? 'CREATOR' : selectedDm.otherSide,
      body: m.body,
      objectRef: null,
      createdAt: m.createdAt,
    }))
    headerTitle = selectedDm.otherName
    headerSubtitle = selectedDm.otherRoleLabel ?? 'Direct message'
  }

  return (
    <div className="col-span-full">
      <div className="mb-s-3 flex items-baseline gap-s-3">
        <h1 className="font-display text-ui-title text-ink-900">Messages</h1>
        <p className="text-ui-caption text-ink-500">
          Product rooms and direct messages — chat lives with the work.
        </p>
      </div>
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
      />
    </div>
  )
}
