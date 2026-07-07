// Rating Appeal — the fairness layer (docs/MANUFACTURER_MERIT_ENGINE.md Part 5,
// MM-4). A manufacturer contests a rating/defect they believe misjudged them.
// This is the PURE core: the appeal state machine, SLA math, and the
// standing-freeze rule. Prisma writes + the aggregate recompute live in the
// actions; the badge sweep consumes `standingFrozen` to defer demotion.
//
// Design guardrails (from the doc): filing an appeal NEVER silently nulls a
// rating — it FREEZES standing (blocks demotion) while open, and only an admin
// adjudication (EXCLUDE / REATTRIBUTE) removes a rating from the aggregate.
// There is no public "bad" label to contest — appeals are about ratings/standing.

export type RatingAppealStatus =
  | 'SUBMITTED' // manufacturer filed it
  | 'UNDER_REVIEW' // admin picked it up
  | 'UPHELD' // rating stands (no change)
  | 'EXCLUDED' // rating removed from the aggregate
  | 'REATTRIBUTED' // cause routed elsewhere → removed from THIS partner
  | 'WITHDRAWN' // manufacturer backed out

export const OPEN_APPEAL_STATUSES: readonly RatingAppealStatus[] = ['SUBMITTED', 'UNDER_REVIEW']

/** Outcomes that actually change the rating aggregate (trigger a recompute). */
export const AGGREGATE_CHANGING_OUTCOMES: readonly RatingAppealStatus[] = ['EXCLUDED', 'REATTRIBUTED']

const TRANSITIONS: Record<RatingAppealStatus, RatingAppealStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'UPHELD', 'EXCLUDED', 'REATTRIBUTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['UPHELD', 'EXCLUDED', 'REATTRIBUTED', 'WITHDRAWN'],
  UPHELD: [],
  EXCLUDED: [],
  REATTRIBUTED: [],
  WITHDRAWN: [],
}

export function canTransitionAppeal(from: RatingAppealStatus, to: RatingAppealStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function assertAppealTransition(from: RatingAppealStatus, to: RatingAppealStatus): void {
  if (!canTransitionAppeal(from, to)) throw new Error(`Invalid appeal transition: ${from} → ${to}`)
}

export function isOpenAppeal(status: RatingAppealStatus): boolean {
  return OPEN_APPEAL_STATUSES.includes(status)
}

export function outcomeChangesAggregate(status: RatingAppealStatus): boolean {
  return AGGREGATE_CHANGING_OUTCOMES.includes(status)
}

// ---------------------------------------------------------------------------
// Standing freeze — an open appeal that could move standing defers demotion.
// (Promotion is never blocked; freezing only protects a manufacturer from
// losing a badge over a rating they're contesting.)
// ---------------------------------------------------------------------------

/** True when the manufacturer has any OPEN appeal → block demotion this sweep. */
export function standingFrozen(appeals: ReadonlyArray<{ status: RatingAppealStatus }>): boolean {
  return appeals.some((a) => isOpenAppeal(a.status))
}

// ---------------------------------------------------------------------------
// SLA
// ---------------------------------------------------------------------------

export interface AppealSlaPolicy {
  ackDays: number // acknowledge (move to UNDER_REVIEW) within
  resolveDays: number // resolve within
}

/** Defaults — Pavel to confirm at MM-4b. */
export const DEFAULT_APPEAL_SLA: AppealSlaPolicy = { ackDays: 2, resolveDays: 7 }

const DAY_MS = 24 * 60 * 60 * 1000

export function appealDeadlines(
  createdAt: Date,
  policy: AppealSlaPolicy = DEFAULT_APPEAL_SLA,
): { ackBy: Date; resolveBy: Date } {
  return {
    ackBy: new Date(createdAt.getTime() + policy.ackDays * DAY_MS),
    resolveBy: new Date(createdAt.getTime() + policy.resolveDays * DAY_MS),
  }
}

export type AppealSlaState = 'ON_TIME' | 'ACK_OVERDUE' | 'RESOLVE_OVERDUE'

/**
 * SLA health for an OPEN appeal. Resolve-overdue dominates ack-overdue. Resolved
 * appeals return 'ON_TIME' (nothing outstanding).
 */
export function appealSlaState(
  now: Date,
  createdAt: Date,
  acknowledgedAt: Date | null,
  status: RatingAppealStatus,
  policy: AppealSlaPolicy = DEFAULT_APPEAL_SLA,
): AppealSlaState {
  if (!isOpenAppeal(status)) return 'ON_TIME'
  const { ackBy, resolveBy } = appealDeadlines(createdAt, policy)
  if (now.getTime() > resolveBy.getTime()) return 'RESOLVE_OVERDUE'
  if (acknowledgedAt == null && now.getTime() > ackBy.getTime()) return 'ACK_OVERDUE'
  return 'ON_TIME'
}
