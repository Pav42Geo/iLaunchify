// Partner lifecycle FSM — shared core.
//
// Structural fix (2026-07-06): the Partner 10-state transition table used to
// live ONLY in apps/admin/src/lib/partner-fsm.ts, so the partner app's own
// onboarding transitions couldn't reach it and bypassed the FSM entirely. This
// module is the single source of truth for the allowed edges; the admin file now
// re-exports ALLOWED_TRANSITIONS from here (keeping its UI-only helpers local),
// and the partner app imports assertPartnerTransition directly.
//
// Pattern matches assertOrderTransition / assertProductTemplateTransition: pure
// table + guard here; DB update + AuditLog at the call site.
//
// The 10-state model + legacy bridges live in the PartnerStatus enum
// (packages/db/prisma/schema.prisma). docs/PARTNER_ONBOARDING.md §3.

import type { PartnerStatus } from '@ilaunchify/db'

/**
 * Structurally valid partner-status edges. Section-level gating (e.g. all
 * DOCUMENTS verified before IDENTITY_VERIFIED) is enforced in the server action,
 * not here — this table lists the edges that exist at all.
 */
export const PARTNER_ALLOWED_TRANSITIONS: Partial<Record<PartnerStatus, PartnerStatus[]>> = {
  // Pre-submit
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

  // Legacy bridges (Phase-A rows that pre-date the 10-state model). INVITED now
  // also permits IDENTITY_PENDING_REVIEW so a legacy partner submitting
  // onboarding routes to the canonical review state (2026-07-06).
  DRAFT: ['IDENTITY_PENDING_REVIEW', 'TERMINATED'],
  INVITED: ['LEAD', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],
  IN_PROGRESS: ['IDENTITY_PENDING_REVIEW', 'TERMINATED'],
  UNDER_REVIEW: ['ACTIVE', 'IDENTITY_PENDING_REVIEW', 'TERMINATED'],
}

export function isPartnerTransitionAllowed(from: PartnerStatus, to: PartnerStatus): boolean {
  return PARTNER_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid partner-status change. Call at the top of any
 * action that flips Partner.status, then do the DB update + AuditLog.
 */
export function assertPartnerTransition(from: PartnerStatus, to: PartnerStatus): void {
  if (from === to) return
  if (!isPartnerTransitionAllowed(from, to)) {
    throw new Error(`Invalid Partner transition: ${from} → ${to}`)
  }
}
