// Partner status FSM helpers — shared between the admin partner detail page
// and the server actions that drive transitions.
//
// The 10-state model lives in PartnerStatus enum (packages/db/prisma/schema.prisma):
//
//   LEAD ── partner has signed up; pre-submit
//   IDENTITY_PENDING_REVIEW ── partner submitted Layer 1 (Identity) for verification
//   IDENTITY_VERIFIED ── admin approved Layer 1 (the legal/docs side)
//   OPS_PENDING_REVIEW ── partner submitted Layer 2/3 (Operational) for verification
//   OPERATIONALLY_CONFIGURED ── admin approved Layer 2/3 (capabilities + standards)
//   ACTIVE ── fully approved; can receive orders
//   INTEGRATION_ENHANCED ── ACTIVE + Layer 5 integrations turned on (V1.5+ feature)
//   PAUSED ── admin temporarily paused (e.g., capacity issue); self-recoverable
//   SUSPENDED ── admin force-paused (compliance/quality issue); requires reinstate
//   TERMINATED ── permanent off-boarding; no transitions out
//
// Phase-A legacy values (DRAFT / INVITED / IN_PROGRESS / UNDER_REVIEW) are still in the
// enum for back-compat. Transitions out of them route to the canonical states.
//
// docs/PARTNER_ONBOARDING.md §3 has the full FSM diagram.

import type { PartnerStatus } from '@ilaunchify/db'
// Deep import (not the '@ilaunchify/orders' barrel) — this module is reached from
// the CLIENT PartnerActions.tsx, and the barrel transitively pulls room-service →
// @ilaunchify/notifications → node:crypto (breaks the client bundle in dev). This
// file is pure (transitions constant only). Same pattern as '@ilaunchify/support/ticket-fsm'.
import { PARTNER_ALLOWED_TRANSITIONS } from '@ilaunchify/orders/partner-fsm'

/**
 * Whitelist of partner-status transitions admin may drive.
 *
 * SINGLE SOURCE OF TRUTH moved to packages/orders/src/partner-fsm.ts (2026-07-06)
 * so the partner app's own onboarding transitions can share the same table
 * instead of bypassing the FSM. This re-exports it under the legacy name the
 * admin UI + tests already import. Section-level gating is still enforced in the
 * server action, not here.
 */
export const ALLOWED_TRANSITIONS: Partial<Record<PartnerStatus, PartnerStatus[]>> =
  PARTNER_ALLOWED_TRANSITIONS

/**
 * Human-readable label for each status.
 */
export const STATUS_LABEL: Record<PartnerStatus, string> = {
  LEAD: 'Lead (in onboarding)',
  IDENTITY_PENDING_REVIEW: 'Identity — pending review',
  IDENTITY_VERIFIED: 'Identity verified',
  OPS_PENDING_REVIEW: 'Operations — pending review',
  OPERATIONALLY_CONFIGURED: 'Operationally configured',
  ACTIVE: 'Active',
  INTEGRATION_ENHANCED: 'Active + integrations',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
  // Legacy
  DRAFT: 'Draft (legacy)',
  INVITED: 'Invited (legacy)',
  IN_PROGRESS: 'In progress (legacy)',
  UNDER_REVIEW: 'Under review (legacy)',
}

/**
 * The canonical forward progression ladder. A partner advances down this list
 * during onboarding; admin "request changes" sends them back up it. Off-ladder
 * states (PAUSED / SUSPENDED / TERMINATED) and legacy values are not ranked.
 */
const PROGRESSION_LADDER: PartnerStatus[] = [
  'LEAD',
  'IDENTITY_PENDING_REVIEW',
  'IDENTITY_VERIFIED',
  'OPS_PENDING_REVIEW',
  'OPERATIONALLY_CONFIGURED',
  'ACTIVE',
  'INTEGRATION_ENHANCED',
]

/** Ladder position, or -1 for off-ladder / legacy states. */
function ladderOrdinal(s: PartnerStatus): number {
  return PROGRESSION_LADDER.indexOf(s)
}

/**
 * True when BOTH states are on the ladder and `to` sits earlier than `from` —
 * i.e. the admin is sending the partner backward ("request changes"). This is
 * what lets the helpers below tell a forward arrival at a review state from a
 * backward bounce-back to the same state (e.g. IDENTITY_VERIFIED reached by
 * verifying identity vs. by kicking an ops review back a step).
 */
export function isBackwardTransition(from: PartnerStatus, to: PartnerStatus): boolean {
  const f = ladderOrdinal(from)
  const t = ladderOrdinal(to)
  return f >= 0 && t >= 0 && t < f
}

