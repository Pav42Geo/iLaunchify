'use client'

// Creator-side room wrapper: binds the shared CoCreationRoomShell to this
// app's server actions. Presentational logic lives in @ilaunchify/ui.

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
import {
  creatorAgreeMilestoneTerms,
  creatorCloseRoomWon,
  creatorRateMaker,
  creatorComment,
  creatorDeclineMilestoneTerms,
  creatorMessage,
  creatorReopen,
  creatorReview,
  creatorSubmitVersion,
  creatorSwitchMaker,
} from './actions'

export function RoomClient(props: {
  roomId: string
  rooms: RoomSwitcherEntry[]
  recipeLabels: { version: number; label: RoomRecipeLabelView }[]
  briefDomain: string
  briefTitle: string
  briefNicheSlug: string
  creatorName: string
  partnerName: string
  ndaSigned: boolean
  canCloseWon: boolean
  canSwitchMaker: boolean
  rating?: {
    counterpartName: string
    dimensions: { slug: string; label: string; sublabel: string }[]
    mine: { dimensions: Record<string, number>; comment: string | null } | null
  }
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
      fullScreen
      rooms={props.rooms}
      recipeLabels={props.recipeLabels}
      briefDomain={props.briefDomain}
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
      onAgreeMilestoneTerms={(milestoneId) =>
        refresh(creatorAgreeMilestoneTerms(props.roomId, milestoneId))
      }
      onDeclineMilestoneTerms={(milestoneId) =>
        refresh(creatorDeclineMilestoneTerms(props.roomId, milestoneId))
      }
      canCloseWon={props.canCloseWon}
      canSwitchMaker={props.canSwitchMaker}
      rating={props.rating}
      onRateCounterpart={(scores, comment) =>
        refresh(creatorRateMaker(props.roomId, scores, comment))
      }
      onSwitchMaker={async () => {
        const res = await creatorSwitchMaker(props.roomId)
        if (res.ok && res.briefId) {
          router.push(`/briefs/${res.briefId}/interests`)
        }
        return res
      }}
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
