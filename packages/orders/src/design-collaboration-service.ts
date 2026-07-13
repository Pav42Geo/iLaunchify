// Shared Design Workspace — W1 invite/accept/revoke service (C2/C3/C4/D-W5).
// docs/SHARED_DESIGN_WORKSPACE_SPEC.md · D-W1…D-W6 LOCKED 2026-07-13.
//
// CALLERS OWN THE GUARDS (same rule as room-service): the creator app's server
// actions verify room ownership before calling in. What lives here, uniformly:
// seat-cap check (D-W2) → DB write → AuditLog → invite email. The pure
// capability math stays in design-collaboration.ts.
//
// LAUNCH GATE (C1): access remains dead until the designer NDA publishes in
// the Legal CMS — evaluateCollaboratorAccess denies everything while
// ndaAcceptedAt is null, so shipping this dark is safe by construction.

import { randomBytes } from 'crypto'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import {
  sendTransactionalEmail,
  renderEmailHtml,
  renderEmailText,
} from '@ilaunchify/notifications'
import { designerSeatCap } from '@ilaunchify/plans'
import {
  canGrantDesignerSeat,
  evaluateCollaboratorAccess,
  type CollaboratorAccess,
  type CollaboratorRole,
} from './design-collaboration'

export const DESIGNER_INVITE_TTL_DAYS = 14 // D-W5

type Actor = { id: string; role: 'ADMIN' | 'CREATOR' | 'PARTNER' | 'DESIGNER' }
export type SeatResult = { ok: true } | { ok: false; error: string }

export interface DesignerSeatView {
  id: string
  email: string
  name: string | null
  role: CollaboratorRole
  status: string
  ndaAccepted: boolean
  createdAt: string
}

