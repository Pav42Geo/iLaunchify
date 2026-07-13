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
  heartbeatAction,
  loadEarlierMessagesAction,
  markDmReadAction,
  markRoomReadAction,
  sendDmAction,
  sendRoomMessageAction,
  startDmAction,
  uploadChatAttachmentAction,
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
  hasEarlier?: boolean
  onlineMap?: Record<string, boolean>
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
      attachableObjects={props.attachableObjects}
      systemEvents={props.systemEvents}
      lastReadAt={props.lastReadAt}
      hasEarlier={props.hasEarlier}
      fullScreen
      onlineMap={props.onlineMap}
      onHeartbeat={sel ? async (typing) => heartbeatAction(sel, typing) : undefined}
      onLoadEarlier={sel ? async (beforeId) => loadEarlierMessagesAction(sel, beforeId) : undefined}
      onUploadAttachment={sel ? async (fd) => uploadChatAttachmentAction(sel, fd) : undefined}
      onSendMessage={async (body, objectRef, attachment) => {
        if (!sel) return { ok: false, error: 'No thread selected' }
        return sel.kind === 'room'
          ? sendRoomMessageAction(
              sel.id,
              body,
              objectRef ? { objectId: objectRef.objectId } : undefined,
              attachment,
            )
          : sendDmAction(sel.id, body, attachment)
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