/**
 * Verb the admin uses for the action button driving each transition.
 * Picked from the perspective of the admin doing the work.
 */
export function transitionVerb(from: PartnerStatus, to: PartnerStatus): string {
  // Holds + terminal are direction-independent — handle first.
  if (to === 'TERMINATED') return 'Terminate'
  if (to === 'SUSPENDED') return 'Suspend'
  if (to === 'PAUSED') return 'Pause'
  if (to === 'ACTIVE') {
    if (from === 'SUSPENDED' || from === 'PAUSED') return 'Reinstate'
    return 'Activate partner'
  }
  // Any backward move down the ladder is a "request changes".
  if (isBackwardTransition(from, to)) return 'Request changes'
  // Forward-progression verbs.
  if (to === 'IDENTITY_VERIFIED') return 'Verify identity'
  if (to === 'OPS_PENDING_REVIEW') return 'Send to ops review'
  if (to === 'OPERATIONALLY_CONFIGURED') return 'Verify operations'
  return `Move to ${STATUS_LABEL[to]}`
}

/**
 * Visual treatment for the action button. Forward = green, backward = amber,
 * destructive = red.
 */
export function transitionVariant(
  to: PartnerStatus,
): 'primary' | 'secondary' | 'destructive' {
  if (to === 'TERMINATED' || to === 'SUSPENDED') return 'destructive'
  if (
    to === 'LEAD' ||
    to === 'IDENTITY_PENDING_REVIEW' ||
    to === 'IDENTITY_VERIFIED' ||
    to === 'OPS_PENDING_REVIEW' ||
    to === 'PAUSED'
  ) {
    return 'secondary'
  }
  return 'primary'
}

/**
 * Returns true if the from→to transition is structurally allowed.
 */
export function isAllowedTransition(from: PartnerStatus, to: PartnerStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// -----------------------------------------------------------------------------
// Action-name + notification mapping. Pure (PartnerStatus → string / event)
// so they live here with the rest of the FSM and are unit-testable. The server
// action in partners/[partnerId]/actions.ts imports both.
// -----------------------------------------------------------------------------

/** AuditLog `action` string for a transition (direction-aware). */
export function auditActionForTransition(from: PartnerStatus, to: PartnerStatus): string {
  // Holds + terminal first (direction-independent).
  if (to === 'TERMINATED') return 'PARTNER_TERMINATE'
  if (to === 'SUSPENDED') return 'PARTNER_SUSPEND'
  if (to === 'PAUSED') return 'PARTNER_PAUSE'
  if (to === 'ACTIVE') {
    if (from === 'SUSPENDED' || from === 'PAUSED') return 'PARTNER_REINSTATE'
    return 'PARTNER_ACTIVATE'
  }
  // Any backward move down the ladder = request changes (covers the backward
  // arrivals at IDENTITY_VERIFIED / OPS_PENDING_REVIEW that used to be
  // mislabeled as forward verifications).
  if (isBackwardTransition(from, to)) return 'PARTNER_REQUEST_CHANGES'
  // Forward-progression actions.
  if (to === 'IDENTITY_VERIFIED') return 'PARTNER_VERIFY_IDENTITY'
  if (to === 'OPS_PENDING_REVIEW') return 'PARTNER_SEND_TO_OPS_REVIEW'
  if (to === 'OPERATIONALLY_CONFIGURED') return 'PARTNER_VERIFY_OPS'
  return 'PARTNER_STATUS_CHANGE'
}

/** Partner-facing notification event for a transition, or null for no email. */
export function notificationEventForTransition(
  from: PartnerStatus,
  to: PartnerStatus,
): 'PARTNER_ACTIVATED' | 'SECTION_NEEDS_CHANGES' | 'SECTION_VERIFIED' | null {
  if (to === 'ACTIVE') return 'PARTNER_ACTIVATED'
  // Backward down the ladder = a "needs changes" bounce-back. This is the fix
  // for the forward-vs-backward conflation: a forward arrival at
  // IDENTITY_VERIFIED now correctly falls through to SECTION_VERIFIED below,
  // while a backward bounce from OPS_PENDING_REVIEW lands here.
  if (isBackwardTransition(from, to)) return 'SECTION_NEEDS_CHANGES'
  // Forward approval of a review layer.
  if (to === 'IDENTITY_VERIFIED' || to === 'OPERATIONALLY_CONFIGURED') {
    return 'SECTION_VERIFIED'
  }
  // Forward → OPS_PENDING_REVIEW (and anything else) sends no partner email —
  // none of the three existing events fit an "advanced to ops review" moment.
  return null
}
