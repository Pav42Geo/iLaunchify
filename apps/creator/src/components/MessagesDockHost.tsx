'use client'

// Messages dock host — CREATOR side (Pavel 2026-07-13). Mounts the stacked
// mini-chat windows on Co-Creation Studio routes only (containment doctrine:
// messaging lives inside the studio). Thin binding: MessagesDock (ui) ← this
// app's messages server actions — the SAME actions the full hub uses, so the
// dock and the hub can never disagree.

import { usePathname } from 'next/navigation'
import { MessagesDock } from '@ilaunchify/ui'
import { isCoCreationPath } from './nav/CoCreationTopbarSlots'
import {
  heartbeatAction,
  loadDockThreadAction,
  sendDmAction,
  sendRoomMessageAction,
  uploadChatAttachmentAction,
} from '@/app/(dashboard)/messages/actions'

export function MessagesDockHost({ meUserId }: { meUserId: string }) {
  const pathname = usePathname()
  if (!isCoCreationPath(pathname)) return null
  return (
    <MessagesDock
      meUserId={meUserId}
      mySide="CREATOR"
      hubHref="/messages"
      callbacks={{
        loadThread: loadDockThreadAction,
        sendMessage: async (thread, body, attachment) =>
          thread.kind === 'room'
            ? sendRoomMessageAction(thread.id, body, undefined, attachment)
            : sendDmAction(thread.id, body, attachment),
        uploadAttachment: uploadChatAttachmentAction,
        heartbeat: heartbeatAction,
      }}
    />
  )
}
