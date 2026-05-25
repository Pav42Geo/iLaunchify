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

import type { PartnerStatus } from '@prisma/client'

/**
 * Whitelist of partner-status transitions admin may drive.
 *
 * Key = source status; value = list of destinations the admin UI offers.
 *
 * NOT modeled here (handled elsewhere):
 *   - LEAD → IDENTITY_PENDING_REVIEW (partner-driven via submitForReview)
 *   - INVITED → LEAD (partner first-login bootstrap)
 *
 * Verification-section gating (e.g., must have all BUSINESS/DOCUMENTS verified
 * before IDENTITY_VERIFIED) is enforced in the server action, NOT here — this
 * table just lists structurally valid edges.
 */
export const ALLOWED_TRANSITIONS: Partial<Record<PartnerStatus, PartnerStatus[]>> = {
  // Pre-submit — admin can move a stalled lead back to active editing if needed
  LEAD: ['IDENTITY_PENDING_REVIEW', 'TERMINATED'],

  // Identity review
  IDENTITY_PENDING_REVIEW: ['IDENTITY_VERIFIED', 'LEAD', 'TERMINATED'],
  IDENTITY_VERIFIED: ['OPS_PENDING_REVIEW', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],

  // Ops review
  OPS_PENDING_REVIEW: ['OPERATIONALLY_CONFIGURED', 'IDENTITY_VERIFIED', 'TERMINATED'],
  OPERATIONALLY_CONFIGURED: ['ACTIVE', 'OPS_PENDING_REVIEW', 'TERMINATED'],

  // Live
  ACTIVE: ['PAUSED', 'SUSPENDED', 'TERMINATED'],
  INTEGRATION_ENHANCED: ['PAUSED', 'SUSPENDED', 'TERMINATED'],
  PAUSED: ['ACTIVE', 'SUSPENDED', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'TERMINATED'],

  // Terminal
  TERMINATED: [],

  // Legacy bridges (Phase-A rows that pre-date the 10-state model)
  DRAFT: ['IDENTITY_PENDING_REVIEW', 'TERMINATED'],
  INVITED: ['LEAD', 'TERMINATED'],
  IN_PROGRESS: ['IDENTITY_PENDING_REVIEW', 'TERMINATED'],
  UNDER_REVIEW: ['ACTIVE', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],
}

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
 * Verb the admin uses for the action button driving each transition.
 * Picked from the perspective of the admin doing the work.
 */
export function transitionVerb(from: PartnerStatus, to: PartnerStatus): string {
  // Forward-progression transitions
  if (to === 'IDENTITY_VERIFIED') return 'Verify identity'
  if (to === 'OPS_PENDING_REVIEW') return 'Send to ops review'
  if (to === 'OPERATIONALLY_CONFIGURED') return 'Verify operations'
  if (to === 'ACTIVE') {
    if (from === 'SUSPENDED' || from === 'PAUSED') return 'Reinstate'
    return 'Activate partner'
  }
  // Hold + force transitions
  if (to === 'PAUSED') return 'Pause'
  if (to === 'SUSPENDED') return 'Suspend'
  if (to === 'TERMINATED') return 'Terminate'
  // Downgrades (request changes)
  if (to === 'LEAD' || to === 'IDENTITY_PENDING_REVIEW' || to === 'IDENTITY_VERIFIED') {
    return 'Request changes'
  }
  if (to === 'OPS_PENDING_REVIEW') return 'Request changes'
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
