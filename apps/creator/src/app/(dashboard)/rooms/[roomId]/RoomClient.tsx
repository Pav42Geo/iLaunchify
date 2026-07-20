'use client'

// Creator-side room wrapper: binds the shared CoCreationRoomShell to this
// app's server actions. Presentational logic lives in @ilaunchify/ui.

import * as React from 'react'
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
  creatorOpenRoomDispute,
  creatorRateMaker,
  creatorComment,
  creatorDeclineMilestoneTerms,
  creatorMessage,
  creatorReopen,
  creatorReview,
  creatorSubmitVersion,
  creatorSwitchMaker,
} from './actions'
import {
  inviteDesignerAction,
  revokeDesignerAction,
  decideDesignReviewAction,
  setAutoApproveAction,
} from './design-team-actions'
// 1:1 floating chats (Pavel 2026-07-13): Members tab starts a DM via the SAME
// action the hub uses; the shell docks the conversation as a mini window.
import { startDmAction } from '../../messages/actions'

export function RoomClient(props: {
  roomId: string
  /** ?object= deep link from a Messages object card — pre-selects that build object. */
  initialObjectId?: string
  rooms: RoomSwitcherEntry[]
  recipeLabels: { version: number; label: RoomRecipeLabelView }[]
  /** Latest self-design LABEL proof (signed URL, mm dims) — pin board renders it. */
  labelProof?: { version: number; url: string; widthMm: number; heightMm: number } | null
  /** "Design the label" Studio deep link — present only when PACKAGING is APPROVED. */
  designLabelHref?: string
  /** Invited-designer seats (Shared Design Workspace C3). */
  designerSeats?: {
    id: string
    email: string
    name: string | null
    role: string
    status: string
    ndaAccepted: boolean
  }[]
  /** C7 — pending internal design review awaiting the creator's decision. */
  designReview?: { id: string; requestedByName: string | null; note: string | null; createdAt: string } | null
  /** Creator's per-room auto-approve for designer submissions. */
  designReviewAutoApprove?: boolean
  /** Tier lock message for the invite input (Maker = 0 seats). */
  designerInviteLocked?: string
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
  /** Room members (viewer excluded) — Members tab + 1:1 floating chats. */
  chatMembers?: { userId: string; name: string; roleLabel: string; side: 'CREATOR' | 'PARTNER' }[]
}) {
  const router = useRouter()
  const refresh = <T extends { ok: boolean }>(p: Promise<T>) =>
    p.then((r) => {
      router.refresh()
      return r
    })

  // Live rail (Pavel 2026-07-13): 15s refresh poll — the rail's Messages tab
  // (and object statuses, activity) stay current without a manual reload.
  // Same cadence as the /messages hub; paused while the tab is hidden.
  React.useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh()
    }, 15000)
    return () => clearInterval(t)
  }, [router])

  return (
    <CoCreationRoomShell
      mode="creator"
      fullScreen
      rooms={props.rooms}
      recipeLabels={props.recipeLabels}
      labelProof={props.labelProof}
      designLabelHref={props.designLabelHref}
      designerSeats={props.designerSeats}
      onInviteDesigner={(email) => refresh(inviteDesignerAction(props.roomId, email))}
      onRevokeDesigner={(seatId) => refresh(revokeDesignerAction(props.roomId, seatId))}
      designReview={props.designReview}
      onDecideDesignReview={(requestId, decision, note) =>
        refresh(decideDesignReviewAction(props.roomId, requestId, decision, note))
      }
      designReviewAutoApprove={props.designReviewAutoApprove}
      onToggleAutoApprove={(enabled) => refresh(setAutoApproveAction(props.roomId, enabled))}
      designerInviteLocked={props.designerInviteLocked}
      briefDomain={props.briefDomain}
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
      chatMembers={props.chatMembers}
      onStartDm={(otherUserId) => startDmAction(props.roomId, otherUserId)}
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
      onOpenDispute={async (description) => {
        const res = await creatorOpenRoomDispute(props.roomId, description)
        if (res.ok && res.ticketId) router.push(`/help/${res.ticketId}`)
        return res
      }}
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
