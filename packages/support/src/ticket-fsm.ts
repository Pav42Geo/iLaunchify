// Ticket status FSM + SLA window resolution.
//
// Pure functions only — no Prisma, no I/O. This keeps the legal-transition
// table and SLA math node-verifiable and unit-testable in isolation (mirrors
// packages/orders/src/order-fsm.ts). The service layer (service.ts) calls
// assertTicketTransition() before any DB write.
//
// Status lifecycle (docs/SUPPORT_TICKETING_PLAN.md §2.5):
//   NEW → TRIAGED → IN_PROGRESS → WAITING_ON_REQUESTER → RESOLVED → CLOSED
// with reopen edges (RESOLVED/CLOSED → IN_PROGRESS).

import type { TicketStatus, TicketPriority, TicketEventKind } from '@ilaunchify/db'

/**
 * Legal forward + lateral transitions per status. A transition not listed
 * here throws in assertTicketTransition(). Self-transitions are never legal
 * (a no-op status change is a caller bug, not an FSM move).
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  // Just filed. Admin triages, jumps straight into it, or closes (spam/dupe).
  NEW: ['TRIAGED', 'IN_PROGRESS', 'CLOSED'],
  // Triaged + assigned. Work starts, or admin already has the answer.
  TRIAGED: ['IN_PROGRESS', 'WAITING_ON_REQUESTER', 'RESOLVED', 'CLOSED'],
  // Admin actively working it.
  IN_PROGRESS: ['WAITING_ON_REQUESTER', 'RESOLVED', 'CLOSED'],
  // Admin replied; ball is in the requester's court.
  WAITING_ON_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  // Marked resolved; requester can reopen, or admin closes it out.
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  // Terminal — but a reopen (requester reply / admin reverse) lands in IN_PROGRESS.
  CLOSED: ['IN_PROGRESS'],
}

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false
  return TICKET_TRANSITIONS[from].includes(to)
}

export class TicketTransitionError extends Error {
  constructor(
    public readonly from: TicketStatus,
    public readonly to: TicketStatus,
  ) {
    super(`Illegal ticket transition: ${from} → ${to}`)
    this.name = 'TicketTransitionError'
  }
}

/** Throws TicketTransitionError if the move isn't allowed. */
export function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransitionTicket(from, to)) {
    throw new TicketTransitionError(from, to)
  }
}

/**
 * Which TicketEvent.kind best describes a status move — so the activity log
 * reads naturally ("Resolved", "Reopened") instead of a generic STATUS_CHANGED
 * for the meaningful edges.
 */
export function eventKindForTransition(
  from: TicketStatus,
  to: TicketStatus,
): TicketEventKind {
  if (to === 'RESOLVED') return 'RESOLVED'
  if ((from === 'RESOLVED' || from === 'CLOSED') && to === 'IN_PROGRESS') return 'REOPENED'
  return 'STATUS_CHANGED'
}

/** Terminal = no further replies expected. CLOSED is the only terminal state. */
export function isTerminalStatus(status: TicketStatus): boolean {
  return status === 'CLOSED'
}

/** Statuses that still count against SLA (the open inbox). */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  'NEW',
  'TRIAGED',
  'IN_PROGRESS',
  'WAITING_ON_REQUESTER',
]

// ---------------------------------------------------------------------------
// SLA windows (docs/SUPPORT_TICKETING_PLAN.md §4.1)
// ---------------------------------------------------------------------------

export interface SlaWindow {
  /** Minutes from createdAt to first admin reply. */
  responseMinutes: number
  /** Minutes from createdAt to RESOLVED. */
  resolveMinutes: number
}

/** Priority defaults. Category overrides take precedence when present. */
export const SLA_DEFAULTS: Record<TicketPriority, SlaWindow> = {
  URGENT: { responseMinutes: 60, resolveMinutes: 8 * 60 },
  HIGH: { responseMinutes: 4 * 60, resolveMinutes: 24 * 60 },
  MEDIUM: { responseMinutes: 8 * 60, resolveMinutes: 48 * 60 },
  LOW: { responseMinutes: 24 * 60, resolveMinutes: 5 * 24 * 60 },
}

/**
 * Effective SLA window for a ticket. A category may override either leg
 * independently; a null/undefined override falls back to the priority default.
 */
export function effectiveSlaWindow(
  priority: TicketPriority,
  override?: { slaResponseMinutes?: number | null; slaResolveMinutes?: number | null } | null,
): SlaWindow {
  const base = SLA_DEFAULTS[priority]
  return {
    responseMinutes: override?.slaResponseMinutes ?? base.responseMinutes,
    resolveMinutes: override?.slaResolveMinutes ?? base.resolveMinutes,
  }
}

/**
 * Effective first-response SLA window (minutes) for a ticket, in precedence
 * order: the value stamped on the ticket at intake (tier-aware) → the category
 * override → the priority default. Pure; used by the breach cron.
 */
export function resolveResponseMinutes(
  priority: TicketPriority,
  ticketOverrideMinutes?: number | null,
  categoryOverrideMinutes?: number | null,
): number {
  return ticketOverrideMinutes ?? categoryOverrideMinutes ?? SLA_DEFAULTS[priority].responseMinutes
}

/**
 * Has the first-response SLA elapsed? Pure — caller supplies `now` so cron and
 * tests are deterministic. Once firstResponseAt is set, the response SLA can no
 * longer breach (we met it). Only OPEN tickets are evaluated.
 */
export function isResponseSlaBreached(args: {
  status: TicketStatus
  priority: TicketPriority
  createdAt: Date
  firstResponseAt: Date | null
  override?: { slaResponseMinutes?: number | null; slaResolveMinutes?: number | null } | null
  now: Date
}): boolean {
  if (args.firstResponseAt) return false
  if (!OPEN_STATUSES.includes(args.status)) return false
  const { responseMinutes } = effectiveSlaWindow(args.priority, args.override)
  const deadlineMs = args.createdAt.getTime() + responseMinutes * 60_000
  return args.now.getTime() > deadlineMs
}
