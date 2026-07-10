// Co-creation Room FSMs — shared core.
// docs/CO_CREATION_MARKETPLACE_SPEC.md §5. Pure transition tables + guards;
// DB update + AuditLog live at the call site (matches assertPartnerTransition).
// Covers the three room-scoped lifecycles: BuildObject (recipe / label /
// packaging / sample / spec sheet), CoCreationRoom itself, and RoomMilestone
// (escrow). Milestone release is COUPLED to object approval at the call site
// (approve recipe → release the tied milestone) — the coupling is server-action
// logic, not encoded here.

import type { BuildObjectStatus, MilestoneStatus, RoomStatus } from '@ilaunchify/db'

/**
 * Structurally valid BuildObject.status edges (§5):
 *   DRAFT → SUBMITTED → IN_REVIEW → (CHANGES_REQUESTED ⇄ SUBMITTED) → APPROVED → LOCKED
 * Re-open sends APPROVED/LOCKED → IN_REVIEW (any change to a locked object
 * re-opens review — see the prototype's Packaging card).
 * The demo's "shipping" state on SAMPLE is a derived display state, NOT an
 * enum value — track shipment via packages/shipping, render from that.
 */
export const BUILD_OBJECT_ALLOWED_TRANSITIONS: Partial<
  Record<BuildObjectStatus, BuildObjectStatus[]>
> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['IN_REVIEW'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED'],
  CHANGES_REQUESTED: ['SUBMITTED'],
  APPROVED: ['LOCKED', 'IN_REVIEW'],
  LOCKED: ['IN_REVIEW'],
}

export function isBuildObjectTransitionAllowed(
  from: BuildObjectStatus,
  to: BuildObjectStatus,
): boolean {
  return BUILD_OBJECT_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid build-object status change. Call at the top
 * of any action that flips BuildObject.status, then do the DB update + AuditLog
 * (+ RoomEvent decision-log row — the room's dispute evidence trail).
 */
export function assertBuildObjectTransition(
  from: BuildObjectStatus,
  to: BuildObjectStatus,
): void {
  if (from === to) return
  if (!isBuildObjectTransitionAllowed(from, to)) {
    throw new Error(`Invalid BuildObject transition: ${from} → ${to}`)
  }
}

/**
 * Structurally valid CoCreationRoom.status edges.
 *   ACTIVE ⇄ PAUSED; either can close. CLOSED_WON materializes the approved
 *   RECIPE payload into Recipe/RecipeIngredient + an Order draft (§6 "reuse,
 *   don't duplicate"); CLOSED_CANCELLED is the walk-away path. Both terminal.
 */
export const ROOM_ALLOWED_TRANSITIONS: Partial<Record<RoomStatus, RoomStatus[]>> = {
  ACTIVE: ['PAUSED', 'CLOSED_WON', 'CLOSED_CANCELLED'],
  PAUSED: ['ACTIVE', 'CLOSED_CANCELLED'],
  CLOSED_WON: [],
  CLOSED_CANCELLED: [],
}

export function isRoomTransitionAllowed(from: RoomStatus, to: RoomStatus): boolean {
  return ROOM_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/** Throws on a structurally invalid room-status change. */
export function assertRoomTransition(from: RoomStatus, to: RoomStatus): void {
  if (from === to) return
  if (!isRoomTransitionAllowed(from, to)) {
    throw new Error(`Invalid CoCreationRoom transition: ${from} → ${to}`)
  }
}

/**
 * Structurally valid RoomMilestone.status edges (escrow via packages/payments).
 *   PENDING → FUNDED_ESCROW → RELEASED | REFUNDED | DISPUTED
 *   DISPUTED resolves to RELEASED or REFUNDED (admin adjudication; the
 *   RoomEvent log is the evidence trail). RELEASED/REFUNDED terminal.
 * Funds move only through packages/payments — never flip these statuses
 * without the corresponding Stripe action.
 */
export const MILESTONE_ALLOWED_TRANSITIONS: Partial<
  Record<MilestoneStatus, MilestoneStatus[]>
> = {
  PENDING: ['FUNDED_ESCROW'],
  FUNDED_ESCROW: ['RELEASED', 'REFUNDED', 'DISPUTED'],
  DISPUTED: ['RELEASED', 'REFUNDED'],
  RELEASED: [],
  REFUNDED: [],
}

export function isMilestoneTransitionAllowed(
  from: MilestoneStatus,
  to: MilestoneStatus,
): boolean {
  return MILESTONE_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/** Throws on a structurally invalid milestone-status change. */
export function assertMilestoneTransition(from: MilestoneStatus, to: MilestoneStatus): void {
  if (from === to) return
  if (!isMilestoneTransitionAllowed(from, to)) {
    throw new Error(`Invalid RoomMilestone transition: ${from} → ${to}`)
  }
}
