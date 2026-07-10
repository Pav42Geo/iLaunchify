'use client'

// Creator-side room wrapper: binds the shared CoCreationRoomShell to this
// app's server actions. Presentational logic lives in @ilaunchify/ui.

import { useRouter } from 'next/navigation'
import {
  CoCreationRoomShell,
  type RoomShellEvent,
  type RoomShellMessage,
  type RoomShellMilestone,
  type RoomShellObject,
} from '@ilaunchify/ui'
import {
  creatorCloseRoomWon,
  creatorComment,
  creatorMessage,
  creatorReopen,
  creatorReview,
  creatorSubmitVersion,
} from './actions'

export function RoomClient(props: {
  roomId: string
  briefTitle: string
  creatorName: string
  partnerName: string
  ndaSigned: boolean
  canCloseWon: boolean
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
      mode="creator"
      briefTitle={props.briefTitle}
      creatorName={props.creatorName}
      partnerName={props.partnerName}
      ndaSigned={props.ndaSigned}
      objects={props.objects}
      milestones={props.milestones}
      events={props.events}
      messages={props.messages}
      onSubmitVersion={(objectId, payload) =>
        refresh(creatorSubmitVersion(props.roomId, objectId, payload))
      }
      onReview={(objectId, decision, note) =>
        refresh(creatorReview(props.roomId, objectId, decision, note))
      }
      onReopen={(objectId) => refresh(creatorReopen(props.roomId, objectId))}
      onComment={(objectId, body, anchor) =>
        refresh(creatorComment(props.roomId, objectId, body, anchor))
      }
      onMessage={(body) => refresh(creatorMessage(props.roomId, body))}
      canCloseWon={props.canCloseWon}
      onCloseWon={async () => {
        const res = await creatorCloseRoomWon(props.roomId)
        if (res.ok && res.productId) {
          router.push(`/products/${res.productId}/customize`)
        }
        return res
      }}
    />
  )
}
