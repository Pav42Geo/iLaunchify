import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import { redirect } from 'next/navigation'
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
export const metadata = { title: 'Messages — iLaunchify Partners' }

/**
 * Messages hub — partner side (Rooms & Messages, 2026-07-13). Same shell as
 * the creator app in partner mode: "Your team" grouping flips, and the invite
 * link points at the existing team settings (roles set there become the badge
 * every teammate carries in chat).
 */
export default async function PartnerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; dm?: string }>
}) {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)
  if (!access) redirect('/dashboard')
  const sp = await searchParams

  const [rails, conversations, nicheRows] = await Promise.all([
    listMessagingRooms(user.id, 'PARTNER', access.partnerId),
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
      authorRole: m.authorUserId === user.id ? 'PARTNER' : selectedDm.otherSide,
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
          Collaboration rooms and direct messages with your creators.
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
