'use client'

// Thin binding: MessagesShell (presentational, packages/ui) ← server actions.

import {
  MessagesShell,
  type ShellChatMessage,
  type ShellConversation,
  type ShellMember,
  type ShellRoomThread,
  type ShellObjectRef,
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
  attachableObjects?: ShellObjectRef[]
  systemEvents?: { id: string; kind: string; data: Record<string, unknown>; createdAt: string }[]
  lastReadAt?: string | null
}) {
  const sel = props.selected
  return (
    <MessagesShell
      mode="creator"
      meUserId={props.meUserId}
      mySide="CREATOR"
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
      attachableObjects={props.attachableObjects}
      systemEvents={props.systemEvents}
      lastReadAt={props.lastReadAt}
      fullScreen
      onSendMessage={async (body, objectRef) => {
        if (!sel) return { ok: false, error: 'No thread selected' }
        return sel.kind === 'room'
          ? sendRoomMessageAction(sel.id, body, objectRef ? { objectId: objectRef.objectId } : undefined)
          : sendDmAction(sel.id, body)
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
