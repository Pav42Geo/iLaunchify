'use server'

// Shortlist & Selection server actions (CO_CREATION_MARKETPLACE_SPEC §16 P0,
// prototype screen ③). Ownership guards run server-side (tenant isolation =
// threat #1); every status flip goes through an FSM assert + AuditLog row.
//
// Selection is THE pivotal transaction of the whole feature:
//   brief → SHORTLISTING → MATCHED → IN_ROOM
//   winning interest → SELECTED · every other live interest → PASSED
//   CoCreationRoom created (NDA pending — D-CC4: copy blocked on counsel)
//   4 BuildObjects seeded as DRAFT · Discovery milestone created PENDING
//   (funding/payment-protection flow lands with the payments slice; D-CC1:
//   feeBps snapshot = 0, no platform take on milestones in V1)

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  assertBriefTransition,
  assertInterestTransition,
} from '@ilaunchify/orders'
import { logAuditAs } from '@ilaunchify/audit'
import { dispatchNotification } from '@ilaunchify/notifications'

export type ActionResult = { ok: true; roomId?: string } | { ok: false; error: string }

/** Load a brief ONLY if the acting user owns it. */
async function ownedBrief(userId: string, briefId: string) {
  return prisma.productBrief.findFirst({
    where: { id: briefId, creator: { userId } },
    include: { creator: { select: { id: true, displayName: true } } },
  })
}

/** Star / un-star an interest. First star moves the brief to SHORTLISTING. */
export async function toggleShortlist(briefId: string, interestId: string): Promise<ActionResult> {
  const user = await requireUser()
  const brief = await ownedBrief(user.id, briefId)
  if (!brief) return { ok: false, error: 'Brief not found' }

  const interest = await prisma.briefInterest.findFirst({
    where: { id: interestId, briefId },
    include: { partner: { select: { userId: true, companyName: true } } },
  })
  if (!interest) return { ok: false, error: 'Interest not found' }

  const to = interest.status === 'SHORTLISTED' ? 'SUBMITTED' : 'SHORTLISTED'
  if (interest.status !== 'SUBMITTED' && interest.status !== 'SHORTLISTED') {
    return { ok: false, error: 'This interest can no longer be shortlisted' }
  }
  assertInterestTransition(interest.status, to)

  await prisma.$transaction(async (tx) => {
    await tx.briefInterest.update({ where: { id: interest.id }, data: { status: to } })
    if (to === 'SHORTLISTED' && brief.status === 'INTEREST_OPEN') {
      assertBriefTransition('INTEREST_OPEN', 'SHORTLISTING')
      await tx.productBrief.update({ where: { id: brief.id }, data: { status: 'SHORTLISTING' } })
    }
  })

  await logAuditAs(user, {
    entityType: 'BriefInterest',
    entityId: interest.id,
    action: to === 'SHORTLISTED' ? 'INTEREST_SHORTLISTED' : 'INTEREST_UNSHORTLISTED',
    fromValue: interest.status,
    toValue: to,
    payload: { briefId },
  })

  if (to === 'SHORTLISTED') {
    await dispatchNotification({
      userId: interest.partner.userId,
      event: 'BRIEF_INTEREST_SHORTLISTED',
      audience: 'partner',
      data: { briefTitle: brief.title, creatorName: brief.creator.displayName },
    })
  }

  revalidatePath(`/briefs/${briefId}/interests`)
  return { ok: true }
}

/** The seeded build objects every room starts with (prototype screen ④). */
const SEED_OBJECT_KINDS = ['RECIPE', 'LABEL', 'PACKAGING', 'SAMPLE'] as const

/**
 * Select one maker: open the room, pass everyone else. Reversible before the
 * Sample milestone per the prototype copy — but the reversal edge is gated on
 * D-CC3 (open decision), so V1 treats this as final in the UI.
 */
