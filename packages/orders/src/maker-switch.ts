// D-CC3 maker-switch cutoff engine (Pavel 2026-07-10, expanded same day).
// PURE — the server action and the room page both evaluate the same logic, so
// the button never shows when the action would refuse. Runs in
// run-vitest-suites.mjs.
//
// Invariant across ALL policies: once ANY milestone has funded, switching is
// closed — from there it's a support/dispute path, never a one-click swap.
// The policy picks an (optionally EARLIER) additional cutoff:
//
//   DISABLED               selection is final
//   WITHIN_GRACE_DAYS      only the first N days after the room opened
//   UNTIL_NDA_SIGNED       closes when the mutual NDA signs (IP exposure point)
//   UNTIL_FIRST_SUBMISSION closes when the maker submits ANY object version
//                          (they've done real work, even unpaid)
//   UNTIL_TERMS_AGREED     closes when any milestone terms are AGREED
//                          (commercial commitment point)
//   UNTIL_RECIPE_APPROVED  closes when the creator approves the recipe
//   UNTIL_FUNDED           loosest — only the money backstop applies

export const MAKER_SWITCH_POLICIES = [
  'DISABLED',
  'WITHIN_GRACE_DAYS',
  'UNTIL_NDA_SIGNED',
  'UNTIL_FIRST_SUBMISSION',
  'UNTIL_TERMS_AGREED',
  'UNTIL_RECIPE_APPROVED',
  'UNTIL_FUNDED',
] as const

export type MakerSwitchPolicy = (typeof MAKER_SWITCH_POLICIES)[number]

export interface MakerSwitchFacts {
  roomStatus: string
  roomCreatedAt: Date
  ndaSignedAt: Date | null
  /** Statuses of every milestone in the room. */
  milestoneStatuses: string[]
  /** termsStatus of every milestone (UNSET/PROPOSED/AGREED). */
  milestoneTermsStatuses: string[]
  /** Current RECIPE object status, if the object exists. */
  recipeStatus: string | null
  /** true when ANY build object has ≥1 submitted version. */
  hasAnySubmission: boolean
  /** Archived (non-ACTIVE) rooms this brief already has = past switches. */
  priorRooms: number
}

export interface MakerSwitchVerdict {
  allowed: boolean
  /** Human-readable refusal (creator-facing copy). Empty when allowed. */
  reason: string
}

export function evaluateMakerSwitch(
  settings: { policy: string; graceDays: number; maxSwitches: number },
  facts: MakerSwitchFacts,
  now: Date = new Date(),
): MakerSwitchVerdict {
  if (facts.roomStatus !== 'ACTIVE') {
    return { allowed: false, reason: 'This room is no longer active' }
  }
  if (settings.policy === 'DISABLED') {
    return { allowed: false, reason: 'Maker switching is disabled — contact support if the room is stuck' }
  }
  // Hard backstop, every policy: money moved ⇒ dispute path.
  if (facts.milestoneStatuses.some((s) => s !== 'PENDING')) {
    return {
      allowed: false,
      reason: 'A milestone has already funded — switching now goes through support, not a one-click swap',
    }
  }
  if (settings.maxSwitches > 0 && facts.priorRooms >= settings.maxSwitches) {
    return {
      allowed: false,
      reason: `This brief already switched ${facts.priorRooms} time${facts.priorRooms === 1 ? '' : 's'} — the limit is ${settings.maxSwitches}`,
    }
  }

  switch (settings.policy) {
    case 'WITHIN_GRACE_DAYS': {
      const ageMs = now.getTime() - facts.roomCreatedAt.getTime()
      if (settings.graceDays > 0 && ageMs > settings.graceDays * 24 * 3_600_000) {
        return {
          allowed: false,
          reason: `The ${settings.graceDays}-day switch window after the room opened has passed`,
        }
      }
      return { allowed: true, reason: '' }
    }
    case 'UNTIL_NDA_SIGNED':
      return facts.ndaSignedAt
        ? { allowed: false, reason: 'The mutual NDA is signed — switching closed under the current policy' }
        : { allowed: true, reason: '' }
    case 'UNTIL_FIRST_SUBMISSION':
      return facts.hasAnySubmission
        ? { allowed: false, reason: 'The maker has already submitted work — switching closed under the current policy' }
        : { allowed: true, reason: '' }
    case 'UNTIL_TERMS_AGREED':
      return facts.milestoneTermsStatuses.includes('AGREED')
        ? { allowed: false, reason: 'Milestone terms are agreed — switching closed under the current policy' }
        : { allowed: true, reason: '' }
    case 'UNTIL_RECIPE_APPROVED':
      return facts.recipeStatus === 'APPROVED' || facts.recipeStatus === 'LOCKED'
        ? { allowed: false, reason: 'The recipe is approved — switching closed under the current policy' }
        : { allowed: true, reason: '' }
    case 'UNTIL_FUNDED':
    default:
      // Money backstop already checked above.
      return { allowed: true, reason: '' }
  }
}
