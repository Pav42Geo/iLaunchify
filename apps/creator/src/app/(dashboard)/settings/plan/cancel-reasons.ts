// Cancellation P0 — shared reason taxonomy for the cancel modal + server action.
// (docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md §3.3)
//
// Lives outside actions.ts because 'use server' modules may only export async
// functions. Codes mirror the Prisma TierCancelReason enum 1:1 — append new
// codes at the bottom of BOTH, never rename (analytics continuity). Each code
// routes to a different retention strategy when the P1 save-flow lands.

export const TIER_CANCEL_REASONS = [
  { code: 'TOO_EXPENSIVE', label: 'It costs more than the value I get' },
  { code: 'NOT_USING', label: 'I am not using it enough right now' },
  { code: 'MISSING_FEATURE', label: 'A feature I need is missing' },
  { code: 'SWITCHING', label: 'I am switching to another platform' },
  { code: 'TEMPORARY', label: 'Pausing my business for a while' },
  { code: 'OTHER', label: 'Something else' },
] as const

export type TierCancelReasonCode =
  (typeof TIER_CANCEL_REASONS)[number]['code']

export function isTierCancelReasonCode(
  value: string,
): value is TierCancelReasonCode {
  return TIER_CANCEL_REASONS.some((r) => r.code === value)
}

/** Hard cap mirrored by the schema's @db.String(2000) on reasonText. */
export const REASON_TEXT_MAX_LENGTH = 2000