/** Seats shown on the room's Design team card (newest first). */
export async function listRoomDesignerSeats(roomId: string): Promise<DesignerSeatView[]> {
  const rows = await prisma.designCollaborator.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const users = await prisma.user.findMany({
    where: { id: { in: rows.flatMap((r) => (r.userId ? [r.userId] : [])) } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(users.map((u) => [u.id, u.name]))
  return rows.map((r) => ({
    id: r.id,
    email: r.invitedEmail,
    name: r.userId ? (nameOf.get(r.userId) ?? null) : null,
    role: r.role as CollaboratorRole,
    status: r.status,
    ndaAccepted: !!r.ndaAcceptedAt,
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Invite a designer to a room's label design (creator-only — D-W2; the calling
 * action verified room ownership + passes the creator's tier for the seat cap).
 */
export async function inviteDesigner(input: {
  actor: Actor
  roomId: string
  creatorUserId: string
  creatorTier: string
  creatorName: string
  briefTitle: string
  email: string
  role?: CollaboratorRole
}): Promise<SeatResult> {
  const address = input.email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))
    return { ok: false, error: 'Enter a valid email address.' }

  // No duplicate live seat for this address in this room.
  const dup = await prisma.designCollaborator.findFirst({
    where: { roomId: input.roomId, invitedEmail: address, status: { in: ['INVITED', 'ACTIVE'] } },
    select: { id: true },
  })
  if (dup) return { ok: false, error: 'That address already has a seat in this room.' }

  // D-W2 seat cap: INVITED + ACTIVE across ALL of this creator's rooms.
  const creatorRooms = await prisma.coCreationRoom.findMany({
    where: { brief: { creator: { userId: input.creatorUserId } } },
    select: { id: true },
  })
  const occupiedSeats = await prisma.designCollaborator.count({
    where: {
      roomId: { in: creatorRooms.map((r) => r.id) },
      status: { in: ['INVITED', 'ACTIVE'] },
    },
  })
  const capCheck = canGrantDesignerSeat({
    cap: designerSeatCap(input.creatorTier),
    occupiedSeats,
  })
  if (!capCheck.ok) return capCheck

  const token = randomBytes(24).toString('base64url')
  const seat = await prisma.designCollaborator.create({
    data: {
      roomId: input.roomId,
      invitedByUserId: input.actor.id,
      invitedEmail: address,
      role: input.role ?? 'EDIT',
      token,
      tokenExpiresAt: new Date(Date.now() + DESIGNER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  })

  await logAuditAs(input.actor, {
    entityType: 'DesignCollaborator',
    entityId: seat.id,
    action: 'DESIGNER_SEAT_INVITED',
    payload: { roomId: input.roomId, email: address, role: input.role ?? 'EDIT' },
  })

  const host = process.env.CREATOR_LOGIN_HOST ?? 'http://localhost:3000'
  const emailContent = {
    title: `${input.creatorName} invited you to design a label on iLaunchify`,
    body:
      `You've been invited to collaborate on the label design for “${input.briefTitle}”. ` +
      `The workspace is scoped to this one design — you'll review and accept a designer ` +
      `agreement before anything opens. This link is valid for ${DESIGNER_INVITE_TTL_DAYS} days. ` +
      `If you don't have an iLaunchify account yet, sign in with this email address (${address}) and one will be created.`,
    preheader: `${input.creatorName} invited you to a label design workspace`,
    cta: { label: 'Accept invitation', url: `${host}/design-invite/${token}` },
  }
  await sendTransactionalEmail({
    to: address,
    subject: `${input.creatorName} invited you to a design workspace on iLaunchify`,
    html: renderEmailHtml(emailContent),
    text: renderEmailText(emailContent),
  }).catch(() => {}) // seat row exists either way; creator can revoke + re-invite

  return { ok: true }
}

/** Revoke a seat (creator anytime — D-W5). */
export async function revokeDesignerSeat(input: {
  actor: Actor
  roomId: string
  seatId: string
  reason?: string
}): Promise<SeatResult> {
  const seat = await prisma.designCollaborator.findFirst({
    where: { id: input.seatId, roomId: input.roomId, status: { in: ['INVITED', 'ACTIVE'] } },
    select: { id: true, invitedEmail: true },
  })
  if (!seat) return { ok: false, error: 'Seat not found.' }

  await prisma.designCollaborator.update({
    where: { id: seat.id },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedByUserId: input.actor.id,
      revokedReason: input.reason?.trim().slice(0, 300) || null,
    },
  })
  await logAuditAs(input.actor, {
    entityType: 'DesignCollaborator',
    entityId: seat.id,
    action: 'DESIGNER_SEAT_REVOKED',
    payload: { roomId: input.roomId, email: seat.invitedEmail, reason: input.reason ?? null },
  })
  return { ok: true }
}

/**
 * D-W5 auto-revoke: all live seats in a room die when the LABEL is approved or
 * the room closes/switches. One audit row summarizes the sweep.
 */
export async function autoRevokeRoomDesigners(
  actor: Actor,
  roomId: string,
  reason: 'LABEL_APPROVED' | 'ROOM_CLOSED',
): Promise<void> {
  const live = await prisma.designCollaborator.findMany({
    where: { roomId, status: { in: ['INVITED', 'ACTIVE'] } },
    select: { id: true },
  })
  if (live.length === 0) return
  await prisma.designCollaborator.updateMany({
    where: { id: { in: live.map((s) => s.id) } },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason },
  })
  await logAuditAs(actor, {
    entityType: 'CoCreationRoom',
    entityId: roomId,
    action: 'DESIGNER_SEATS_AUTO_REVOKED',
    payload: { reason, count: live.length },
  })
}

/**
 * Accept an invite (signed-in user). Email must match the invite. D-W1: a
 * fresh account with no creator/partner footprint becomes a minimal DESIGNER;
 * existing creators/partners keep their role — the seat row alone grants the
 * scoped access.
 */
export async function acceptDesignerInvite(
  user: { id: string; email: string; role: string },
  token: string,
): Promise<
  | { ok: true; roomId: string; seatId: string; ndaAccepted: boolean }
  | { ok: false; error: string }
> {
  const seat = await prisma.designCollaborator.findUnique({ where: { token } })
  if (!seat || seat.status === 'REVOKED') return { ok: false, error: 'This invitation is no longer valid.' }
  if (seat.status === 'ACTIVE' && seat.userId === user.id) {
    return { ok: true, roomId: seat.roomId, seatId: seat.id, ndaAccepted: !!seat.ndaAcceptedAt }
  }
  if (seat.status !== 'INVITED') return { ok: false, error: 'This invitation is no longer valid.' }
  if (seat.tokenExpiresAt.getTime() < Date.now()) {
    await prisma.designCollaborator.update({ where: { id: seat.id }, data: { status: 'EXPIRED' } })
    return { ok: false, error: 'This invitation has expired — ask for a new one.' }
  }
  if (seat.invitedEmail !== user.email.trim().toLowerCase()) {
    return { ok: false, error: `This invitation was sent to ${seat.invitedEmail} — sign in with that address.` }
  }

  await prisma.designCollaborator.update({
    where: { id: seat.id },
    data: { status: 'ACTIVE', userId: user.id },
  })

  // D-W1 role flip — ONLY for accounts with no platform footprint.
  if (user.role === 'CREATOR') {
    const [profile, membership] = await Promise.all([
      prisma.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
      prisma.partnerMembership.findFirst({ where: { userId: user.id }, select: { id: true } }),
    ])
    if (!profile && !membership) {
      await prisma.user.update({ where: { id: user.id }, data: { role: 'DESIGNER' } })
    }
  }

  await logAuditAs({ id: user.id, role: 'DESIGNER' }, {
    entityType: 'DesignCollaborator',
    entityId: seat.id,
    action: 'DESIGNER_SEAT_ACCEPTED',
    payload: { roomId: seat.roomId },
  })
  return { ok: true, roomId: seat.roomId, seatId: seat.id, ndaAccepted: !!seat.ndaAcceptedAt }
}

/** Stamp the NDA acceptance on the seat (the app action records the LegalAcceptance). */
export async function markSeatNdaAccepted(seatId: string, userId: string): Promise<SeatResult> {
  const seat = await prisma.designCollaborator.findFirst({
    where: { id: seatId, userId, status: 'ACTIVE' },
    select: { id: true, ndaAcceptedAt: true },
  })
  if (!seat) return { ok: false, error: 'Seat not found.' }
  if (!seat.ndaAcceptedAt) {
    await prisma.designCollaborator.update({
      where: { id: seat.id },
      data: { ndaAcceptedAt: new Date() },
    })
  }
  return { ok: true }
}

/**
 * THE guard for the Studio route (Code's slice 3 imports this): resolve a
 * user's live capabilities on a room's design workspace. Room owner (creator)
 * gets full access implicitly; everyone else needs a live seat.
 */
export async function getCollaboratorAccessForUser(
  roomId: string,
  userId: string,
): Promise<CollaboratorAccess & { isOwner: boolean; seatId: string | null }> {
  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    select: { brief: { select: { creator: { select: { userId: true } } } } },
  })
  if (room?.brief.creator.userId === userId) {
    return { isOwner: true, seatId: null, canView: true, canComment: true, canEdit: true, deniedReason: null }
  }
  const seat = await prisma.designCollaborator.findFirst({
    where: { roomId, userId, status: { in: ['INVITED', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
  })
  if (!seat) {
    return { isOwner: false, seatId: null, canView: false, canComment: false, canEdit: false, deniedReason: 'NOT_ACTIVE' }
  }
  return {
    isOwner: false,
    seatId: seat.id,
    ...evaluateCollaboratorAccess({
      status: seat.status as 'INVITED' | 'ACTIVE' | 'REVOKED' | 'EXPIRED',
      role: seat.role as CollaboratorRole,
      ndaAcceptedAt: seat.ndaAcceptedAt,
      tokenExpiresAt: seat.tokenExpiresAt,
      revokedAt: seat.revokedAt,
    }),
  }
}
