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
import {
  partnerComment,
  partnerMessage,
  partnerOpenRoomDispute,
  partnerProposeMilestoneTerms,
  partnerRateCreator,
  partnerSubmitVersion,
} from './actions'
import { roomSearchIngredients, roomCreateIngredient } from './ingredient-search-action'

export function RoomClient(props: {
  roomId: string
  /** ?object= deep link from a Messages object card — pre-selects that build object. */
  initialObjectId?: string
  rooms: RoomSwitcherEntry[]
  recipeLabels: { version: number; label: RoomRecipeLabelView }[]
  rating?: {
    counterpartName: string
    dimensions: { slug: string; label: string; sublabel: string }[]
    mine: { dimensions: Record<string, number>; comment: string | null } | null
  }
  briefDomain: string
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
      recipeLabels={props.recipeLabels}
      rating={props.rating}
      onRateCounterpart={(scores, comment) =>
        refresh(partnerRateCreator(props.roomId, scores, comment))
      }
      onOpenDispute={async (description) => {
        const res = await partnerOpenRoomDispute(props.roomId, description)
        if (res.ok && res.ticketId) router.push(`/help/${res.ticketId}`)
        return res
      }}
      briefDomain={props.briefDomain}
      onSearchIngredients={roomSearchIngredients}
      onCreateIngredient={roomCreateIngredient}
      briefTitle={props.briefTitle}
      accentGradient={nicheGradientKey(props.briefNicheSlug)}
      creatorName={props.creatorName}
      partnerName={props.partnerName}
      ndaSigned={props.ndaSigned}
      objects={props.objects}
      initialObjectId={props.initialObjectId}
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
      onProposeMilestoneTerms={(milestoneId, amount, note) =>
        refresh(partnerProposeMilestoneTerms(props.roomId, milestoneId, amount, note))
      }
    />
  )
}
