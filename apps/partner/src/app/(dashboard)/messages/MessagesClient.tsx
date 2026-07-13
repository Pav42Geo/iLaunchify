'use client'

// Thin binding: MessagesShell (presentational, packages/ui) ← server actions.

import {
  MessagesShell,
  type ShellChatMessage,
  type ShellConversation,
  type ShellMember,
  type ShellRoomThread,
  type ProductGradient,
} from '@ilaunchify/ui'
import {
  markDmReadAction,
  markRoomReadAction,
  sendDmAction,
  sendRoomMessageAction,
  startDmAction,
} from './actions'

export function MessagesClient(props: {
  meUserId: string
  rooms: ShellRoomThread[]
  conversations: ShellConversation[]
  selected: { kind: 'room' | 'dm'; id: string } | null
  messages: ShellChatMessage[]
  members: ShellMember[]
  headerTitle: string
  headerSubtitle: string
  headerIcon?: string
  headerGradientKey?: ProductGradient
  roomHref?: string
}) {
  const sel = props.selected
  return (
    <MessagesShell
      mode="partner"
      meUserId={props.meUserId}
      mySide="PARTNER"
      rooms={props.rooms}
      conversations={props.conversations}
      selected={sel}
      messages={props.messages}
      members={props.members}
      headerTitle={props.headerTitle}
      headerSubtitle={props.headerSubtitle}
      headerIcon={props.headerIcon}
      headerGradientKey={props.headerGradientKey}
      roomHref={props.roomHref}
      inviteHref="/settings/team"
      onSendMessage={async (body) => {
        if (!sel) return { ok: false, error: 'No thread selected' }
        return sel.kind === 'room' ? sendRoomMessageAction(sel.id, body) : sendDmAction(sel.id, body)
      }}
      onStartDm={
        sel?.kind === 'room' ? async (otherUserId) => startDmAction(sel.id, otherUserId) : undefined
      }
      onMarkRead={
        sel
          ? async () => (sel.kind === 'room' ? markRoomReadAction(sel.id) : markDmReadAction(sel.id))
          : undefined
      }
    />
  )
}