export async function selectMaker(briefId: string, interestId: string): Promise<ActionResult> {
  const user = await requireUser()
  const brief = await ownedBrief(user.id, briefId)
  if (!brief) return { ok: false, error: 'Brief not found' }
  if (brief.status !== 'INTEREST_OPEN' && brief.status !== 'SHORTLISTING') {
    return { ok: false, error: 'This brief already has a selected maker' }
  }

  const interests = await prisma.briefInterest.findMany({
    where: { briefId },
    include: { partner: { select: { id: true, userId: true, companyName: true } } },
  })
  const winner = interests.find((i) => i.id === interestId)
  if (!winner) return { ok: false, error: 'Interest not found' }
  if (winner.status !== 'SUBMITTED' && winner.status !== 'SHORTLISTED') {
    return { ok: false, error: 'This maker can no longer be selected' }
  }

  // Assert every edge up front (pure guards), then one transaction.
  assertInterestTransition(winner.status, 'SELECTED')
  if (brief.status === 'INTEREST_OPEN') assertBriefTransition('INTEREST_OPEN', 'SHORTLISTING')
  assertBriefTransition('SHORTLISTING', 'MATCHED')
  assertBriefTransition('MATCHED', 'IN_ROOM')

  const losers = interests.filter(
    (i) => i.id !== interestId && (i.status === 'SUBMITTED' || i.status === 'SHORTLISTED'),
  )
  for (const l of losers) assertInterestTransition(l.status, 'PASSED')

  const room = await prisma.$transaction(async (tx) => {
    await tx.briefInterest.update({ where: { id: winner.id }, data: { status: 'SELECTED' } })
    if (losers.length) {
      await tx.briefInterest.updateMany({
        where: { id: { in: losers.map((l) => l.id) } },
        data: { status: 'PASSED' },
      })
    }

    const created = await tx.coCreationRoom.create({
      data: {
        briefId: brief.id,
        partnerId: winner.partner.id,
        status: 'ACTIVE',
        // D-CC4: mutual-NDA e-sign flow is blocked on counsel. ndaSignedAt
        // stays null; the room banner reads "NDA pending" until legal ships.
        ndaSignedAt: null,
        objects: {
          create: SEED_OBJECT_KINDS.map((kind) => ({ kind, status: 'DRAFT' as const })),
        },
        milestones: {
          // Discovery milestone created PENDING. Amount is agreed in-room and
          // funded via the payments slice (separate charges & transfers; copy
          // says "milestone payment protection", never "escrow").
          create: [{ kind: 'DISCOVERY' as const, status: 'PENDING' as const, amount: 0, feeBps: 0 }],
        },
        events: {
          create: [
            {
              kind: 'ROOM_CREATED',
              data: {
                selectedInterestId: winner.id,
                fitScore: winner.fitScore,
                passedCount: losers.length,
              },
            },
          ],
        },
      },
    })

    await tx.productBrief.update({ where: { id: brief.id }, data: { status: 'IN_ROOM' } })
    return created
  })

  // Audit trail — one row per transition (§17 acceptance).
  await logAuditAs(user, {
    entityType: 'BriefInterest',
    entityId: winner.id,
    action: 'INTEREST_SELECTED',
    fromValue: winner.status,
    toValue: 'SELECTED',
    payload: { briefId, roomId: room.id, partnerId: winner.partner.id },
  })
  for (const l of losers) {
    await logAuditAs(user, {
      entityType: 'BriefInterest',
      entityId: l.id,
      action: 'INTEREST_PASSED',
      fromValue: l.status,
      toValue: 'PASSED',
      payload: { briefId },
    })
  }
  await logAuditAs(user, {
    entityType: 'ProductBrief',
    entityId: brief.id,
    action: 'BRIEF_STATUS_CHANGED',
    fromValue: brief.status,
    toValue: 'IN_ROOM',
    payload: { roomId: room.id, selectedPartnerId: winner.partner.id },
  })
  await logAuditAs(user, {
    entityType: 'CoCreationRoom',
    entityId: room.id,
    action: 'ROOM_CREATED',
    payload: { briefId, partnerId: winner.partner.id, seededObjects: [...SEED_OBJECT_KINDS] },
  })

  // Notify the winner + thank the rest (dispatcher never throws).
  await dispatchNotification({
    userId: winner.partner.userId,
    event: 'BRIEF_INTEREST_SELECTED',
    audience: 'partner',
    data: { briefTitle: brief.title, creatorName: brief.creator.displayName, roomId: room.id },
  })
  for (const l of losers) {
    await dispatchNotification({
      userId: l.partner.userId,
      event: 'BRIEF_INTEREST_PASSED',
      audience: 'partner',
      data: { briefTitle: brief.title },
    })
  }

  revalidatePath(`/briefs/${briefId}/interests`)
  return { ok: true, roomId: room.id }
}
