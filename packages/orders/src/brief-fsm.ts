// Co-creation Brief lifecycle FSM — shared core.
// docs/CO_CREATION_MARKETPLACE_SPEC.md §5. Pure transition tables + guards;
// DB update + AuditLog live at the call site (matches assertPartnerTransition /
// assertNominationTransition). Covers the creator-side ProductBrief lifecycle
// and the per-manufacturer BriefInterest lifecycle — the two move together
// (selection flips one interest to SELECTED, the rest to PASSED, and the brief
// to MATCHED), but each edge is asserted independently at the call site.

import type { BriefStatus, InterestStatus } from '@ilaunchify/db'

/**
 * Structurally valid ProductBrief.status edges.
 *   DRAFT         — creator is still building (either door).
 *   POSTED        — submitted; fit-routing is computing reach.
 *   INTEREST_OPEN — live in the Opportunity Pool; interests accumulate.
 *   SHORTLISTING  — creator is reviewing/starring/comparing.
 *   MATCHED       — one interest SELECTED; NDA + room + escrow being set up.
 *   IN_ROOM       — collaboration room active.
 *   IN_PRODUCTION — order materialized via packages/orders.
 *   COMPLETED / CANCELLED / EXPIRED — terminal.
 *
 * D-CC3 (reversibility — OPEN decision): MATCHED → SHORTLISTING and
 * IN_ROOM → SHORTLISTING are the structural "switch makers before the Sample
 * milestone" edges. They exist in the table so the reversal is expressible,
 * but the server action MUST gate them on D-CC3 confirmation + the Sample
 * milestone not being funded. Do not wire UI to them until D-CC3 is decided.
 */
export const BRIEF_ALLOWED_TRANSITIONS: Partial<Record<BriefStatus, BriefStatus[]>> = {
  DRAFT: ['POSTED', 'CANCELLED'],
  POSTED: ['INTEREST_OPEN', 'CANCELLED', 'EXPIRED'],
  INTEREST_OPEN: ['SHORTLISTING', 'CANCELLED', 'EXPIRED'],
  SHORTLISTING: ['MATCHED', 'CANCELLED', 'EXPIRED'],
  MATCHED: ['IN_ROOM', 'SHORTLISTING', 'CANCELLED'],
  IN_ROOM: ['IN_PRODUCTION', 'SHORTLISTING', 'CANCELLED'],
  IN_PRODUCTION: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
}

export function isBriefTransitionAllowed(from: BriefStatus, to: BriefStatus): boolean {
  return BRIEF_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid brief-status change. Call at the top of any
 * action that flips ProductBrief.status, then do the DB update + AuditLog.
 */
export function assertBriefTransition(from: BriefStatus, to: BriefStatus): void {
  if (from === to) return
  if (!isBriefTransitionAllowed(from, to)) {
    throw new Error(`Invalid ProductBrief transition: ${from} → ${to}`)
  }
}

/**
 * Structurally valid BriefInterest.status edges.
 *   SUBMITTED   — maker raised a hand (fit + terms only, never a formula).
 *   SHORTLISTED — creator starred it (un-star returns to SUBMITTED).
 *   SELECTED    — creator picked this maker (SUBMITTED → SELECTED is legal:
 *                 the prototype allows Select without starring first).
 *   PASSED      — creator chose someone else; the maker is "thanked".
 *   WITHDRAWN   — maker pulled out. Terminal.
 *
 * D-CC3 edges (gate at call site, see above): SELECTED → PASSED (creator
 * switches makers) and PASSED → SHORTLISTED (re-opening the shortlist after
 * a switch). Unused until D-CC3 is decided.
 */
export const INTEREST_ALLOWED_TRANSITIONS: Partial<Record<InterestStatus, InterestStatus[]>> = {
  SUBMITTED: ['SHORTLISTED', 'SELECTED', 'PASSED', 'WITHDRAWN'],
  SHORTLISTED: ['SUBMITTED', 'SELECTED', 'PASSED', 'WITHDRAWN'],
  SELECTED: ['PASSED', 'WITHDRAWN'],
  PASSED: ['SHORTLISTED'],
  WITHDRAWN: [],
}

export function isInterestTransitionAllowed(from: InterestStatus, to: InterestStatus): boolean {
  return INTEREST_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Throws on a structurally invalid interest-status change. Call at the top of
 * any action that flips BriefInterest.status, then do the DB update + AuditLog.
 */
export function assertInterestTransition(from: InterestStatus, to: InterestStatus): void {
  if (from === to) return
  if (!isInterestTransitionAllowed(from, to)) {
    throw new Error(`Invalid BriefInterest transition: ${from} → ${to}`)
  }
}
