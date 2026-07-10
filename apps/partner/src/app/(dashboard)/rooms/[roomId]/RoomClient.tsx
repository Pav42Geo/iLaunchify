'use client'

// Partner-side room wrapper: binds the shared CoCreationRoomShell to this
// app's server actions. Review/approve is creator-only — the shell hides it
// in partner mode, and no review action exists on this side.

import { useRouter } from 'next/navigation'
import {
  CoCreationRoomShell,
  nicheGradientKey,
  type RoomShellEvent,
  type RoomShellMessage,
  type RoomShellMilestone,
  type RoomShellObject,
  type RoomSwitcherEntry,
  type RoomRecipeLabelView,
} from '@ilaunchify/ui'
import { partnerComment, partnerMessage, partnerSubmitVersion } from './actions'

export function RoomClient(props: {
  roomId: string
  rooms: RoomSwitcherEntry[]
  recipeLabel: RoomRecipeLabelView | null
  briefTitle: string
  briefNicheSlug: string
  creatorName: string
  partnerName: string
  ndaSigned: boolean
  objects: RoomShellObject[]
  milestones: RoomShellMilestone[]
  events: RoomShellEvent[]
  messages: RoomShellMessage[]
}) {
  const router = useRouter()
  const refresh = <T extends { ok: boolean }>(p: Promise<T>) =>
    p.then((r) => {
      router.refresh()
      return r
    })

  return (
    <CoCreationRoomShell
      mode="partner"
      fullScreen
      rooms={props.rooms}
      recipeLabel={props.recipeLabel}
      briefTitle={props.briefTitle}
      accentGradient={nicheGradientKey(props.briefNicheSlug)}
      creatorName={props.creatorName}
      partnerName={props.partnerName}
      ndaSigned={props.ndaSigned}
      objects={props.objects}
      milestones={props.milestones}
      events={props.events}
      messages={props.messages}
      onSubmitVersion={(objectId, payload) =>
        refresh(partnerSubmitVersion(props.roomId, objectId, payload))
      }
      onReview={async () => ({ ok: false, error: 'Only the creator reviews objects' })}
      onReopen={async () => ({ ok: false, error: 'Only the creator re-opens objects' })}
      onComment={(objectId, body, anchor) =>
        refresh(partnerComment(props.roomId, objectId, body, anchor))
      }
      onMessage={(body) => refresh(partnerMessage(props.roomId, body))}
    />
  )
}
